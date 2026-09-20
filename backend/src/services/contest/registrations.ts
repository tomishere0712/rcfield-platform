import { Not } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { logger } from '../../config/logger';
import { Booking } from '../../models/booking.entity';
import { ContestCafe } from '../../models/contest-cafe.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import { PaymentTransaction } from '../../models/payment-transaction.entity';
import {
  AppError,
  BookingStatus,
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  ContestStatus,
  NotificationType,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
  UserRole,
  VehicleSource,
} from '../../types';
import {
  getActiveContestBan,
  getContestOrThrow,
  isStaffAssignedToCafe,
  isStaffAssignedToContest,
  writeContestAudit,
} from '../contest.helpers';
import { Viewer } from '../cafe.service';
import { createPaymentUrl } from '../vnpay.service';
import { env } from '../../config/env';
import { processMockConfirmation } from '../payment.service';
import {
  assertContestRentalCatalogHasSlot,
  createContestVehicleHandover,
  listContestHandoverUnits,
  resolveContestRentalChoice,
} from '../contest-rental.service';
import { transition } from '../booking.service';
import { mapContestRegistrationsPayload } from './payload';
import {
  assertContestProviderOrAssignedStaff,
  buildByocMetadata,
  generateUniqueCheckInCode,
  removeRegistrationFromActiveMatches,
} from './guards';
import {
  autoConfirmRentalRegistration,
  sendContestRegistrationApprovedEmail,
  sendContestRegistrationCreatedSideEffects,
  sendContestRegistrationStatusNotification,
} from './registration-side-effects';
import {
  ContestRegistrationsQuery,
  CreateRegistrationBody,
  MyContestRegistrationsQuery,
} from './types';

