import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { Cafe } from '../../models/cafe.entity';
import { ContestCafe } from '../../models/contest-cafe.entity';
import { ContestFormat } from '../../models/contest-format.entity';
import { ContestRegistration } from '../../models/contest-registration.entity';
import { ContestStaffAssignment } from '../../models/contest-staff-assignment.entity';
import { ContestTemplate } from '../../models/contest-template.entity';
import { ContestType } from '../../models/contest-type.entity';
import { Contest } from '../../models/contest.entity';
import { TrackType } from '../../models/track-type.entity';
import { User } from '../../models/user.entity';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  ContestStatus,
} from '../../types';

export function getRegistrationStatusLabel(status: ContestRegistrationStatus) {
  switch (status) {
    case ContestRegistrationStatus.PENDING:
      return 'Chờ duyệt';
    case ContestRegistrationStatus.CONFIRMED:
      return 'Đã duyệt';
    case ContestRegistrationStatus.CHECKED_IN:
      return 'Đã điểm danh';
    case ContestRegistrationStatus.CANCELLED:
      return 'Đã huỷ';
    default:
      return status;
  }
}

export function getPaymentStatusLabel(status: ContestEntryFeePaymentStatus) {
  switch (status) {
    case ContestEntryFeePaymentStatus.NOT_REQUIRED:
      return 'Không thu phí';
    case ContestEntryFeePaymentStatus.PENDING_PAYMENT:
      return 'Chờ thanh toán';
    case ContestEntryFeePaymentStatus.PENDING_REVIEW:
      return 'Chờ xác nhận';
    case ContestEntryFeePaymentStatus.WAIVED:
      return 'Đã miễn phí';
    case ContestEntryFeePaymentStatus.MARKED_PAID:
      return 'Đã thu tiền';
    default:
      return status;
  }
}

