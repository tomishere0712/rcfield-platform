import { In } from 'typeorm';
import { randomBytes } from 'crypto';
import { AppDataSource } from '../../config/database';
import { Cafe } from '../../models/cafe.entity';
import { ContestMatch } from '../../models/contest-match.entity';
import { ContestMatchParticipant } from '../../models/contest-match-participant.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import { ContestFormat } from '../../models/contest-format.entity';
import { ContestTemplate } from '../../models/contest-template.entity';
import { ContestType } from '../../models/contest-type.entity';
import { Contest } from '../../models/contest.entity';
import { AppError, ContestMatchStatus, UserRole } from '../../types';
import { assertContestOperator, assertContestOwner } from '../contest.helpers';
import { Viewer } from '../cafe.service';
import { CreateRegistrationBody } from './types';

/**
 * @param options.requireReleasedFormat Chỉ bật khi provider đang CHỌN thể thức.
 * Giải cũ lỡ nằm trên thể thức chưa phát hành vẫn phải sửa được tên, giờ, sức
 * chứa — chặn ở mọi lần update là khoá luôn giải của họ mà chẳng cứu được gì.
 */
export async function resolveCatalogOrThrow(
  contestTypeId: string,
  contestFormatId: string,
  contestTemplateId: string,
  options: { requireReleasedFormat: boolean },
) {
  const [contestType, contestFormat, contestTemplate] = await Promise.all([
    AppDataSource.getRepository(ContestType).findOne({
      where: { id: contestTypeId, isActive: true },
    }),
    AppDataSource.getRepository(ContestFormat).findOne({
      where: { id: contestFormatId, isActive: true },
    }),
    AppDataSource.getRepository(ContestTemplate).findOne({
      where: { id: contestTemplateId, isActive: true },
    }),
  ]);

  if (!contestType) throw new AppError('Contest type không hợp lệ', 400, 'CONTEST_TYPE_INVALID');
  if (!contestFormat)
    throw new AppError('Contest format không hợp lệ', 400, 'CONTEST_FORMAT_INVALID');
  if (options.requireReleasedFormat && !contestFormat.isReleased) {
    throw new AppError(
      `Thể thức "${contestFormat.name}" đang được hoàn thiện, chưa mở để tạo giải`,
      400,
      'CONTEST_FORMAT_NOT_RELEASED',
      { contest_format_code: contestFormat.code },
    );
  }
  if (!contestTemplate)
    throw new AppError('Contest template không hợp lệ', 400, 'CONTEST_TEMPLATE_INVALID');
  if (
    contestTemplate.contestTypeId !== contestType.id ||
    contestTemplate.contestFormatId !== contestFormat.id
  ) {
    throw new AppError(
      'Contest template không khớp với type/format đã chọn',
      400,
      'CONTEST_TEMPLATE_MISMATCH',
    );
  }

  return { contestType, contestFormat, contestTemplate };
}

export async function resolveProviderBranchesOrThrow(providerId: string, cafeIds: string[]) {
  const cafes = await AppDataSource.getRepository(Cafe).findBy({ id: In(cafeIds) });
  if (cafes.length !== cafeIds.length) {
    throw new AppError('Có chi nhánh không tồn tại', 400, 'CAFE_NOT_FOUND');
  }
  for (const cafe of cafes) {
    if (cafe.providerId !== providerId) {
      throw new AppError(
        'Chi nhánh không thuộc provider hiện tại',
        400,
        'CONTEST_BRANCH_FORBIDDEN',
      );
    }
    if (cafe.status !== 'ACTIVE') {
      throw new AppError(
        'Contest chỉ được gắn với chi nhánh ACTIVE',
        400,
        'CONTEST_BRANCH_INACTIVE',
      );
    }
  }
  return cafes;
}

export type ContestRuntimeFormat = 'KNOCKOUT' | 'TIME_TRIAL' | 'QUALIFYING_FINAL';

/**
 * Ánh xạ mã format trong catalog sang engine vận hành.
 *
 * Trước đây hàm này chỉ nhận ra TIME_TRIAL, mọi mã khác đều rơi về KNOCKOUT —
 * kể cả QUALIFYING_FINAL. Hệ quả dây chuyền: `mergeContestConfig` ghi
 * `config.runtime_format = 'KNOCKOUT'`, `getContestFormatEngine` trả về
 * KnockoutEngine, và `generateContestFinalBracket` luôn ném
 * `CONTEST_FORMAT_NOT_QUALIFYING_FINAL`. Nghĩa là QualifyingFinalEngine cùng
 * endpoint sinh nhánh chung kết không có đường nào chạm tới, dù catalog, spec
 * và form đều đã có.
 */