export async function createContestRegistration(
  contestId: string,
  viewer: Viewer,
  body: CreateRegistrationBody,
) {
  if (viewer.role !== UserRole.CUSTOMER) {
    throw new AppError('Chỉ customer mới được đăng ký contest', 403, 'FORBIDDEN');
  }
  const contest = await getContestOrThrow(contestId);
  if (contest.status !== ContestStatus.OPEN) {
    throw new AppError('Contest chưa mở đăng ký', 400, 'CONTEST_NOT_OPEN');
  }
  const now = new Date();
  const outsideRegistrationWindow =
    Boolean(contest.registrationOpensAt && now < contest.registrationOpensAt) ||
    Boolean(contest.registrationClosesAt && now > contest.registrationClosesAt);
  if (!env.bypassContestRegistrationWindow) {
    if (contest.registrationOpensAt && now < contest.registrationOpensAt) {
      throw new AppError('Chưa tới thời gian mở đăng ký', 400, 'CONTEST_REGISTRATION_NOT_OPEN_YET');
    }
    if (contest.registrationClosesAt && now > contest.registrationClosesAt) {
      throw new AppError('Contest đã đóng đăng ký', 400, 'CONTEST_REGISTRATION_CLOSED');
    }
  } else if (outsideRegistrationWindow) {
    logger.warn(
      'ContestRegistration',
      `DEV_BYPASS_CONTEST_REGISTRATION_WINDOW đang bật — cho phép đăng ký ngoài khung giờ contest ${contest.id}`,
      { contestId: contest.id, userId: viewer.userId },
    );
  }
  if (contest.providerId) {
    const activeBan = await getActiveContestBan(viewer.userId, contest.providerId, contest.id);
    if (activeBan) {
      throw new AppError(
        'Bạn đang bị chặn tham gia contest này',
        403,
        'CONTEST_PARTICIPANT_BANNED',
      );
    }
  }

  const vehiclePolicy = String(contest.vehicleRule?.vehicle_policy ?? 'RENTAL_ONLY');
  if (vehiclePolicy === 'RENTAL_ONLY' && body.vehicle_source !== VehicleSource.RENTAL) {
    throw new AppError(
      'Giải đấu chỉ chấp nhận thuê xe của cafe',
      400,
      'CONTEST_VEHICLE_POLICY_VIOLATED',
    );
  }
  if (vehiclePolicy === 'BYOC_ONLY' && body.vehicle_source !== VehicleSource.BYOC) {
    throw new AppError(
      'Giải đấu chỉ chấp nhận xe cá nhân (BYOC)',
      400,
      'CONTEST_VEHICLE_POLICY_VIOLATED',
    );
  }

  // Thuê xe của quán: khách chỉ chọn DÒNG xe (loại/màu hợp với đường đua của
  // giải). Không chọn khung giờ vì lịch thi đấu đã quyết định, và không có tiền
  // thuê — lệ phí giải là khoản duy nhất. Chiếc xe cụ thể cùng phiếu mượn xe 0đ
  // được tạo lúc check-in khi nhân viên giao xe.
  let rentalCatalogId: string | null = null;
  let rentalCafeId: string | null = null;
  let rentalUnitCount = 0;

  if (body.vehicle_source === VehicleSource.RENTAL) {
    if (!body.rental?.cafe_id || !body.rental?.vehicle_catalog_id) {
      throw new AppError(
        'Đăng ký thuê xe cần chọn chi nhánh và dòng xe',
        400,
        'CONTEST_RENTAL_CHOICE_REQUIRED',
      );
    }
    const { catalog, unitCount } = await resolveContestRentalChoice(contest, {
      cafe_id: body.rental.cafe_id,
      vehicle_catalog_id: body.rental.vehicle_catalog_id,
    });
    rentalCatalogId = catalog.id;
    rentalCafeId = body.rental.cafe_id;
    rentalUnitCount = unitCount;
  } else {
    if (!body.byoc_vehicle_name?.trim()) {
      throw new AppError(
        'Đăng ký BYOC yêu cầu khai báo tên xe',
        400,
        'CONTEST_BYOC_DECLARATION_REQUIRED',
      );
    }
  }

  const saved: ContestRegistration = await AppDataSource.transaction(async (manager) => {
    const transactionalRepo = manager.getRepository(ContestRegistration);

    // PostgreSQL không khoá "khoảng trống" khi SELECT ... FOR UPDATE chưa có
    // registration nào. Khoá advisory theo contest khiến kiểm capacity và INSERT
    // là một critical section, nên hai khách không thể cùng lấy suất cuối.
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `contest-registration:${contestId}`,
    ]);

    // Lock existing registrations for this contest to serialize concurrent registrations.
    const existing = await transactionalRepo
      .createQueryBuilder('registration')
      .setLock('pessimistic_write')
      .where('registration.contest_id = :contestId', { contestId })
      .andWhere('registration.user_id = :userId', { userId: viewer.userId })
      .getOne();

    if (existing && existing.status !== ContestRegistrationStatus.CANCELLED) {
      throw new AppError('Bạn đã đăng ký contest này rồi', 409, 'CONTEST_ALREADY_REGISTERED');
    }

    if (contest.capacity && contest.capacity > 0) {
      const lockedRegistrations = await manager.query(
        `SELECT id
         FROM contest_registrations
         WHERE contest_id = $1 AND status != $2
         FOR UPDATE`,
        [contestId, ContestRegistrationStatus.CANCELLED],
      );
      const activeCount = lockedRegistrations.length;
      if (activeCount >= contest.capacity) {
        throw new AppError('Contest đã đủ sức chứa', 409, 'CONTEST_CAPACITY_REACHED');
      }
    }

    // Giữ chỗ dòng xe: đếm trong cùng transaction đã khoá registrations ở trên
    // nên hai người chọn chiếc cuối cùng của một dòng không thể cùng lọt qua.
    if (rentalCatalogId) {
      await assertContestRentalCatalogHasSlot(manager, {
        contestId,
        catalogId: rentalCatalogId,
        unitCount: rentalUnitCount,
        excludeRegistrationId: existing?.id ?? null,
      });
    }

    if (existing) {
      // Hủy các giao dịch cũ đang PENDING của registration này để không bị khóa 409 khi đăng ký lại
      await manager.getRepository(PaymentTransaction).update(
        {
          contestRegistrationId: existing.id,
          status: PaymentTransactionStatus.PENDING,
        },
        {
          status: PaymentTransactionStatus.FAILED,
        },
      );
    }

    const registration = existing ?? transactionalRepo.create();
    registration.contestId = contestId;
    registration.userId = viewer.userId;
    registration.participantRoleSnapshot = UserRole.CUSTOMER;
    registration.vehicleSource = body.vehicle_source;
    // Chiếc xe cụ thể và phiếu mượn xe chỉ có khi nhân viên giao xe lúc check-in.
    registration.vehicleId = null;
    registration.bookingId = null;
    registration.rentalCatalogId = rentalCatalogId;
    registration.rentalCafeId = rentalCafeId;
    registration.status = ContestRegistrationStatus.PENDING;
    registration.checkInCode = existing?.checkInCode ?? (await generateUniqueCheckInCode(manager));
    registration.entryFeeAmount = Number(contest.entryFee ?? 0);
    registration.entryFeeDueAt =
      env.bypassContestRegistrationWindow && outsideRegistrationWindow
        ? new Date(now.getTime() + 30 * 60 * 1000)
        : (contest.registrationClosesAt ?? contest.startsAt);
    registration.paymentStatus =
      Number(contest.entryFee ?? 0) > 0
        ? ContestEntryFeePaymentStatus.PENDING_PAYMENT
        : ContestEntryFeePaymentStatus.NOT_REQUIRED;
    registration.metadata = {
      ...(registration.metadata ?? {}),
      byoc_declaration:
        body.vehicle_source === VehicleSource.BYOC ? buildByocMetadata(body) : undefined,
    };

    if (existing) {
      registration.createdAt = new Date();
      registration.cancelledAt = null;
      registration.cancelledBy = null;
      registration.cancellationReason = null;
    }

    return transactionalRepo.save(registration);
  });

  await writeContestAudit({
    contestId,
    registrationId: saved.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.created',
    afterJson: { status: saved.status, paymentStatus: saved.paymentStatus },
  });
  if (env.bypassContestRegistrationWindow && outsideRegistrationWindow) {
    await writeContestAudit({
      contestId,
      registrationId: saved.id,
      actorId: viewer.userId,
      actorRole: viewer.role,
      eventType: 'registration.created_outside_window',
      afterJson: {
        registration_opens_at: contest.registrationOpensAt,
        registration_closes_at: contest.registrationClosesAt,
        registered_at: new Date().toISOString(),
        entry_fee_due_at: saved.entryFeeDueAt,
      },
      reason: 'DEV_BYPASS_CONTEST_REGISTRATION_WINDOW đang bật',
    });
  }
  await sendContestRegistrationCreatedSideEffects(saved);
  // Thuê xe của quán mà không còn lệ phí phải chờ thì vào thẳng danh sách thi đấu.
  await autoConfirmRentalRegistration(saved.id);

  const [mapped] = await mapContestRegistrationsPayload([saved], { includeContest: true });
  return mapped;
}