export async function loadContestCatalogMaps(contests: Contest[]) {
  const trackTypeIds = Array.from(
    new Set(contests.map((item) => item.trackTypeId).filter(Boolean)),
  ) as string[];
  const typeIds = Array.from(
    new Set(contests.map((item) => item.contestTypeId).filter(Boolean)),
  ) as string[];
  const formatIds = Array.from(
    new Set(contests.map((item) => item.contestFormatId).filter(Boolean)),
  ) as string[];
  const templateIds = Array.from(
    new Set(contests.map((item) => item.contestTemplateId).filter(Boolean)),
  ) as string[];
  const contestIds = contests.map((item) => item.id);

  const [trackTypes, types, formats, templates, contestCafes, registrations, directAssignments] =
    await Promise.all([
      trackTypeIds.length > 0
        ? AppDataSource.getRepository(TrackType).findBy({ id: In(trackTypeIds) })
        : Promise.resolve([]),
      typeIds.length > 0
        ? AppDataSource.getRepository(ContestType).findBy({ id: In(typeIds) })
        : Promise.resolve([]),
      formatIds.length > 0
        ? AppDataSource.getRepository(ContestFormat).findBy({ id: In(formatIds) })
        : Promise.resolve([]),
      templateIds.length > 0
        ? AppDataSource.getRepository(ContestTemplate).findBy({ id: In(templateIds) })
        : Promise.resolve([]),
      contestIds.length > 0
        ? AppDataSource.getRepository(ContestCafe).findBy({ contestId: In(contestIds) })
        : Promise.resolve([]),
      contestIds.length > 0
        ? AppDataSource.getRepository(ContestRegistration).findBy({ contestId: In(contestIds) })
        : Promise.resolve([]),
      contestIds.length > 0
        ? AppDataSource.getRepository(ContestStaffAssignment).findBy({ contestId: In(contestIds) })
        : Promise.resolve([]),
    ]);

  // Đếm trận bằng MỘT truy vấn gộp cho cả trang, không phải mỗi giải một lần.
  // Danh sách giải trước đây không có số liệu này nên nhãn luôn hiện "Chưa tạo
  // bracket" kể cả khi sơ đồ đã bốc xong.
  const matchStatsRows =
    contestIds.length > 0
      ? await AppDataSource.query<
          { contest_id: string; total: string; rounds: string; running: string }[]
        >(
          `SELECT contest_id,
                  COUNT(*)                                   AS total,
                  COUNT(DISTINCT round_no)                    AS rounds,
                  COUNT(*) FILTER (WHERE status = 'RUNNING')  AS running
             FROM contest_matches
            WHERE contest_id = ANY($1::uuid[])
            GROUP BY contest_id`,
          [contestIds],
        )
      : [];

  const feeOrderRows =
    contestIds.length > 0
      ? await AppDataSource.query<{ contest_id: string; amount: string }[]>(
          `SELECT contest_id, amount::text
             FROM contest_fee_orders
            WHERE contest_id = ANY($1::uuid[])
              AND status = 'PAID'`,
          [contestIds],
        ).catch(() => [])
      : [];

  const cafeIds = Array.from(new Set(contestCafes.map((item) => item.cafeId)));
  const staffIds = Array.from(new Set(directAssignments.map((item) => item.staffId)));
  const cafes =
    cafeIds.length > 0 ? await AppDataSource.getRepository(Cafe).findBy({ id: In(cafeIds) }) : [];
  const staffs =
    staffIds.length > 0 ? await AppDataSource.getRepository(User).findBy({ id: In(staffIds) }) : [];

  return {
    providerFeeMap: new Map(feeOrderRows.map((row) => [row.contest_id, Number(row.amount)])),
    matchStatsByContest: new Map(
      matchStatsRows.map((row) => [
        row.contest_id,
        {
          total: Number(row.total),
          rounds: Number(row.rounds),
          running: Number(row.running),
        },
      ]),
    ),
    trackTypeMap: new Map(trackTypes.map((item) => [item.id, item])),
    typeMap: new Map(types.map((item) => [item.id, item])),
    formatMap: new Map(formats.map((item) => [item.id, item])),
    templateMap: new Map(templates.map((item) => [item.id, item])),
    cafesByContest: contestCafes.reduce<Map<string, ContestCafe[]>>((map, item) => {
      const list = map.get(item.contestId) ?? [];
      list.push(item);
      map.set(item.contestId, list);
      return map;
    }, new Map()),
    cafeMap: new Map(cafes.map((item) => [item.id, item])),
    registrationStatsByContest: registrations.reduce<
      Map<string, { total: number; checkedIn: number; confirmed: number; feePaid: number }>
    >((map, item) => {
      const current = map.get(item.contestId) ?? {
        total: 0,
        checkedIn: 0,
        confirmed: 0,
        feePaid: 0,
      };
      if (item.status !== ContestRegistrationStatus.CANCELLED) current.total += 1;
      if (item.status === ContestRegistrationStatus.CHECKED_IN) current.checkedIn += 1;
      if (item.status === ContestRegistrationStatus.CONFIRMED) current.confirmed += 1;
      /*
        Số người ĐÃ NỘP lệ phí — cùng điều kiện với `assertNoCollectedEntryFees`
        ở `contests-crud.ts`, vì giao diện dùng nó để quyết định có hiện nút Huỷ
        hay không.

        Hai bên lệch điều kiện thì nút hiện ra rồi bấm vào bị từ chối, hoặc tệ
        hơn là nút bị ẩn trong khi thật ra huỷ được — chủ sân không có cách nào
        biết vì sao.
      */
      if (
        item.status !== ContestRegistrationStatus.CANCELLED &&
        item.paymentStatus === ContestEntryFeePaymentStatus.MARKED_PAID
      ) {
        current.feePaid += 1;
      }
      map.set(item.contestId, current);
      return map;
    }, new Map()),
    staffAssignmentsByContest: directAssignments.reduce<Map<string, ContestStaffAssignment[]>>(
      (map, item) => {
        const list = map.get(item.contestId) ?? [];
        list.push(item);
        map.set(item.contestId, list);
        return map;
      },
      new Map(),
    ),
    staffMap: new Map(staffs.map((item) => [item.id, item])),
  };
}

