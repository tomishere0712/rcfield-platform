import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { Cafe } from '../../models/cafe.entity';
import { CafeTrackConfig } from '../../models/cafe-track-config.entity';
import { ContestCafe } from '../../models/contest-cafe.entity';
import { ContestFormat } from '../../models/contest-format.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import { ContestStaffAssignment } from '../../models/contest-staff-assignment.entity';
import { Contest } from '../../models/contest.entity';
import { TrackType } from '../../models/track-type.entity';
import { AppError, ContestStatus, UserRole } from '../../types';
import {
  assertContestOperator,
  assertContestOwner,
  assertProviderViewer,
  getContestOrThrow,
  isStaffAssignedToContest,
  writeContestAudit,
} from '../contest.helpers';
import { Viewer } from '../cafe.service';
import {
  assertNoContestBookingConflicts,
  mergeContestConfig,
  resolveContestResourceLocks,
} from '../contest-lock.service';
import { assertContestFeePaid } from '../contest-fee.service';
import { getContestPublicRuntimeSummary } from '../contest-runtime.service';
import { uploadImage } from '../cloudinary.service';
import { mapContestPayload, mapContestRegistrationsPayload } from './payload';
import {
  assertContestProviderOrAssignedStaff,
  getRuntimeFormatFromCatalog,
  resolveCatalogOrThrow,
  resolveContestProviderIdForViewer,
  resolveProviderBranchesOrThrow,
  stripRuntimeManagedConfig,
} from './guards';
import { cleanUpContestOnCancel } from './registration-side-effects';
import { CreateContestBody, ListContestsOptions, UpdateContestBody } from './types';

/**
 * MỌI chi nhánh tham gia phải thật sự có một sân đang hoạt động đúng loại đường
 * đua của giải.
 *
 * Trước đây chỉ cần một chi nhánh có là qua (`.some`). Điều đó cho phép tạo giải
 * ở ba chi nhánh nhưng chỉ một nơi có sân Drift — VĐV check-in ở hai chi nhánh
 * còn lại không có chỗ thi đấu, và lock tài nguyên ở đó chặn booking thường mà
 * chẳng phục vụ giải. Lỗi trả về nêu đích danh chi nhánh thiếu để provider sửa
 * ngay thay vì phải đoán.
 */
async function assertParticipatingCafesSupportTrackType(
  cafeIds: string[],
  trackTypeId: string,
): Promise<void> {
  const trackConfigs = await AppDataSource.getRepository(CafeTrackConfig).find({
    where: { cafeId: In(cafeIds), isActive: true },
  });
  const cafeIdsWithTrackType = new Set(
    trackConfigs
      .filter((config) => config.trackTypeId === trackTypeId)
      .map((config) => config.cafeId),
  );
  const missingCafeIds = cafeIds.filter((cafeId) => !cafeIdsWithTrackType.has(cafeId));
  if (missingCafeIds.length === 0) return;

  const missingCafes = await AppDataSource.getRepository(Cafe).findBy({ id: In(missingCafeIds) });
  const names = missingCafes.map((cafe) => cafe.name).join(', ');
  throw new AppError(
    `Chi nhánh chưa có đường đua loại này: ${names || missingCafeIds.join(', ')}`,
    400,
    'CONTEST_TRACK_TYPE_UNAVAILABLE',
    { missing_cafe_ids: missingCafeIds },
  );
}