export async function listMyContestRegistrations(
  viewer: Viewer,
  query?: MyContestRegistrationsQuery,
) {
  const rows = await AppDataSource.getRepository(ContestRegistration).find({
    where: { userId: viewer.userId },
    order: { createdAt: 'DESC' },
  });
  const mapped = await mapContestRegistrationsPayload(rows, { includeContest: true });
  const normalizedQuery = query?.query?.toLowerCase();
  return mapped.filter((registration) => {
    const matchesQuery =
      !normalizedQuery ||
      registration.contest?.name?.toLowerCase().includes(normalizedQuery) ||
      registration.participant?.full_name?.toLowerCase().includes(normalizedQuery) ||
      registration.participant?.email?.toLowerCase().includes(normalizedQuery);
    const matchesContestStatus =
      !query?.contest_status || registration.contest?.status === query.contest_status;
    const matchesJourney =
      !query?.customer_journey_status ||
      registration.customer_journey_status === query.customer_journey_status;
    return matchesQuery && matchesContestStatus && matchesJourney;
  });
}

export async function listContestRegistrations(
  contestId: string,
  viewer: Viewer,
  query?: ContestRegistrationsQuery,
) {
  await assertContestProviderOrAssignedStaff(contestId, viewer);
  const rows = await AppDataSource.getRepository(ContestRegistration).find({
    where: { contestId },
    order: { createdAt: 'DESC' },
  });
  const mapped = await mapContestRegistrationsPayload(rows, { includeContest: false });
  const normalizedQuery = query?.query?.toLowerCase();
  return mapped.filter((registration) => {
    const matchesQuery =
      !normalizedQuery ||
      registration.participant?.full_name?.toLowerCase().includes(normalizedQuery) ||
      registration.participant?.email?.toLowerCase().includes(normalizedQuery) ||
      registration.check_in_code?.toLowerCase().includes(normalizedQuery);
    const matchesStatus = !query?.status || registration.status === query.status;
    const matchesPayment =
      !query?.payment_status || registration.payment_status === query.payment_status;
    return matchesQuery && matchesStatus && matchesPayment;
  });
}

export async function listContestBookings(contestId: string, viewer: Viewer) {
  await assertContestProviderOrAssignedStaff(contestId, viewer);
  const rows = await AppDataSource.query<
    {
      id: string;
      status: string;
      slot_start: Date;
      slot_end: Date;
      source: string;
      customer_id: string;
      customer_name: string | null;
      customer_email: string | null;
      registration_id: string | null;
      registration_status: string | null;
      check_in_code: string | null;
    }[]
  >(
    `SELECT b.id, b.status, b.slot_start, b.slot_end, b.source, b.customer_id,
            u.full_name AS customer_name, u.email AS customer_email,
            r.id AS registration_id, r.status AS registration_status, r.check_in_code
     FROM bookings b
     LEFT JOIN users u ON u.id = b.customer_id
     LEFT JOIN contest_registrations r ON r.booking_id = b.id
     WHERE b.contest_id = $1
     ORDER BY b.slot_start ASC`,
    [contestId],
  );
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    source: row.source,
    slot_start: row.slot_start,
    slot_end: row.slot_end,
    customer: {
      id: row.customer_id,
      full_name: row.customer_name,
      email: row.customer_email,
    },
    registration: row.registration_id
      ? {
          id: row.registration_id,
          status: row.registration_status,
          check_in_code: row.check_in_code,
        }
      : null,
  }));
}

async function getContestRegistrationForOwner(registrationId: string, viewer: Viewer) {
  const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
    where: { id: registrationId },
  });
  if (!registration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
  await assertContestProviderOrAssignedStaff(registration.contestId, viewer);
  return registration;
}

export async function markEntryFeePaid(registrationId: string, viewer: Viewer, note?: string) {
  const registration = await getContestRegistrationForOwner(registrationId, viewer);
  registration.paymentStatus = ContestEntryFeePaymentStatus.MARKED_PAID;
  registration.entryFeeMarkedPaidBy = viewer.userId;
  registration.entryFeeMarkedPaidAt = new Date();
  registration.metadata = { ...(registration.metadata ?? {}), fee_note: note ?? null };
  await AppDataSource.getRepository(ContestRegistration).save(registration);
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.entry_fee_marked_paid',
    afterJson: { paymentStatus: registration.paymentStatus },
    reason: note ?? null,
  });
  await autoConfirmRentalRegistration(registration.id);
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

export async function waiveEntryFee(registrationId: string, viewer: Viewer, note?: string) {
  const registration = await getContestRegistrationForOwner(registrationId, viewer);
  registration.paymentStatus = ContestEntryFeePaymentStatus.WAIVED;
  registration.entryFeeMarkedPaidBy = viewer.userId;
  registration.entryFeeMarkedPaidAt = new Date();
  registration.metadata = { ...(registration.metadata ?? {}), fee_note: note ?? null };
  await AppDataSource.getRepository(ContestRegistration).save(registration);
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.entry_fee_waived',
    afterJson: { paymentStatus: registration.paymentStatus },
    reason: note ?? null,
  });
  await autoConfirmRentalRegistration(registration.id);
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