export async function mapContestPayload(contests: Contest[]) {
  const {
    providerFeeMap,
    trackTypeMap,
    typeMap,
    formatMap,
    templateMap,
    cafesByContest,
    cafeMap,
    registrationStatsByContest,
    staffAssignmentsByContest,
    staffMap,
    matchStatsByContest,
  } = await loadContestCatalogMaps(contests);

  return contests.map((contest) => {
    const branches = (cafesByContest.get(contest.id) ?? [])
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => {
        const cafe = cafeMap.get(item.cafeId);
        return {
          id: item.id,
          cafe_id: item.cafeId,
          role: item.role,
          capacity_override: item.capacityOverride,
          check_in_enabled: item.checkInEnabled,
          display_order: item.displayOrder,
          cafe: cafe
            ? {
                id: cafe.id,
                name: cafe.name,
                district: cafe.district,
                city: cafe.city,
                status: cafe.status,
              }
            : null,
        };
      });

    const hostBranch = branches.find((item) => item.role === 'HOST') ?? branches[0] ?? null;
    const trackType = contest.trackTypeId ? (trackTypeMap.get(contest.trackTypeId) ?? null) : null;
    const contestType = contest.contestTypeId ? (typeMap.get(contest.contestTypeId) ?? null) : null;
    const contestFormat = contest.contestFormatId
      ? (formatMap.get(contest.contestFormatId) ?? null)
      : null;
    const contestTemplate = contest.contestTemplateId
      ? (templateMap.get(contest.contestTemplateId) ?? null)
      : null;
    const registrationStats = registrationStatsByContest.get(contest.id) ?? {
      total: 0,
      checkedIn: 0,
      confirmed: 0,
      feePaid: 0,
    };
    const resourceLocks = Array.isArray(contest.config?.resource_locks)
      ? (contest.config.resource_locks as unknown[])
      : [];
    const staffAssignments = (staffAssignmentsByContest.get(contest.id) ?? []).map((assignment) => {
      const staff = staffMap.get(assignment.staffId);
      return {
        id: assignment.id,
        staff_id: assignment.staffId,
        assigned_by: assignment.assignedBy,
        assigned_at: assignment.assignedAt,
        staff: staff
          ? {
              id: staff.id,
              full_name: staff.full_name,
              email: staff.email,
            }
          : null,
      };
    });

    const matchStats = matchStatsByContest.get(contest.id) ?? {
      total: 0,
      rounds: 0,
      running: 0,
    };

    const providerFeeAmount = providerFeeMap.get(contest.id) ?? 0;

    return {
      id: contest.id,
      provider_id: contest.providerId,
      provider_fee_amount: providerFeeAmount,
      match_stats: {
        total: matchStats.total,
        total_rounds: matchStats.rounds,
        has_live_matches: matchStats.running > 0,
      },
      name: contest.name,
      description: contest.description,
      status: contest.status,
      starts_at: contest.startsAt,
      ends_at: contest.endsAt,
      /**
       * Máy chủ có đang bỏ qua khung giờ điểm danh hay không.
       *
       * Giao diện phải HỎI chứ không tự đoán: trước đây nó dựa vào một biến
       * `VITE_*` nướng vào bản build, nên đổi cờ ở máy chủ mà không build lại
       * giao diện thì nút vẫn khoá — máy chủ đồng ý nhưng không ai bấm được.
       * Đọc từ đây thì hai bên luôn cùng một câu trả lời.
       */
      check_in_window_bypassed: env.bypassContestCheckInWindow,
      registration_window_bypassed: env.bypassContestRegistrationWindow,
      registration_opens_at: contest.registrationOpensAt,
      registration_closes_at: contest.registrationClosesAt,
      capacity: contest.capacity,
      entry_fee: Number(contest.entryFee ?? 0),
      banner_image_url: contest.bannerImageUrl,
      vehicle_rule: contest.vehicleRule,
      config: contest.config ?? {},
      resource_locks: resourceLocks,
      prize_structure:
        (contest.config?.prize_structure as Record<string, unknown> | undefined) ??
        (contest.config?.prizes as unknown[] | undefined) ??
        null,
      created_by: contest.createdBy,
      created_at: contest.createdAt,
      updated_at: contest.updatedAt,
      host_branch: hostBranch,
      participating_branches: branches,
      track_type: trackType
        ? {
            id: trackType.id,
            code: trackType.code,
            name: trackType.name,
            description: trackType.description,
          }
        : null,
      contest_type: contestType
        ? {
            id: contestType.id,
            code: contestType.code,
            name: contestType.name,
            description: contestType.description,
          }
        : null,
      contest_format: contestFormat
        ? {
            id: contestFormat.id,
            code: contestFormat.code,
            name: contestFormat.name,
            description: contestFormat.description,
            supports_bracket: contestFormat.supportsBracket,
            supports_time_attack: contestFormat.supportsTimeAttack,
            supports_multi_round: contestFormat.supportsMultiRound,
          }
        : null,
      contest_template: contestTemplate
        ? {
            id: contestTemplate.id,
            code: contestTemplate.code,
            name: contestTemplate.name,
            description: contestTemplate.description,
            default_config: contestTemplate.defaultConfig,
            vehicle_policy_options: contestTemplate.vehiclePolicyOptions,
            feature_flags: contestTemplate.featureFlags,
          }
        : null,
      public_stats: {
        registration_count: registrationStats.total,
        confirmed_count: registrationStats.confirmed,
        checked_in_count: registrationStats.checkedIn,
        /** Đã nộp lệ phí — có người thì không huỷ được giải. */
        entry_fee_paid_count: registrationStats.feePaid,
        capacity_remaining:
          contest.capacity && contest.capacity > 0
            ? Math.max(0, contest.capacity - registrationStats.total)
            : null,
      },
      staff_assignments: staffAssignments,
    };
  });
}