export async function listContests(options: ListContestsOptions) {
  const repo = AppDataSource.getRepository(Contest);
  const qb = repo.createQueryBuilder('contest');

  if (options.scope === 'managed') {
    if (options.viewer?.role === UserRole.PROVIDER) {
      qb.andWhere('contest.provider_id = :providerId', { providerId: options.viewer.userId });
    } else if (options.viewer?.role === UserRole.STAFF) {
      qb.innerJoin(
        ContestStaffAssignment,
        'contest_staff_assignment',
        'contest_staff_assignment.contest_id = contest.id AND contest_staff_assignment.staff_id = :staffId',
        { staffId: options.viewer.userId },
      );
    } else {
      throw new AppError('Bạn không có quyền xem danh sách contest quản lý', 403, 'FORBIDDEN');
    }
  } else {
    qb.andWhere('contest.status != :draft', { draft: ContestStatus.DRAFT });
    qb.andWhere('contest.status != :cancelled', { cancelled: ContestStatus.CANCELLED });
    if (options.viewer?.role === UserRole.STAFF) {
      qb.innerJoin(
        ContestStaffAssignment,
        'contest_staff_assignment',
        'contest_staff_assignment.contest_id = contest.id AND contest_staff_assignment.staff_id = :staffId',
        { staffId: options.viewer.userId },
      );
    }
  }

  if (options.status) qb.andWhere('contest.status = :status', { status: options.status });
  if (options.contest_type_id) {
    qb.andWhere('contest.contest_type_id = :contestTypeId', {
      contestTypeId: options.contest_type_id,
    });
  }
  if (options.contest_format_id) {
    qb.andWhere('contest.contest_format_id = :contestFormatId', {
      contestFormatId: options.contest_format_id,
    });
  }
  if (options.query) {
    qb.andWhere('(contest.name ILIKE :search OR contest.description ILIKE :search)', {
      search: `%${options.query.trim()}%`,
    });
  }
  if (options.cafe_id) {
    qb.innerJoin(ContestCafe, 'contest_cafe', 'contest_cafe.contest_id = contest.id');
    qb.andWhere('contest_cafe.cafe_id = :cafeId', { cafeId: options.cafe_id });
  }

  // Phải là TÊN THUỘC TÍNH entity, không phải tên cột DB. Khi query có join và
  // dùng skip/take, TypeORM chuyển sang đường DISTINCT-subquery và tra cột sắp
  // xếp trong metadata entity; đưa 'starts_at' vào thì tra không ra và nổ
  // `Cannot read properties of undefined (reading 'databaseName')`.
  // Provider không dính vì nhánh của họ không join, còn staff thì luôn join
  // contest_staff_assignments nên mọi lần mở danh sách giải đều 500.
  qb.orderBy('contest.startsAt', 'DESC');

  const [rows, total] = await qb
    .skip((options.page - 1) * options.limit)
    .take(options.limit)
    .getManyAndCount();

  const data = await mapContestPayload(rows);
  return { data, total };
}

export async function getContestDetail(contestId: string, viewer?: Viewer) {
  const contest = await getContestOrThrow(contestId);
  const isOwner = viewer?.role === UserRole.PROVIDER && contest.providerId === viewer.userId;
  const isAssignedStaff =
    viewer?.role === UserRole.STAFF
      ? await isStaffAssignedToContest(contestId, viewer.userId)
      : false;
  const isRegisteredCustomer =
    viewer?.role === UserRole.CUSTOMER
      ? Boolean(
          await AppDataSource.getRepository(ContestRegistration).findOne({
            where: { contestId, userId: viewer.userId },
          }),
        )
      : false;

  if (
    !isOwner &&
    !isAssignedStaff &&
    !isRegisteredCustomer &&
    [ContestStatus.DRAFT, ContestStatus.CANCELLED].includes(contest.status)
  ) {
    throw new AppError('Contest chưa được công khai', 404, 'CONTEST_NOT_PUBLIC');
  }
  const [payload] = await mapContestPayload([contest]);
  const runtimeSummary = await getContestPublicRuntimeSummary(contestId, viewer).catch(() => null);
  const publishedLeaderboard = (contest.config?.published_leaderboard ?? null) as Record<
    string,
    unknown
  > | null;

  if (viewer?.role === UserRole.CUSTOMER) {
    const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
      where: { contestId, userId: viewer.userId },
    });
    if (registration) {
      const [mappedRegistration] = await mapContestRegistrationsPayload([registration], {
        includeContest: false,
      });
      return {
        ...payload,
        my_registration: mappedRegistration,
        published_leaderboard: publishedLeaderboard,
        runtime_summary: runtimeSummary,
        highlight_rounds: runtimeSummary?.highlight_rounds ?? [],
      };
    }
  }

  return {
    ...payload,
    operator_access: isOwner || isAssignedStaff,
    published_leaderboard: publishedLeaderboard,
    runtime_summary: runtimeSummary,
    highlight_rounds: runtimeSummary?.highlight_rounds ?? [],
  };
}