export async function approveRegistration(registrationId: string, viewer: Viewer, reason?: string) {
  const registration = await getContestRegistrationForOwner(registrationId, viewer);
  if (
    ![
      ContestEntryFeePaymentStatus.NOT_REQUIRED,
      ContestEntryFeePaymentStatus.WAIVED,
      ContestEntryFeePaymentStatus.MARKED_PAID,
      ContestEntryFeePaymentStatus.PENDING_REVIEW,
    ].includes(registration.paymentStatus)
  ) {
    throw new AppError(
      'Registration chưa hoàn tất trạng thái phí tham gia',
      400,
      'ENTRY_FEE_PENDING',
    );
  }

  // Không còn ràng buộc "booking phải CONFIRMED": thuê xe trong giải là miễn phí
  // nên chẳng có gì để thanh toán, và phiếu mượn xe chỉ sinh ra lúc giao xe.
  const contest = await getContestOrThrow(registration.contestId);
  if (![ContestStatus.OPEN, ContestStatus.CLOSED].includes(contest.status)) {
    throw new AppError(
      'Không thể duyệt registration khi contest không ở trạng thái OPEN hoặc CLOSED',
      400,
      'CONTEST_NOT_APPROVABLE',
    );
  }
  if (contest.providerId) {
    const activeBan = await getActiveContestBan(
      registration.userId,
      contest.providerId,
      contest.id,
    );
    if (activeBan) {
      throw new AppError(
        'Người tham gia đang bị ban khỏi contest này',
        409,
        'CONTEST_PARTICIPANT_BANNED',
      );
    }
  }
  if (contest.capacity && contest.capacity > 0) {
    const activeCount = await AppDataSource.getRepository(ContestRegistration).count({
      where: {
        contestId: contest.id,
        status: Not(ContestRegistrationStatus.CANCELLED),
      },
    });
    // Exclude the current registration from the active count because it is being approved now.
    const currentIncluded = registration.status !== ContestRegistrationStatus.CANCELLED ? 1 : 0;
    if (activeCount - currentIncluded >= contest.capacity) {
      throw new AppError('Contest đã đủ sức chứa', 409, 'CONTEST_CAPACITY_REACHED');
    }
  }
  registration.status = ContestRegistrationStatus.CONFIRMED;
  await AppDataSource.getRepository(ContestRegistration).save(registration);
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.approved',
    afterJson: { status: registration.status },
    reason: reason ?? null,
  });
  await sendContestRegistrationStatusNotification(
    registration,
    NotificationType.CONTEST_REGISTRATION_APPROVED,
    'Bạn đã có suất thi đấu',
    'Đăng ký của bạn đã được duyệt. Kiểm tra email để lấy mã check-in và địa điểm thi đấu.',
  );
  // Email mang mã check-in chỉ gửi ở đây — khi suất thi đấu đã thật sự chắc chắn.
  await sendContestRegistrationApprovedEmail(registration);
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

/**
 * WF-B cleanup: when a registration is rejected/cancelled, cancel its linked
 * contest rental booking if it is still unpaid (PENDING — PAYMENT_TIMEOUT moves
 * it to CANCELLED and releases slot locks). Bookings that were already paid or
 * consumed (CONFIRMED / AWAITING_PAYMENT / ...) are kept untouched — no automatic
 * refund — and an audit log entry records that decision.
 */
export async function cleanupContestRentalBookingOnRegistrationCancel(
  registration: ContestRegistration,
  viewer: Viewer,
  trigger: 'registration.rejected' | 'registration.cancelled',
): Promise<void> {
  if (!registration.bookingId) return;
  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: registration.bookingId },
  });
  if (!booking || booking.contestId == null) return;

  if (booking.status === BookingStatus.PENDING) {
    await transition(booking.id, 'PAYMENT_TIMEOUT');
    await writeContestAudit({
      contestId: registration.contestId,
      registrationId: registration.id,
      actorId: viewer.userId,
      actorRole: viewer.role,
      eventType: 'booking.contest_rental_cancelled',
      beforeJson: { booking_status: BookingStatus.PENDING },
      afterJson: { booking_status: BookingStatus.CANCELLED },
      metadata: { booking_id: booking.id, trigger },
    });
    return;
  }

  if (booking.status === BookingStatus.CANCELLED) return;

  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'booking.contest_rental_retained',
    afterJson: { booking_status: booking.status },
    reason: 'Booking đã thanh toán hoặc đã sử dụng — giữ nguyên, không tự refund',
    metadata: { booking_id: booking.id, trigger },
  });
}

export async function rejectRegistration(registrationId: string, viewer: Viewer, reason: string) {
  const registration = await getContestRegistrationForOwner(registrationId, viewer);
  registration.status = ContestRegistrationStatus.CANCELLED;
  registration.cancelledBy = viewer.userId;
  registration.cancelledAt = new Date();

  // Hủy các giao dịch cũ đang PENDING của registration này
  await AppDataSource.getRepository(PaymentTransaction).update(
    {
      contestRegistrationId: registration.id,
      status: PaymentTransactionStatus.PENDING,
    },
    {
      status: PaymentTransactionStatus.FAILED,
    },
  );

  // Lý do là bắt buộc ở tầng validate, nên tới đây luôn có chữ thật để gửi cho
  // VĐV thay vì câu mặc định vô nghĩa.
  registration.cancellationReason = reason;
  await AppDataSource.getRepository(ContestRegistration).save(registration);
  await removeRegistrationFromActiveMatches(registration.id);
  try {
    await cleanupContestRentalBookingOnRegistrationCancel(
      registration,
      viewer,
      'registration.rejected',
    );
  } catch (err) {
    logger.error(
      'ContestService',
      `rental booking cleanup failed registrationId=${registration.id}`,
      err,
    );
  }
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.rejected',
    afterJson: { status: registration.status },
    reason: registration.cancellationReason,
  });
  await sendContestRegistrationStatusNotification(
    registration,
    NotificationType.CONTEST_REGISTRATION_REJECTED,
    'Đăng ký giải đấu bị từ chối',
    `Đăng ký của bạn đã bị từ chối.${registration.cancellationReason ? ` Lý do: ${registration.cancellationReason}` : ''}`,
  );
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

