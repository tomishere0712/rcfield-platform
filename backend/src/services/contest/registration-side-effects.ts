import { Not } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { logger } from '../../config/logger';
import { ContestMatch } from '../../models/contest-match.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import {
  ContestMatchStatus,
  ContestRegistrationStatus,
  NotificationType,
  VehicleSource,
} from '../../types';
import { createNotification } from '../notification.service';
import { writeContestAudit } from '../contest.helpers';
import { emailService } from '../email.service';

export async function loadContestNotificationContext(registration: ContestRegistration) {
  const [row] = await AppDataSource.query<
    {
      contest_name: string;
      contest_starts_at: string;
      contest_status: string;
      branch_name: string | null;
      branch_address: string | null;
      customer_email: string;
      customer_name: string;
      check_in_code: string | null;
      entry_fee_due_at: string | null;
      rental_catalog_name: string | null;
    }[]
  >(
    `SELECT c.name AS contest_name,
            c.starts_at AS contest_starts_at,
            c.status AS contest_status,
            COALESCE(rental_cafe.name, host.name) AS branch_name,
            COALESCE(rental_cafe.address, host.address) AS branch_address,
            u.email AS customer_email,
            u.full_name AS customer_name,
            cr.check_in_code,
            cr.entry_fee_due_at,
            vc.name AS rental_catalog_name
       FROM contest_registrations cr
       JOIN contests c ON c.id = cr.contest_id
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN cafes host ON host.id = c.cafe_id
       LEFT JOIN cafes rental_cafe ON rental_cafe.id = cr.rental_cafe_id
       LEFT JOIN vehicle_catalogs vc ON vc.id = cr.rental_catalog_id
      WHERE cr.id = $1`,
    [registration.id],
  );

  if (!row) return null;

  // Xe thi đấu: dòng xe đã chọn nếu thuê của quán, còn BYOC thì lấy tên xe khách khai.
  const byocDeclaration = registration.metadata?.byoc_declaration as
    | { vehicle_name?: string | null }
    | undefined;
  const vehicleLabel =
    row.rental_catalog_name ??
    (byocDeclaration?.vehicle_name ? `${byocDeclaration.vehicle_name} (xe cá nhân)` : null);

  return {
    contestName: row.contest_name,
    contestStartsAt: new Date(row.contest_starts_at),
    contestStatus: row.contest_status,
    branchName: row.branch_name,
    branchAddress: row.branch_address,
    customerEmail: row.customer_email,
    customerName: row.customer_name ?? 'Racer',
    checkInCode: row.check_in_code,
    entryFeeDueAt: row.entry_fee_due_at ? new Date(row.entry_fee_due_at) : null,
    vehicleLabel,
  };
}

/**
 * Khi vừa gửi đăng ký.
 *
 * Chỉ gửi email khi còn lệ phí phải trả, và email đó nói rõ là "đã nhận đăng ký",
 * không phải "thành công": lúc này khách chưa trả tiền và ban tổ chức chưa duyệt.
 * Giải miễn phí thì im lặng chờ tới lúc được duyệt mới gửi — email duy nhất đáng
 * gửi là email mang mã check-in.
 */
export async function sendContestRegistrationCreatedSideEffects(registration: ContestRegistration) {
  const context = await loadContestNotificationContext(registration);
  if (!context) return;

  await createNotification(
    registration.userId,
    NotificationType.CONTEST_REGISTRATION_CREATED,
    'Đã nhận đăng ký giải đấu',
    `RCField đã nhận đăng ký ${context.contestName} của bạn. Ban tổ chức sẽ duyệt và báo lại cho bạn.`,
    {
      contest_id: registration.contestId,
      registration_id: registration.id,
    },
  );

  const entryFee = Number(registration.entryFeeAmount ?? 0);
  if (entryFee <= 0) return;

  try {
    await emailService.sendContestRegistrationPendingPayment({
      to: context.customerEmail,
      customerName: context.customerName,
      contestName: context.contestName,
      contestId: registration.contestId,
      hostBranchName: context.branchName,
      startsAt: context.contestStartsAt,
      entryFeeAmount: entryFee,
      entryFeeDueAt: context.entryFeeDueAt,
    });
  } catch (error) {
    logger.error('ContestEmail', 'failed to send registration pending-payment email', error);
  }
}

/**
 * Khi ban tổ chức duyệt đăng ký — suất thi đấu đã chắc chắn.
 *
 * Đây là email mang mã check-in, địa chỉ và giờ thi đấu: những thứ VĐV thực sự
 * cần cầm theo trong ngày thi.
 */