export function getRuntimeFormatFromCatalog(contestFormatCode: string): ContestRuntimeFormat {
  if (contestFormatCode === 'TIME_TRIAL') return 'TIME_TRIAL';
  if (contestFormatCode === 'QUALIFYING_FINAL') return 'QUALIFYING_FINAL';
  return 'KNOCKOUT';
}

export function stripRuntimeManagedConfig(config: Record<string, unknown> | null | undefined) {
  const nextConfig = { ...(config ?? {}) };
  delete nextConfig.format;
  delete nextConfig.runtime_format;
  delete nextConfig.resource_locks;
  return nextConfig;
}

export async function assertContestProviderOrAssignedStaff(contestId: string, viewer: Viewer) {
  return assertContestOperator(contestId, viewer);
}

/**
 * Quyền xem sổ thu chi và báo cáo tài chính của một giải: CHỈ provider sở hữu.
 *
 * ⚠️ Đừng thay bằng guard nào khác trong module contest — hai guard sẵn có đều
 * mở rộng hơn mức tính năng này cho phép:
 *
 * - `assertContestOperator` chấp nhận cả STAFF được phân công → nhân viên đọc
 *   được số tổng tài chính của giải, vi phạm FR-021.
 * - `getContestForProvider` (contest-fee.service.ts) chấp nhận cả ADMIN →
 *   quản trị viên nền tảng nhìn được chi phí nội bộ của provider, vi phạm
 *   FR-017a. Đây là ngoại lệ có chủ đích so với phần còn lại của hệ thống:
 *   nền tảng không thu phần trăm trên giải nên không có lý do nghiệp vụ nào để
 *   xem, trong khi các provider lại cạnh tranh nhau trên cùng hệ thống.
 *
 * `assertContestOwner` đã đúng ngữ nghĩa; hàm này chỉ đặt tên rõ ý đồ tại điểm
 * gọi để người sửa sau không vô tình nới quyền.
 */
export async function assertContestFinanceOwner(contestId: string, viewer: Viewer) {
  return assertContestOwner(contestId, viewer);
}

export async function resolveContestProviderIdForViewer(
  viewer: Viewer,
  contest?: Contest,
): Promise<string> {
  if (viewer.role === UserRole.PROVIDER) return viewer.userId;
  if (contest?.providerId) return contest.providerId;
  throw new AppError('Không xác định được provider của contest', 400, 'PROVIDER_NOT_RESOLVED');
}

export function buildByocMetadata(body: CreateRegistrationBody) {
  return {
    vehicle_name: body.byoc_vehicle_name ?? null,
    vehicle_brand: body.byoc_vehicle_brand ?? null,
    vehicle_class: body.byoc_vehicle_class ?? null,
    notes: body.byoc_vehicle_notes ?? null,
    photos: body.byoc_vehicle_photos ?? [],
  };
}

export async function generateUniqueCheckInCode(
  manager: import('typeorm').EntityManager,
  maxAttempts = 5,
): Promise<string> {
  const repo = manager.getRepository(ContestRegistration);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    const existing = await repo.findOne({ where: { checkInCode: code } });
    if (!existing) return code;
  }
  throw new AppError('Không thể tạo mã check-in duy nhất', 500, 'CHECK_IN_CODE_GENERATION_FAILED');
}

export async function removeRegistrationFromActiveMatches(registrationId: string) {
  const participantRepo = AppDataSource.getRepository(ContestMatchParticipant);
  const matchRepo = AppDataSource.getRepository(ContestMatch);
  const participants = await participantRepo.find({ where: { registrationId } });

  for (const participant of participants) {
    const match = await matchRepo.findOne({ where: { id: participant.matchId } });
    if (!match || match.status === ContestMatchStatus.COMPLETED) continue;

    await participantRepo.remove(participant);

    const remainingCount = await participantRepo.count({ where: { matchId: match.id } });
    if (match.status === ContestMatchStatus.READY && remainingCount === 0) {
      match.status = ContestMatchStatus.DRAFT;
      await matchRepo.save(match);
    }
  }
}