export interface UpdateByocDeclarationBody {
  vehicle_name: string;
  vehicle_brand?: string | null;
  vehicle_class?: string | null;
  notes?: string | null;
  photos?: string[];
}

export async function updateByocDeclaration(
  registrationId: string,
  viewer: Viewer,
  body: UpdateByocDeclarationBody,
) {
  if (viewer.role !== UserRole.CUSTOMER) {
    throw new AppError('Chỉ customer mới được cập nhật khai báo xe', 403, 'FORBIDDEN');
  }
  const repo = AppDataSource.getRepository(ContestRegistration);
  const registration = await repo.findOne({ where: { id: registrationId } });
  if (!registration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
  if (registration.userId !== viewer.userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (registration.vehicleSource !== VehicleSource.BYOC) {
    throw new AppError('Registration không phải xe cá nhân (BYOC)', 400, 'INVALID_VEHICLE_SOURCE');
  }
  if (registration.status !== ContestRegistrationStatus.PENDING) {
    throw new AppError(
      'Chỉ được cập nhật khai báo xe khi registration đang PENDING',
      400,
      'INVALID_REGISTRATION_STATE',
    );
  }

  const beforeDeclaration =
    (registration.metadata?.byoc_declaration as Record<string, unknown> | undefined) ?? null;
  const previousPhotos = Array.isArray((beforeDeclaration as { photos?: unknown } | null)?.photos)
    ? ((beforeDeclaration as { photos: string[] }).photos ?? [])
    : [];
  const declaration = {
    vehicle_name: body.vehicle_name,
    vehicle_brand: body.vehicle_brand ?? null,
    vehicle_class: body.vehicle_class ?? null,
    notes: body.notes ?? null,
    // Không gửi photos nghĩa là "giữ nguyên ảnh cũ", không phải "xoá hết ảnh".
    photos: body.photos ?? previousPhotos,
  };
  registration.metadata = {
    ...(registration.metadata ?? {}),
    byoc_declaration: declaration,
  };
  await repo.save(registration);
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.byoc_declaration_updated',
    beforeJson: { byoc_declaration: beforeDeclaration },
    afterJson: { byoc_declaration: declaration },
  });
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

export async function cancelRegistration(registrationId: string, viewer: Viewer, reason?: string) {
  const repo = AppDataSource.getRepository(ContestRegistration);
  const registration = await repo.findOne({ where: { id: registrationId } });
  if (!registration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');

  if (viewer.role === UserRole.CUSTOMER) {
    if (registration.userId !== viewer.userId) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  } else {
    await assertContestProviderOrAssignedStaff(registration.contestId, viewer);
  }

  registration.status = ContestRegistrationStatus.CANCELLED;
  registration.cancelledBy = viewer.userId;
  registration.cancelledAt = new Date();
  registration.cancellationReason = reason ?? 'Cancelled';

  // Hủy các giao dịch cũ đang PENDING của registration này
  await AppDataSource.getRepository(PaymentTransaction).update(
    {
      contestRegistrationId: registration.id,
      status: PaymentTransactionStatus.PENDING,
    },
    {
      status: PaymentTransactionStatus.FAILED,
    },
  );

  await repo.save(registration);
  await removeRegistrationFromActiveMatches(registration.id);
  try {
    await cleanupContestRentalBookingOnRegistrationCancel(
      registration,
      viewer,
      'registration.cancelled',
    );
  } catch (err) {
    logger.error(
      'ContestService',
      `rental booking cleanup failed registrationId=${registration.id}`,
      err,
    );
  }
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.cancelled',
    afterJson: { status: registration.status },
    reason: registration.cancellationReason,
  });
  await sendContestRegistrationStatusNotification(
    registration,
    NotificationType.CONTEST_REGISTRATION_CANCELLED,
    'Đăng ký giải đấu đã được huỷ',
    `Đăng ký của bạn đã được huỷ.${registration.cancellationReason ? ` Lý do: ${registration.cancellationReason}` : ''}`,
  );
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

export async function lookupRegistrationByCode(
  contestId: string,
  checkInCode: string,
  viewer: Viewer,
) {
  const contest = await getContestOrThrow(contestId);
  if (viewer.role === UserRole.PROVIDER) {
    await assertContestProviderOrAssignedStaff(contestId, viewer);
  } else if (viewer.role === UserRole.STAFF) {
    const assigned = await isStaffAssignedToContest(contestId, viewer.userId);
    if (!assigned) {
      throw new AppError('Staff không thuộc chi nhánh tham gia contest', 403, 'FORBIDDEN');
    }
  } else {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
    where: { contestId: contest.id, checkInCode },
  });
  if (!registration)
    throw new AppError('Không tìm thấy registration', 404, 'REGISTRATION_NOT_FOUND');
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: true });
  return mapped;
}