export async function sendContestRegistrationApprovedEmail(registration: ContestRegistration) {
  const context = await loadContestNotificationContext(registration);
  if (!context) return;

  try {
    await emailService.sendContestRegistrationApproved({
      to: context.customerEmail,
      customerName: context.customerName,
      contestName: context.contestName,
      contestId: registration.contestId,
      hostBranchName: context.branchName,
      hostBranchAddress: context.branchAddress,
      startsAt: context.contestStartsAt,
      checkInCode: context.checkInCode,
      vehicleLabel: context.vehicleLabel,
    });
  } catch (error) {
    logger.error('ContestEmail', 'failed to send registration approved email', error);
  }
}

export async function sendContestRegistrationStatusNotification(
  registration: ContestRegistration,
  type: NotificationType,
  title: string,
  message: string,
) {
  await createNotification(registration.userId, type, title, message, {
    contest_id: registration.contestId,
    registration_id: registration.id,
  });
}
export async function cleanUpContestOnCancel(contestId: string, actorId: string) {
  const registrationRepo = AppDataSource.getRepository(ContestRegistration);
  const registrations = await registrationRepo.find({
    where: { contestId, status: Not(ContestRegistrationStatus.CANCELLED) },
  });

  for (const registration of registrations) {
    registration.status = ContestRegistrationStatus.CANCELLED;
    registration.cancelledBy = actorId;
    registration.cancelledAt = new Date();
    registration.cancellationReason = 'Contest cancelled';
    /*
      Bỏ cờ `refund_needed` từng ghi ở đây.

      Nó được ghi vào metadata rồi KHÔNG NƠI NÀO đọc — không màn hình, không báo
      cáo, không thông báo. Một cái cờ như vậy tệ hơn là không có: nó tạo cảm
      giác nghĩa vụ hoàn tiền đã được hệ thống ghi nhận, trong khi thực tế nó
      nằm im trong một cột jsonb không ai mở ra.

      Giờ `assertNoCollectedEntryFees` chặn hẳn việc huỷ giải khi còn tiền đã
      thu, nên tới được đây nghĩa là không còn ai cần hoàn — cờ đó vĩnh viễn
      bằng false.
    */
    await registrationRepo.save(registration);
  }

  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const matches = await matchRepo.find({ where: { contestId } });
  for (const match of matches) {
    if (match.status === ContestMatchStatus.CANCELLED) continue;
    match.status = ContestMatchStatus.CANCELLED;
    match.endedAt = match.endedAt ?? new Date();
    await matchRepo.save(match);
  }
}

/**
 * Tự động xác nhận đăng ký thuê xe của quán.
 *
 * Bước duyệt thủ công sinh ra để provider xem BẢN KHAI XE của người mang xe cá
 * nhân — có đúng hạng thi hay không. VĐV thuê xe của quán thì không có gì để
 * xem: xe là xe của quán. Mọi thứ khác đã được chặn tự động ngay lúc đăng ký
 * (ban, sức chứa giải, suất dòng xe), còn lệ phí có trạng thái riêng.
 *
 * Nên với RENTAL, nút Duyệt chỉ là một cú bấm bắt buộc không đổi kết quả — và
 * quên bấm thì khách đã trả tiền vẫn không có mã check-in.
 *
 * Gọi hàm này sau mỗi lần lệ phí ngã ngũ. Không làm gì với BYOC.
 */
export async function autoConfirmRentalRegistration(registrationId: string): Promise<void> {
  const repo = AppDataSource.getRepository(ContestRegistration);
  const registration = await repo.findOne({ where: { id: registrationId } });
  if (!registration) return;
  if (registration.vehicleSource !== VehicleSource.RENTAL) return;
  // Atomic: nếu provider vừa bấm Duyệt/Từ chối cùng lúc thì không ghi đè.
  const updated = await repo.update(
    { id: registration.id },
    {
      status: ContestRegistrationStatus.CONFIRMED,
      cancelledAt: null,
      cancellationReason: null,
    },
  );
  if (!updated.affected) return;

  registration.status = ContestRegistrationStatus.CONFIRMED;
  registration.cancelledAt = null;
  registration.cancellationReason = null;

  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: null,
    actorRole: 'SYSTEM',
    eventType: 'registration.approved',
    afterJson: { status: ContestRegistrationStatus.CONFIRMED },
    reason: 'Tự động xác nhận: thuê xe của quán, lệ phí đã xử lý',
    metadata: { auto_confirmed: true, vehicle_source: registration.vehicleSource },
  });

  await sendContestRegistrationStatusNotification(
    registration,
    NotificationType.CONTEST_REGISTRATION_APPROVED,
    'Bạn đã có suất thi đấu',
    'Đăng ký của bạn đã được xác nhận. Kiểm tra email để lấy mã check-in và địa điểm thi đấu.',
  );
  await sendContestRegistrationApprovedEmail(registration);
}