export async function createContest(viewer: Viewer, body: CreateContestBody) {
  assertProviderViewer(viewer);
  const [trackType, branches, catalog] = await Promise.all([
    AppDataSource.getRepository(TrackType).findOne({
      where: { id: body.track_type_id, isActive: true },
    }),
    resolveProviderBranchesOrThrow(viewer.userId, body.participating_cafe_ids),
    resolveCatalogOrThrow(body.contest_type_id, body.contest_format_id, body.contest_template_id, {
      requireReleasedFormat: true,
    }),
  ]);
  if (!trackType) throw new AppError('Track type không hợp lệ', 400, 'TRACK_TYPE_INVALID');
  await assertParticipatingCafesSupportTrackType(
    branches.map((branch) => branch.id),
    trackType.id,
  );
  const resourceLocks = await resolveContestResourceLocks(
    body.participating_cafe_ids,
    body.config,
    trackType.id,
  );
  await assertNoContestBookingConflicts({
    startsAt: body.starts_at,
    endsAt: body.ends_at,
    trackTypeId: trackType.id,
    resourceLocks,
  });
  const runtimeFormat = getRuntimeFormatFromCatalog(catalog.contestFormat.code);

  const repo = AppDataSource.getRepository(Contest);
  const contest = repo.create({
    cafeId: branches[0].id,
    providerId: viewer.userId,
    name: body.name,
    description: body.description ?? null,
    legacyTrackType: trackType.code,
    trackTypeId: trackType.id,
    contestTypeId: catalog.contestType.id,
    contestFormatId: catalog.contestFormat.id,
    contestTemplateId: catalog.contestTemplate.id,
    registrationOpensAt: body.registration_opens_at,
    registrationClosesAt: body.registration_closes_at,
    vehicleRule: body.vehicle_rule,
    bannerImageUrl: body.banner_image_url ?? null,
    config: mergeContestConfig(
      {
        ...(catalog.contestTemplate.defaultConfig ?? {}),
        ...stripRuntimeManagedConfig(body.config),
      },
      runtimeFormat,
      resourceLocks,
    ),
    startsAt: body.starts_at,
    endsAt: body.ends_at,
    capacity: body.capacity,
    entryFee: body.entry_fee,
    status: ContestStatus.DRAFT,
    createdBy: viewer.userId,
  });

  const saved = await repo.save(contest);
  const contestCafeRepo = AppDataSource.getRepository(ContestCafe);
  await contestCafeRepo.save(
    branches.map((branch, index) =>
      contestCafeRepo.create({
        contestId: saved.id,
        cafeId: branch.id,
        role: index === 0 ? 'HOST' : 'PARTICIPATING',
        displayOrder: index,
        checkInEnabled: true,
      }),
    ),
  );

  await writeContestAudit({
    contestId: saved.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.created',
    afterJson: { name: saved.name, status: saved.status },
  });

  return getContestDetail(saved.id, viewer);
}