export async function checkInRegistration(
  registrationId: string,
  checkedInCafeId: string,
  viewer: Viewer,
  rentalVehicleId?: string | null,
  byocConfirmed?: boolean,
  byocInspection?: {
    photos?: Array<{ url: string; angle?: string; notes?: string }>;
    checklist?: Array<{
      itemKey: string;
      itemLabel: string;
      status?: 'OK' | 'NOT_OK' | 'NA';
      note?: string;
    }>;
  },
  options?: {
    /** Internal-only escape hatch used by the authenticated Contest Lab route. */
    bypassWindow?: boolean;
    bypassReason?: 'CONTEST_LAB';
  },
) {
  const repo = AppDataSource.getRepository(ContestRegistration);
  const registration = await repo.findOne({ where: { id: registrationId } });
  if (!registration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
  const contest = await getContestOrThrow(registration.contestId);

  if (registration.status !== ContestRegistrationStatus.CONFIRMED) {
    throw new AppError(
      'Registration phải ở trạng thái CONFIRMED',
      400,
      'REGISTRATION_NOT_CONFIRMED',
    );
  }
  if (
    Number(contest.entryFee ?? 0) > 0 &&
    ![
      ContestEntryFeePaymentStatus.MARKED_PAID,
      ContestEntryFeePaymentStatus.WAIVED,
      ContestEntryFeePaymentStatus.PENDING_REVIEW,
    ].includes(registration.paymentStatus)
  ) {
    throw new AppError('Registration vẫn đang chờ xử lý phí tham gia', 400, 'ENTRY_FEE_PENDING');
  }

  // Cờ cho phép điểm danh ngoài khung giờ giải, bật được ở mọi môi trường.
  //
  // Mỗi lần dùng đều ghi một dòng kiểm toán ngay dưới đây. Bypass lặng lẽ là
  // thứ nguy hiểm: sáu tháng sau không ai dựng lại được vì sao một người được
  // điểm danh khi giải còn đang mở đăng ký. Có dòng nhật ký thì câu hỏi đó trả
  // lời được.
  const bypassedByContestLab = options?.bypassWindow === true;
  const bypassedWindow = env.bypassContestCheckInWindow || bypassedByContestLab;
  if (bypassedWindow) {
    logger.warn(
      'ContestService',
      `${bypassedByContestLab ? 'Contest Lab' : 'DEV_BYPASS_CONTEST_CHECKIN'} — bỏ qua kiểm tra thời gian điểm danh cho contest ${contest.id}`,
      {
        contestId: contest.id,
        registrationId,
        actorId: viewer.userId,
        status: contest.status,
        reason: bypassedByContestLab ? options?.bypassReason : 'ENV_FLAG',
      },
    );
  }
  // Contest Lab chỉ tua qua thời gian; người vận hành vẫn phải đóng đăng ký
  // trước. Cờ toàn server cũ giữ nguyên hành vi để tương thích môi trường dev.
  if (!env.bypassContestCheckInWindow) {
    if (![ContestStatus.CLOSED, ContestStatus.RUNNING].includes(contest.status)) {
      throw new AppError(
        'Check-in chỉ được thực hiện khi contest ở trạng thái CLOSED hoặc RUNNING',
        400,
        'CONTEST_NOT_CHECKIN_READY',
      );
    }
  }
  if (!bypassedWindow) {
    const now = new Date();
    if (contest.startsAt && now < contest.startsAt) {
      throw new AppError('Chưa tới giờ check-in của contest', 400, 'CONTEST_CHECKIN_NOT_STARTED');
    }
    if (contest.endsAt && now > contest.endsAt) {
      throw new AppError('Contest đã kết thúc, không thể check-in', 400, 'CONTEST_CHECKIN_ENDED');
    }
  }

  const contestCafe = await AppDataSource.getRepository(ContestCafe).findOne({
    where: { contestId: contest.id, cafeId: checkedInCafeId },
  });
  if (!contestCafe) {
    throw new AppError('Cafe check-in không thuộc contest', 400, 'CONTEST_CHECKIN_CAFE_INVALID');
  }

  if (viewer.role === UserRole.PROVIDER) {
    await assertContestProviderOrAssignedStaff(contest.id, viewer);
  } else if (viewer.role === UserRole.STAFF) {
    const assignedToContest = await isStaffAssignedToContest(contest.id, viewer.userId);
    const assignedToCafe = await isStaffAssignedToCafe(viewer.userId, checkedInCafeId);
    if (!assignedToContest || !assignedToCafe) {
      throw new AppError('Staff không được check-in ở chi nhánh này', 403, 'FORBIDDEN');
    }
  } else {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  if (contest.providerId) {
    const activeBan = await getActiveContestBan(
      registration.userId,
      contest.providerId,
      contest.id,
    );
    if (activeBan) {
      throw new AppError(
        'Người tham gia đang bị chặn thi đấu ở contest này',
        403,
        'CONTEST_PARTICIPANT_BANNED',
      );
    }
  }

  // BYOC check-in guard: ensure the declared vehicle is present before allowing entry.
  if (registration.vehicleSource === VehicleSource.BYOC) {
    const declaration = registration.metadata?.byoc_declaration as
      | { vehicle_name?: string | null }
      | undefined;
    if (!declaration?.vehicle_name?.trim()) {
      throw new AppError(
        'Khai báo xe cá nhân chưa đầy đủ; không thể check-in BYOC',
        400,
        'CONTEST_BYOC_DECLARATION_INVALID',
      );
    }
    if (!byocConfirmed) {
      throw new AppError(
        'Cần xác nhận xe cá nhân đạt chuẩn trước khi check-in BYOC',
        400,
        'CONTEST_BYOC_CONFIRMATION_REQUIRED',
      );
    }
    // Checklist + ảnh kiểm tra tại quầy không còn bắt buộc — chỉ cần tick xác
    // nhận đạt chuẩn ở trên. `byocInspection` vẫn nhận vào (không xoá tham
    // số) để không phá request cũ, nhưng không còn gì đọc từ nó nữa.
  }

  // VĐV thuê xe của quán: phải chọn chiếc cụ thể để giao ngay tại quầy. Kiểm
  // trước khi đổi trạng thái để không có ai bị đánh dấu đã điểm danh mà tay
  // không có xe.
  // Đăng ký cũ (trước khi có bước chọn dòng xe) không có gì để giao, nên không
  // chặn điểm danh của họ.
  const needsVehicleHandover =
    registration.vehicleSource === VehicleSource.RENTAL && Boolean(registration.rentalCatalogId);

  if (needsVehicleHandover) {
    if (!rentalVehicleId) {
      throw new AppError(
        'Cần chọn xe để giao cho VĐV trước khi điểm danh',
        400,
        'CONTEST_HANDOVER_VEHICLE_REQUIRED',
      );
    }
    if (registration.bookingId) {
      throw new AppError('VĐV này đã được giao xe', 409, 'CONTEST_HANDOVER_ALREADY_EXISTS');
    }
  }

  // Build the merged metadata first so the BYOC inspection payload is persisted
  // in the same atomic UPDATE as the status transition.
  let mergedMetadata = registration.metadata ?? {};
  if (registration.vehicleSource === VehicleSource.BYOC) {
    mergedMetadata = {
      ...mergedMetadata,
      byoc_checked_in_confirmed_by: viewer.userId,
      byoc_checked_in_confirmed_at: new Date().toISOString(),
      byoc_inspection: {
        photos: byocInspection?.photos ?? [],
        checklist: byocInspection?.checklist ?? [],
        checked_at: new Date().toISOString(),
      },
    };
  }

  // Atomic CONFIRMED → CHECKED_IN transition: guards against concurrent
  // check-ins (e.g. staff check-in racing the vehicle check-in sync). If no row
  // is returned, someone else transitioned the registration first.
  const updateRaw = await AppDataSource.query(
    `UPDATE contest_registrations
     SET status = $2, checked_in_cafe_id = $3, checked_in_by = $4, checked_in_at = NOW(),
         metadata = $5::jsonb, updated_at = NOW()
     WHERE id = $1 AND status = $6
     RETURNING id`,
    [
      registration.id,
      ContestRegistrationStatus.CHECKED_IN,
      checkedInCafeId,
      viewer.userId,
      JSON.stringify(mergedMetadata),
      ContestRegistrationStatus.CONFIRMED,
    ],
  );
  const updatedRows: { id: string }[] = Array.isArray(updateRaw[0]) ? updateRaw[0] : updateRaw;
  if (!updatedRows.length) {
    throw new AppError(
      'Registration phải ở trạng thái CONFIRMED',
      400,
      'REGISTRATION_NOT_CONFIRMED',
    );
  }

  if (needsVehicleHandover && rentalVehicleId) {
    try {
      const handover = await createContestVehicleHandover({
        contest,
        registration,
        vehicleId: rentalVehicleId,
        staffUserId: viewer.userId,
      });
      await repo.update(
        { id: registration.id },
        { bookingId: handover.bookingId, vehicleId: handover.vehicleId },
      );
      await writeContestAudit({
        contestId: contest.id,
        registrationId: registration.id,
        actorId: viewer.userId,
        actorRole: viewer.role,
        eventType: 'registration.vehicle_handed_over',
        afterJson: { booking_id: handover.bookingId, vehicle_id: handover.vehicleId },
      });
    } catch (error) {
      // Giao xe hỏng thì trả trạng thái về, không để VĐV bị ghi là đã điểm danh
      // trong khi chưa cầm xe.
      await repo.update(
        { id: registration.id, status: ContestRegistrationStatus.CHECKED_IN },
        {
          status: ContestRegistrationStatus.CONFIRMED,
          checkedInAt: null,
          checkedInBy: null,
          checkedInCafeId: null,
        },
      );
      throw error;
    }
  }

  const savedRegistration = await repo.findOne({ where: { id: registration.id } });
  if (!savedRegistration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');

  await writeContestAudit({
    contestId: contest.id,
    registrationId: savedRegistration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.checked_in',
    afterJson: { status: savedRegistration.status, checkedInCafeId },
  });

  // Ghi RIÊNG một dòng cho lần điểm danh ngoài khung giờ, không nhét cờ vào
  // dòng trên: tra "ai từng điểm danh ngoài giờ" phải lọc được bằng đúng một
  // điều kiện `event_type`, chứ không phải dò trong JSON của mọi lần điểm danh.
  if (bypassedWindow) {
    await writeContestAudit({
      contestId: contest.id,
      registrationId: savedRegistration.id,
      actorId: viewer.userId,
      actorRole: viewer.role,
      eventType: 'registration.checked_in_outside_window',
      afterJson: {
        contest_status: contest.status,
        contest_starts_at: contest.startsAt,
        contest_ends_at: contest.endsAt,
        checked_in_at: new Date().toISOString(),
        bypass_source: bypassedByContestLab ? 'CONTEST_LAB' : 'ENV_FLAG',
      },
      reason: bypassedByContestLab
        ? (options?.bypassReason ?? 'CONTEST_LAB')
        : 'DEV_BYPASS_CONTEST_CHECKIN đang bật',
    });
  }

  await sendContestRegistrationStatusNotification(
    savedRegistration,
    NotificationType.CONTEST_CHECKIN_CONFIRMED,
    'Check-in thành công',
    'Bạn đã check-in thành công. Theo dõi thông báo để biết sơ đồ đấu và lượt thi tiếp theo của mình.',
  );
  const [mapped] = await mapContestRegistrationsPayload([savedRegistration], {
    includeContest: true,
  });
  return mapped;
}
export async function createContestEntryPaymentUrl(
  registrationId: string,
  viewer: Viewer,
  ipAddr: string,
  returnUrl?: string,
) {
  if (viewer.role !== UserRole.CUSTOMER) {
    throw new AppError('Chỉ customer mới được tạo thanh toán entry fee', 403, 'FORBIDDEN');
  }
  const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
    where: { id: registrationId, userId: viewer.userId },
  });
  if (!registration) {
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
  }
  const contest = await getContestOrThrow(registration.contestId);
  if (Number(registration.entryFeeAmount ?? 0) <= 0) {
    throw new AppError('Contest này không yêu cầu entry fee', 400, 'ENTRY_FEE_NOT_REQUIRED');
  }
  if (
    [ContestEntryFeePaymentStatus.MARKED_PAID, ContestEntryFeePaymentStatus.WAIVED].includes(
      registration.paymentStatus,
    )
  ) {
    throw new AppError('Entry fee đã được xử lý', 409, 'ENTRY_FEE_ALREADY_SETTLED');
  }

  // Registrations created before the catalog-choice flow may still have their
  // entry fee frozen inside a linked booking. Keep that legacy payment path
  // isolated: creating a contest-only transaction here would charge twice.
  // New registrations have no bookingId and always use the contest fee flow.
  if (registration.bookingId) {
    throw new AppError(
      'Lệ phí giải đã được gộp vào thanh toán đơn đặt. Vui lòng thanh toán đơn đặt để hoàn tất.',
      409,
      'ENTRY_FEE_INCLUDED_IN_BOOKING',
    );
  }

  // Nếu có giao dịch PENDING cũ của đăng ký này (do khách vừa thoát cổng thanh toán và bấm Thanh toán lại),
  // tự động cập nhật FAILED cho giao dịch PENDING cũ để sinh link thanh toán mới mượt mà cho khách.
  const existingTxns = await AppDataSource.getRepository(PaymentTransaction).find({
    where: {
      contestRegistrationId: registration.id,
      subjectType: PaymentTransactionSubjectType.CONTEST_ENTRY,
      type: PaymentTransactionType.PAYMENT,
      status: PaymentTransactionStatus.PENDING,
    },
  });
  if (existingTxns.length > 0) {
    await AppDataSource.getRepository(PaymentTransaction).update(
      existingTxns.map((t) => t.id),
      {
        status: PaymentTransactionStatus.FAILED,
        rawResponse: { reason: 'REPLACED_BY_RETRY_PAYMENT' },
      },
    );
  }

  const txnRef = `contest_${registration.id.replace(/-/g, '').slice(0, 18)}_${Date.now().toString().slice(-4)}`;
  const paymentUrl = createPaymentUrl({
    amount: Number(registration.entryFeeAmount),
    txnRef,
    orderInfo: `Contest entry ${contest.name.slice(0, 40)}`,
    ipAddr,
    returnUrl,
    bankCode: 'VNBANK',
  });

  await AppDataSource.getRepository(PaymentTransaction).save(
    AppDataSource.getRepository(PaymentTransaction).create({
      bookingId: null,
      customerPackageId: null,
      contestRegistrationId: registration.id,
      subjectType: PaymentTransactionSubjectType.CONTEST_ENTRY,
      type: PaymentTransactionType.PAYMENT,
      gateway: env.vnpay.mockEnabled ? 'MOCK' : 'VNPAY',
      txnRef,
      amount: Number(registration.entryFeeAmount),
      status: PaymentTransactionStatus.PENDING,
      rawRequest: {
        registrationId: registration.id,
        contestId: contest.id,
        returnUrl: returnUrl ?? null,
      },
    }),
  );

  if (env.vnpay.mockEnabled) {
    await processMockConfirmation(txnRef);
    const target = new URL('/payment/result', env.frontendUrl);
    target.searchParams.set('status', 'success');
    target.searchParams.set('txn_ref', txnRef);
    target.searchParams.set('mock', '1');
    return {
      payment_url: target.toString(),
      txn_ref: txnRef,
      amount: Number(registration.entryFeeAmount),
    };
  }

  return {
    payment_url: paymentUrl,
    txn_ref: txnRef,
    amount: Number(registration.entryFeeAmount),
  };
}
export async function disqualifyRegistration(
  registrationId: string,
  viewer: Viewer,
  reason?: string,
) {
  const registration = await getContestRegistrationForOwner(registrationId, viewer);
  registration.status = ContestRegistrationStatus.CANCELLED;
  registration.cancelledBy = viewer.userId;
  registration.cancelledAt = new Date();
  registration.cancellationReason = reason ?? 'Disqualified';
  registration.metadata = {
    ...(registration.metadata ?? {}),
    disqualified: true,
    disqualified_at: new Date().toISOString(),
  };
  await AppDataSource.getRepository(ContestRegistration).save(registration);
  await removeRegistrationFromActiveMatches(registration.id);
  await writeContestAudit({
    contestId: registration.contestId,
    registrationId: registration.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'registration.disqualified',
    afterJson: { status: registration.status },
    reason: registration.cancellationReason,
  });
  const [mapped] = await mapContestRegistrationsPayload([registration], { includeContest: false });
  return mapped;
}

/** Xe còn rảnh thuộc dòng VĐV đã đặt — nhân viên chọn một chiếc để giao. */
export async function listRegistrationHandoverUnits(registrationId: string, viewer: Viewer) {
  const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
    where: { id: registrationId },
  });
  if (!registration)
    throw new AppError('Registration không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
  await assertContestProviderOrAssignedStaff(registration.contestId, viewer);
  return listContestHandoverUnits(registration);
}