export async function loadUsersMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, User>();
  const users = await AppDataSource.getRepository(User).findBy({ id: In(userIds) });
  return new Map(users.map((item) => [item.id, item]));
}

export function getUserRacingProfile(user?: User | null) {
  const profile = (user?.racing_profile ?? {}) as Record<string, unknown>;
  return {
    driverHandle: typeof profile.driver_handle === 'string' ? profile.driver_handle : null,
    titleLabel:
      typeof profile.current_title_label === 'string' ? profile.current_title_label : null,
  };
}

export async function loadLatestMatchMapForRegistrations(registrationIds: string[]) {
  if (registrationIds.length === 0) return new Map<string, Record<string, unknown>>();

  const rows = await AppDataSource.query<
    {
      registration_id: string;
      participant_status: string;
      finish_position: number | null;
      is_winner: boolean;
      match_id: string;
      contest_id: string;
      round_no: number;
      match_no: number;
      name: string | null;
      match_status: string;
      match_type: string;
      scheduled_at: string | null;
      started_at: string | null;
      ended_at: string | null;
      next_match_id: string | null;
    }[]
  >(
    `SELECT DISTINCT ON (p.registration_id)
       p.registration_id,
       p.status AS participant_status,
       p.finish_position,
       p.is_winner,
       m.id AS match_id,
       m.contest_id,
       m.round_no,
       m.match_no,
       m.name,
       m.status AS match_status,
       m.match_type,
       m.scheduled_at,
       m.started_at,
       m.ended_at,
       m.next_match_id
     FROM contest_match_participants p
     JOIN contest_matches m ON m.id = p.match_id
     WHERE p.registration_id = ANY($1::uuid[])
     ORDER BY p.registration_id, m.round_no DESC, m.match_no DESC, m.created_at DESC`,
    [registrationIds],
  );

  return new Map(
    rows.map((row) => [
      row.registration_id,
      {
        match_id: row.match_id,
        contest_id: row.contest_id,
        round_no: row.round_no,
        match_no: row.match_no,
        name: row.name,
        status: row.match_status,
        match_type: row.match_type,
        scheduled_at: row.scheduled_at,
        started_at: row.started_at,
        ended_at: row.ended_at,
        next_match_id: row.next_match_id,
        participant_status: row.participant_status,
        finish_position: row.finish_position,
        is_winner: row.is_winner,
      },
    ]),
  );
}