export async function updateContest(contestId: string, viewer: Viewer, body: UpdateContestBody) {
  const contest = await assertContestProviderOrAssignedStaff(contestId, viewer);
  if (![ContestStatus.DRAFT, ContestStatus.OPEN].includes(contest.status)) {
    throw new AppError(
      'Chỉ được sửa contest ở trạng thái DRAFT hoặc OPEN',
      400,
      'CONTEST_NOT_EDITABLE',
    );
  }

  /*
    Đã có người đăng ký thì thông tin giải chốt lại.

    Cho sửa ở trạng thái OPEN là có lý do: chủ sân bấm mở rồi mới thấy sai chính
    tả hay sai giờ, và lúc đó chưa ai đăng ký nên sửa chẳng ảnh hưởng tới ai.

    Nhưng sau khi có người đăng ký thì mỗi trường đều là một lời hứa đã đưa ra:
    đổi ngày là họ tới sai hôm, đổi sân là tới sai chỗ, hạ sức chứa là có người
    mất suất, đổi lệ phí là người trả trước và người trả sau khác giá nhau. Không
    có bước nào báo cho họ biết, vì không có luồng thông báo đổi lịch.

    Nên chốt ở đây. Muốn đổi thì huỷ giải rồi mở giải khác — đường đó có chốt
    chặn tiền và có thông báo cho từng người.
  */
  if (contest.status === ContestStatus.OPEN) {
    const [row] = await AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
         FROM contest_registrations
        WHERE contest_id = $1 AND status <> 'CANCELLED'`,
      [contest.id],
    );
    const soNguoiDangKy = Number(row?.count ?? 0);
    if (soNguoiDangKy > 0) {
      throw new AppError(
        `Không sửa được: đã có ${soNguoiDangKy} người đăng ký giải này. Thông tin giải là cam kết với họ — muốn đổi thì phải huỷ giải và mở giải mới.`,
        409,
        'CONTEST_HAS_REGISTRATIONS',
        { registration_count: soNguoiDangKy },
      );
    }
  }

  let trackType: TrackType | null = null;
  if (body.track_type_id) {
    trackType = await AppDataSource.getRepository(TrackType).findOne({
      where: { id: body.track_type_id, isActive: true },
    });
    if (!trackType) throw new AppError('Track type không hợp lệ', 400, 'TRACK_TYPE_INVALID');
  }

  let catalog: Awaited<ReturnType<typeof resolveCatalogOrThrow>> | null = null;
  const nextTypeId = body.contest_type_id ?? contest.contestTypeId;
  const nextFormatId = body.contest_format_id ?? contest.contestFormatId;
  const nextTemplateId = body.contest_template_id ?? contest.contestTemplateId;
  if (nextTypeId && nextFormatId && nextTemplateId) {
    // Chỉ chặn khi provider ĐỔI sang thể thức khác. Update nào cũng resolve lại
    // catalog từ id sẵn có, nên chặn vô điều kiện sẽ khoá cứng giải cũ đang nằm
    // trên thể thức chưa phát hành — họ không sửa nổi cả cái tên.
    const isSwitchingFormat = Boolean(
      body.contest_format_id && body.contest_format_id !== contest.contestFormatId,
    );
    catalog = await resolveCatalogOrThrow(nextTypeId, nextFormatId, nextTemplateId, {
      requireReleasedFormat: isSwitchingFormat,
    });
  }

  const nextParticipatingCafeIds =
    body.participating_cafe_ids ??
    (
      await AppDataSource.getRepository(ContestCafe).find({
        where: { contestId: contest.id },
        order: { displayOrder: 'ASC' },
      })
    ).map((item) => item.cafeId);

  if (body.participating_cafe_ids) {
    if (contest.status !== ContestStatus.DRAFT) {
      throw new AppError(
        'Không thể thay đổi chi nhánh sau khi giải đấu đã mở đăng ký',
        400,
        'CONTEST_BRANCH_NOT_MODIFIABLE',
      );
    }
    const providerId = await resolveContestProviderIdForViewer(viewer, contest);
    const branches = await resolveProviderBranchesOrThrow(providerId, body.participating_cafe_ids);
    const existingCafes = await AppDataSource.getRepository(ContestCafe).find({
      where: { contestId: contest.id },
    });
    const existingByCafeId = new Map(existingCafes.map((item) => [item.cafeId, item]));

    await AppDataSource.getRepository(ContestCafe).delete({ contestId: contest.id });
    await AppDataSource.getRepository(ContestCafe).save(
      branches.map((branch, index) => {
        const existing = existingByCafeId.get(branch.id);
        return {
          contestId: contest.id,
          cafeId: branch.id,
          role: index === 0 ? 'HOST' : 'PARTICIPATING',
          displayOrder: index,
          checkInEnabled: existing?.checkInEnabled ?? true,
          capacityOverride: existing?.capacityOverride ?? null,
        };
      }),
    );
    contest.cafeId = branches[0].id;
  }

  const before = {
    name: contest.name,
    status: contest.status,
    registrationOpensAt: contest.registrationOpensAt,
    registrationClosesAt: contest.registrationClosesAt,
  };

  if (body.name !== undefined) contest.name = body.name;
  if (body.description !== undefined) contest.description = body.description ?? null;
  if (trackType) {
    contest.trackTypeId = trackType.id;
    contest.legacyTrackType = trackType.code;
  }
  if (catalog) {
    contest.contestTypeId = catalog.contestType.id;
    contest.contestFormatId = catalog.contestFormat.id;
    contest.contestTemplateId = catalog.contestTemplate.id;
  }
  if (body.registration_opens_at !== undefined)
    contest.registrationOpensAt = body.registration_opens_at;
  if (body.registration_closes_at !== undefined)
    contest.registrationClosesAt = body.registration_closes_at;
  if (body.vehicle_rule !== undefined) contest.vehicleRule = body.vehicle_rule;
  if (body.banner_image_url !== undefined) contest.bannerImageUrl = body.banner_image_url ?? null;
  if (body.starts_at !== undefined) contest.startsAt = body.starts_at;
  if (body.ends_at !== undefined) contest.endsAt = body.ends_at;
  if (body.capacity !== undefined) contest.capacity = body.capacity;
  if (body.entry_fee !== undefined) contest.entryFee = body.entry_fee;

  const nextTrackTypeId = contest.trackTypeId;
  if (!nextTrackTypeId) {
    throw new AppError('Contest chưa có track type hợp lệ', 400, 'TRACK_TYPE_INVALID');
  }
  await assertParticipatingCafesSupportTrackType(nextParticipatingCafeIds, nextTrackTypeId);
  const nextRuntimeFormat = getRuntimeFormatFromCatalog(
    catalog?.contestFormat.code ??
      (
        await AppDataSource.getRepository(ContestFormat).findOne({
          where: { id: contest.contestFormatId ?? undefined },
        })
      )?.code ??
      'KNOCKOUT',
  );
  const baseConfig =
    body.config !== undefined
      ? {
          ...(catalog?.contestTemplate.defaultConfig ?? {}),
          ...stripRuntimeManagedConfig(body.config),
        }
      : {
          ...stripRuntimeManagedConfig(contest.config),
        };
  const resourceLocks = await resolveContestResourceLocks(
    nextParticipatingCafeIds,
    {
      ...baseConfig,
      resource_locks:
        body.config && typeof body.config === 'object'
          ? (body.config.resource_locks as unknown)
          : contest.config?.resource_locks,
    },
    nextTrackTypeId,
  );
  await assertNoContestBookingConflicts({
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    trackTypeId: nextTrackTypeId,
    resourceLocks,
  });
  contest.config = mergeContestConfig(baseConfig, nextRuntimeFormat, resourceLocks);

  await AppDataSource.getRepository(Contest).save(contest);
  await writeContestAudit({
    contestId: contest.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.updated',
    beforeJson: before,
    afterJson: {
      name: contest.name,
      status: contest.status,
      registrationOpensAt: contest.registrationOpensAt,
      registrationClosesAt: contest.registrationClosesAt,
    },
  });
  return getContestDetail(contest.id, viewer);
}
/**
 * Không cho huỷ giải khi tiền lệ phí đang nằm trong tay chủ sân.
 *
 * Nền tảng KHÔNG có luồng hoàn lệ phí giải. Trước đây huỷ giải vẫn chạy trót
 * lọt: `cleanUpContestOnCancel` huỷ hết đăng ký rồi ghi một cờ `refund_needed`
 * vào metadata — mà cờ đó không màn hình nào đọc, không báo cáo nào tổng hợp,
 * không thông báo nào gửi đi. Mười lăm người đã trả một trăm nghìn mỗi người là
 * một triệu rưỡi biến mất khỏi mọi giao diện, và không ai trong hệ thống biết
 * còn nợ ai đồng nào.
 *
 * Vì vậy chặn tại đây, và chặn theo TIỀN chứ không theo trạng thái giải: giải
 * mở đăng ký mà chưa ai trả thì huỷ vẫn vô hại. Chặn theo trạng thái sẽ nhốt
 * cứng những giải phải huỷ vì lý do thật — mưa, mất điện, sân hỏng — vì bảng
 * chuyển trạng thái không có đường nào khác ra khỏi `CLOSED`.
 *
 * Đường ra khi đã thu tiền: chủ sân hoàn tiền mặt cho từng người rồi bấm "miễn
 * lệ phí" trên đăng ký đó để chốt sổ. Miễn hết thì huỷ được giải. Chậm, nhưng
 * mỗi đồng đều có người ký tên vào.
 */
async function assertNoCollectedEntryFees(contestId: string): Promise<void> {
  const rows = await AppDataSource.query<{ count: string; total: string | null }[]>(
    `SELECT COUNT(*)::text AS count, SUM(entry_fee_amount)::text AS total
       FROM contest_registrations
      WHERE contest_id = $1
        AND payment_status = 'MARKED_PAID'
        AND status <> 'CANCELLED'`,
    [contestId],
  );
  const paidCount = Number(rows[0]?.count ?? 0);
  if (paidCount === 0) return;

  const total = Number(rows[0]?.total ?? 0);
  throw new AppError(
    `Không huỷ được giải: ${paidCount} vận động viên đã nộp lệ phí` +
      (total > 0 ? ` (tổng ${total.toLocaleString('vi-VN')}đ)` : '') +
      `. Hệ thống không tự hoàn tiền — hãy hoàn tiền cho từng người rồi bấm "Miễn lệ phí" trên đăng ký của họ, sau đó mới huỷ giải được.`,
    409,
    'CONTEST_HAS_COLLECTED_FEES',
    { paid_count: paidCount, paid_total: total },
  );
}

export async function changeContestStatus(
  contestId: string,
  viewer: Viewer,
  nextStatus: ContestStatus.OPEN | ContestStatus.CLOSED | ContestStatus.CANCELLED,
) {
  const contest = await assertContestProviderOrAssignedStaff(contestId, viewer);
  const allowedTransitions: Record<string, ContestStatus[]> = {
    [ContestStatus.DRAFT]: [ContestStatus.OPEN, ContestStatus.CANCELLED],
    [ContestStatus.OPEN]: [ContestStatus.CLOSED, ContestStatus.CANCELLED],
    [ContestStatus.CLOSED]: [ContestStatus.CANCELLED],
    [ContestStatus.RUNNING]: [ContestStatus.CANCELLED],
  };

  if (!allowedTransitions[contest.status]?.includes(nextStatus)) {
    throw new AppError(
      'Không thể chuyển contest sang trạng thái này',
      400,
      'CONTEST_STATUS_INVALID',
    );
  }

  // Mở đăng ký là lúc giải bắt đầu tiêu tốn tài nguyên nền tảng và xuất hiện
  // trước khách, nên đây là cửa thu phí. Huỷ giải thì không chặn.
  if (nextStatus === ContestStatus.OPEN) {
    await assertContestFeePaid(contest);
  }

  if (nextStatus === ContestStatus.CANCELLED) {
    await assertNoCollectedEntryFees(contest.id);
    await cleanUpContestOnCancel(contest.id, viewer.userId);
  }

  contest.status = nextStatus;
  await AppDataSource.getRepository(Contest).save(contest);
  await writeContestAudit({
    contestId: contest.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType:
      nextStatus === ContestStatus.OPEN
        ? 'contest.opened'
        : nextStatus === ContestStatus.CLOSED
          ? 'contest.closed'
          : 'contest.cancelled',
    afterJson: { status: nextStatus },
  });

  return getContestDetail(contest.id, viewer);
}

/**
 * Mở sớm cổng đăng ký của đúng một giải phục vụ Contest Lab.
 *
 * Đây không phải bypass của API đăng ký: contest vẫn phải OPEN và mọi guard
 * capacity, policy, ban, phí vẫn chạy như production. Dev-tool chỉ đưa mốc mở
 * đăng ký về hiện tại; lùi một phút để tránh lệch đồng hồ nhỏ giữa FE và BE.
 */
export async function openContestRegistrationForDemo(contestId: string, viewer: Viewer) {
  const contest = await assertContestOwner(contestId, viewer);
  if (contest.status !== ContestStatus.OPEN) {
    throw new AppError('Chỉ contest OPEN mới có thể mở đăng ký ngay', 400, 'CONTEST_NOT_OPEN');
  }

  const now = new Date();
  if (contest.registrationClosesAt && contest.registrationClosesAt <= now) {
    throw new AppError('Contest đã qua thời gian đóng đăng ký', 400, 'CONTEST_REGISTRATION_CLOSED');
  }

  if (contest.registrationOpensAt && contest.registrationOpensAt <= now) {
    return getContestDetail(contest.id, viewer);
  }

  const previousOpensAt = contest.registrationOpensAt;
  contest.registrationOpensAt = new Date(now.getTime() - 60_000);
  await AppDataSource.getRepository(Contest).save(contest);
  await writeContestAudit({
    contestId: contest.id,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.registration_opened_early_for_demo',
    beforeJson: { registration_opens_at: previousOpensAt },
    afterJson: { registration_opens_at: contest.registrationOpensAt },
    reason: 'CONTEST_LAB',
  });

  return getContestDetail(contest.id, viewer);
}
export async function uploadContestBanner(
  contestId: string,
  viewer: Viewer,
  file: { buffer: Buffer; mimetype: string },
) {
  const contest = await assertContestOperator(contestId, viewer);

  const result = await uploadImage({
    buffer: file.buffer,
    folder: `rcfield/contests/${contest.providerId ?? 'unknown'}`,
    publicIdPrefix: `contest-banner-${contest.id}`,
  });

  const previousBannerUrl = contest.bannerImageUrl;
  contest.bannerImageUrl = result.url;
  await AppDataSource.getRepository(Contest).save(contest);

  await writeContestAudit({
    contestId,
    actorId: viewer.userId,
    actorRole: viewer.role,
    eventType: 'contest.banner_uploaded',
    beforeJson: { banner_image_url: previousBannerUrl },
    afterJson: { banner_image_url: result.url, public_id: result.publicId },
  });

  return {
    banner_image_url: result.url,
    public_id: result.publicId,
  };
}