export function deriveCustomerJourneyStatus(
  registration: ContestRegistration,
  contest: { status: ContestStatus } | undefined,
  latestMatch: Record<string, unknown> | undefined,
) {
  if (registration.status === ContestRegistrationStatus.CANCELLED) return 'CANCELLED';
  if (registration.status === ContestRegistrationStatus.PENDING) return 'PENDING_APPROVAL';
  if (registration.status === ContestRegistrationStatus.CONFIRMED)
    return 'APPROVED_WAITING_CHECKIN';

  if (!latestMatch) return 'CHECKED_IN_WAITING_BRACKET';

  const matchStatus = String(latestMatch.status ?? '');
  const isWinner = Boolean(latestMatch.is_winner);
  if (contest?.status === ContestStatus.COMPLETED) return 'FINISHED';
  if (matchStatus === 'RUNNING') return 'IN_BRACKET';
  if (matchStatus === 'COMPLETED' && isWinner) return 'ADVANCED';
  if (matchStatus === 'COMPLETED' && !isWinner) return 'ELIMINATED';

  return 'CHECKED_IN_WAITING_BRACKET';
}

/**
 * Thời điểm suất trong giải bị nhả nếu chưa trả lệ phí.
 *
 * Điều kiện ở đây phải khớp TỪNG CÁI với truy vấn dọn của job
 * (`booking-timeout.job.ts` — `expireUnpaidContestRegistrations`). Lệch nhau là
 * màn hình hứa một hạn còn hệ thống thi hành một hạn khác, và người dùng mất
 * suất đúng lúc họ tin là còn thời gian.
 *
 * `null` khi không có gì để quá hạn: đã trả, được miễn, giải miễn phí, hoặc lệ
 * phí gộp trong đơn đặt (đơn đó có cơ chế hết hạn riêng).
 */
function entryFeeHoldExpiresAt(registration: ContestRegistration): string | null {
  if (registration.paymentStatus !== ContestEntryFeePaymentStatus.PENDING_PAYMENT) return null;
  if (Number(registration.entryFeeAmount ?? 0) <= 0) return null;
  if (registration.bookingId) return null;
  return new Date(
    registration.createdAt.getTime() + env.platform.paymentWindowMinutes * 60_000,
  ).toISOString();
}

export async function mapContestRegistrationsPayload(
  registrations: ContestRegistration[],
  options?: { includeContest?: boolean },
) {
  const userMap = await loadUsersMap(
    Array.from(new Set(registrations.map((item) => item.userId).filter(Boolean))),
  );
  const contestMap = options?.includeContest
    ? new Map(
        (
          await mapContestPayload(
            await AppDataSource.getRepository(Contest).findBy({
              id: In(Array.from(new Set(registrations.map((item) => item.contestId)))),
            }),
          )
        ).map((item) => [item.id, item]),
      )
    : new Map<string, Awaited<ReturnType<typeof mapContestPayload>>[number]>();
  const latestMatchMap = await loadLatestMatchMapForRegistrations(
    registrations.map((item) => item.id),
  );

  return registrations.map((registration) => {
    const user = userMap.get(registration.userId);
    const contest = contestMap.get(registration.contestId);
    const latestMatch = latestMatchMap.get(registration.id);

    return {
      id: registration.id,
      contest_id: registration.contestId,
      user_id: registration.userId,
      status: registration.status,
      vehicle_source: registration.vehicleSource,
      vehicle_id: registration.vehicleId,
      // Dòng xe VĐV đã đặt: nhân viên cần biết để chọn đúng chiếc lúc giao xe.
      rental_catalog_id: registration.rentalCatalogId,
      rental_cafe_id: registration.rentalCafeId,
      booking_id: registration.bookingId,
      check_in_code: registration.checkInCode,
      checked_in_cafe_id: registration.checkedInCafeId,
      checked_in_by: registration.checkedInBy,
      checked_in_at: registration.checkedInAt,
      payment_status: registration.paymentStatus,
      entry_fee_amount: Number(registration.entryFeeAmount ?? 0),
      entry_fee_hold_expires_at: entryFeeHoldExpiresAt(registration),
      cancellation_reason: registration.cancellationReason,
      metadata: registration.metadata ?? {},
      created_at: registration.createdAt,
      updated_at: registration.updatedAt,
      participant: user
        ? {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            avatar_url: user.avatar_url,
            driver_handle: getUserRacingProfile(user).driverHandle,
            driver_title_label: getUserRacingProfile(user).titleLabel,
          }
        : null,
      contest: contest ?? null,
      latest_match: latestMatch ?? null,
      customer_journey_status: deriveCustomerJourneyStatus(
        registration,
        contest ? { status: contest.status } : undefined,
        latestMatch,
      ),
    };
  });
}
