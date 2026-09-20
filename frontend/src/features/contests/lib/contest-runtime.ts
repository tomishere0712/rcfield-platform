import type {
  ContestAuditLogItem,
  ContestItem,
  ContestLeaderboardPayload,
  ContestMatch,
  ContestMatchParticipant,
  ContestRegistration,
  ContestUpdateMatchParticipantsBody,
} from "../types"

/**
 * Ai được đưa vào lượt thi đấu.
 *
 * Đấu loại bốc thăm SAU khi đóng đăng ký và TRƯỚC ngày thi, nên lấy người đã
 * được duyệt — chờ tới lúc điểm danh mới bốc thì khách không biết trước đối thủ
 * và giờ đấu của mình. Các thể thức còn lại vẫn xếp lượt tại chỗ theo người có
 * mặt, nên chỉ nhận người đã điểm danh.
 */
export function getEligibleRuntimeRegistrations(
  registrations: ContestRegistration[],
  options?: { includeConfirmed?: boolean },
) {
  return registrations.filter((registration) =>
    options?.includeConfirmed
      ? registration.status === "CONFIRMED" ||
        registration.status === "CHECKED_IN"
      : registration.status === "CHECKED_IN",
  )
}

export function groupMatchesByRound(matches: ContestMatch[]) {
  return matches.reduce<Array<{ roundNo: number; matches: ContestMatch[] }>>(
    (groups, match) => {
      const group = groups.find((item) => item.roundNo === match.round_no)
      if (group) {
        group.matches.push(match)
        return groups
      }
      groups.push({ roundNo: match.round_no, matches: [match] })
      return groups
    },
    [],
  )
}

export function formatContestDateTime(value?: string | null) {
  if (!value) return "--"
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDurationSeconds(value?: number | null) {
  if (value === null || value === undefined) return "--"
  return `${value.toFixed(3)}s`
}

export function formatMatchLabel(match: ContestMatch) {
  return (
    match.name?.trim() || `Vòng ${match.round_no} · Lượt đấu ${match.match_no}`
  )
}

export function getRegistrationDisplayName(
  registration?: ContestRegistration | null,
) {
  return (
    registration?.participant?.fullName?.trim() ||
    registration?.participant?.email?.trim() ||
    registration?.checkInCode?.trim() ||
    (registration?.id
      ? `Mã đăng ký ${registration.id.slice(0, 8)}`
      : "Người chơi chưa xác định")
  )
}

export function getRegistrationSubtitle(
  registration?: ContestRegistration | null,
) {
  return (
    registration?.participant?.email?.trim() ||
    registration?.checkInCode?.trim() ||
    null
  )
}

export function getMatchParticipantName(
  participant?: ContestMatchParticipant | null,
) {
  return (
    participant?.registration?.participant_name?.trim() ||
    participant?.registration?.participant_email?.trim() ||
    `Mã đăng ký ${participant?.registration_id.slice(0, 8) ?? "--"}`
  )
}

export function getMatchParticipantSubtitle(
  participant?: ContestMatchParticipant | null,
) {
  return (
    participant?.registration?.participant_email?.trim() ||
    participant?.registration?.check_in_code?.trim() ||
    null
  )
}

export function getOpponentsForRegistration(
  match: ContestMatch | null | undefined,
  registrationId: string,
) {
  if (!match) return []
  return match.participants.filter(
    (participant) => participant.registration_id !== registrationId,
  )
}

export function getPublishedLeaderboard(contest?: ContestItem | null) {
  return (contest?.config?.published_leaderboard ??
    null) as ContestLeaderboardPayload | null
}

export function getAuditGroup(log: ContestAuditLogItem) {
  if (log.eventType.startsWith("match.")) return "match"
  // booking.* = vòng đời xe thuê của đăng ký → gom vào nhóm Đăng ký.
  if (
    log.eventType.startsWith("registration.") ||
    log.eventType.startsWith("booking.")
  )
    return "registration"
  // race_records.* (sync leaderboard) và contest.* → nhóm Giải đấu.
  return "contest"
}

export function getErrorMessage(error: unknown) {
  const maybe = error as {
    response?: { data?: { message?: string; code?: string } }
    message?: string
  }
  return {
    message:
      maybe.response?.data?.message ?? maybe.message ?? "Vui lòng thử lại.",
    code: maybe.response?.data?.code,
  }
}

export type ContestMatchPhase = "QUALIFYING" | "FINAL"

export function getContestRuntimeFormat(
  contest?: Pick<ContestItem, "config" | "contest_format"> | null,
) {
  return String(
    contest?.config?.runtime_format ??
      contest?.config?.format ??
      contest?.contest_format?.code ??
      "",
  )
}

export function isQualifyingFinalFormat(format?: string | null) {
  return format === "QUALIFYING_FINAL"
}

export function getMatchPhase(match: ContestMatch): ContestMatchPhase {
  return match.metadata?.phase === "FINAL" ? "FINAL" : "QUALIFYING"
}

export function splitMatchesByPhase(matches: ContestMatch[]) {
  const qualifying: ContestMatch[] = []
  const final: ContestMatch[] = []
  for (const match of matches) {
    if (getMatchPhase(match) === "FINAL") {
      final.push(match)
    } else {
      qualifying.push(match)
    }
  }
  return { qualifying, final }
}

export function areAllMatchesCompleted(matches: ContestMatch[]) {
  return (
    matches.length > 0 && matches.every((match) => match.status === "COMPLETED")
  )
}

export type QualifyingStanding = {
  registrationId: string
  participant: ContestMatchParticipant
  bestLapSeconds: number | null
  totalTimeSeconds: number | null
  matchId: string
}

export function getQualifyingStandings(
  matches: ContestMatch[],
): QualifyingStanding[] {
  const bestByRegistration = new Map<string, QualifyingStanding>()
  for (const match of matches) {
    for (const participant of match.participants) {
      // Khớp với aggregateQualifyingResults ở backend: người không có một kết
      // quả hợp lệ nào không được chiếm suất chung kết.
      if (["DNS", "DNF", "DQ"].includes(participant.status)) continue

      const current = bestByRegistration.get(participant.registration_id)
      const bestLap = participant.best_lap_seconds
      const totalTime = participant.total_time_seconds
      if (bestLap === null && totalTime === null) continue

      if (!current) {
        bestByRegistration.set(participant.registration_id, {
          registrationId: participant.registration_id,
          participant,
          bestLapSeconds: bestLap,
          totalTimeSeconds: totalTime,
          matchId: match.id,
        })
        continue
      }

      const hasBetterLap =
        bestLap !== null &&
        (current.bestLapSeconds === null || bestLap < current.bestLapSeconds)
      bestByRegistration.set(participant.registration_id, {
        ...current,
        participant: hasBetterLap ? participant : current.participant,
        matchId: hasBetterLap ? match.id : current.matchId,
        bestLapSeconds:
          bestLap === null
            ? current.bestLapSeconds
            : current.bestLapSeconds === null
              ? bestLap
              : Math.min(current.bestLapSeconds, bestLap),
        totalTimeSeconds:
          totalTime === null
            ? current.totalTimeSeconds
            : current.totalTimeSeconds === null
              ? totalTime
              : Math.min(current.totalTimeSeconds, totalTime),
      })
    }
  }
  return [...bestByRegistration.values()].sort((a, b) => {
    const lapDelta =
      (a.bestLapSeconds ?? Number.MAX_SAFE_INTEGER) -
      (b.bestLapSeconds ?? Number.MAX_SAFE_INTEGER)
    if (lapDelta !== 0) return lapDelta

    const totalDelta =
      (a.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER) -
      (b.totalTimeSeconds ?? Number.MAX_SAFE_INTEGER)
    if (totalDelta !== 0) return totalDelta

    return (
      (a.participant.seed_no ?? Number.MAX_SAFE_INTEGER) -
      (b.participant.seed_no ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

export type ByocDeclaration = {
  vehicle_name: string | null
  vehicle_brand: string | null
  vehicle_class: string | null
  notes: string | null
  photos: string[]
}

/**
 * Bản khai xe cá nhân mà VĐV nộp lúc đăng ký.
 *
 * Ảnh là căn cứ duy nhất để ban tổ chức nói xe đạt hay không đạt, nên luôn trả
 * về mảng — đăng ký cũ tạo trước khi có phần tải ảnh sẽ ra mảng rỗng thay vì
 * undefined, chỗ hiển thị khỏi phải phòng thủ thêm.
 */
export function getByocDeclaration(
  registration: ContestRegistration,
): ByocDeclaration | null {
  const raw = registration.metadata?.byoc_declaration
  if (!raw || typeof raw !== "object") return null
  const source = raw as Record<string, unknown>
  const asText = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null

  return {
    vehicle_name: asText(source.vehicle_name),
    vehicle_brand: asText(source.vehicle_brand),
    vehicle_class: asText(source.vehicle_class),
    notes: asText(source.notes),
    photos: Array.isArray(source.photos)
      ? source.photos.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [],
  }
}

export function applyStagedParticipants(
  matches: ContestMatch[],
  staged: Record<string, ContestUpdateMatchParticipantsBody["participants"]>,
) {
  if (Object.keys(staged).length === 0) return matches

  // Người được kéo sang vòng sau vẫn phải hiện đúng tên. Thông tin đó nằm ở
  // trận nguồn nên gom sẵn một lượt; thiếu bước này thì ô mới chỉ có
  // registration_id và sơ đồ hiện "Mã đăng ký e4c7c97f".
  const snapshotByRegistration = new Map(
    matches
      .flatMap((match) => match.participants)
      .filter((participant) => participant.registration !== null)
      .map((participant) => [
        participant.registration_id,
        participant.registration,
      ]),
  )

  return matches.map((match) => {
    const nextParticipants = staged[match.id]
    if (!nextParticipants) return match
    const currentByRegistration = new Map(
      match.participants.map((participant) => [
        participant.registration_id,
        participant,
      ]),
    )
    return {
      ...match,
      participants: nextParticipants.map((item) => {
        const current = currentByRegistration.get(item.registration_id)
        if (!current) {
          return {
            id: `staged-${match.id}-${item.registration_id}`,
            registration_id: item.registration_id,
            slot_no: item.slot_no,
            lane: item.lane ?? null,
            grid_position: item.grid_position ?? null,
            seed_no: item.seed_no ?? null,
            status: "READY" as ContestMatchParticipant["status"],
            score: null,
            finish_position: null,
            best_lap_seconds: null,
            total_time_seconds: null,
            is_winner: false,
            result_note: null,
            metadata: { staged: true },
            registration:
              snapshotByRegistration.get(item.registration_id) ?? null,
          }
        }
        return {
          ...current,
          slot_no: item.slot_no,
          lane: item.lane ?? null,
          grid_position: item.grid_position ?? null,
          seed_no: item.seed_no ?? null,
        }
      }),
    }
  })
}

/**
 * Nhật ký thao tác viết bằng tiếng người.
 *
 * Bảng này là nơi duy nhất dịch mã sự kiện của backend; thiếu một mã thì
 * `getAuditEventLabel` trả về chính mã đó để không giấu mất dòng nhật ký — thà
 * hiện mã lạ còn hơn hiện chuỗi rỗng.
 */
const AUDIT_EVENT_LABEL: Record<string, string> = {
  "contest.created": "Tạo giải đấu",
  "contest.updated": "Sửa thông tin giải",
  "contest.opened": "Mở đăng ký",
  "contest.closed": "Đóng đăng ký",
  "contest.cancelled": "Huỷ giải đấu",
  "contest.banner_uploaded": "Đổi ảnh bìa",
  "contest.bracket_drawn": "Bốc thăm sơ đồ đấu",
  "contest.matches_generated": "Tạo lượt thi đấu",
  "contest.final_bracket_generated": "Sinh nhánh chung kết",
  "contest.leaderboard_published": "Công bố bảng xếp hạng",
  "contest.staff_assigned": "Phân công nhân viên",
  "contest.staff_unassigned": "Gỡ phân công nhân viên",
  "contest.participant_banned": "Cấm người chơi",
  "contest.participant_unbanned": "Bỏ cấm người chơi",

  "registration.created": "Khách đăng ký",
  "registration.approved": "Duyệt vào giải",
  "registration.rejected": "Từ chối đăng ký",
  "registration.cancelled": "Huỷ đăng ký",
  "registration.cancelled_via_booking_cancel": "Huỷ đăng ký do huỷ phiếu xe",
  "registration.checked_in": "Điểm danh",
  "registration.disqualified": "Loại khỏi giải",
  "registration.entry_fee_marked_paid": "Ghi nhận đã thu lệ phí",
  "registration.entry_fee_waived": "Miễn lệ phí",
  "registration.byoc_declaration_updated": "Sửa khai báo xe cá nhân",
  "registration.vehicle_handed_over": "Giao xe cho người chơi",

  "match.participants_updated": "Đổi người thi đấu",
  "match.results_submitted": "Nhập kết quả trận",
  "match.results_corrected": "Sửa kết quả trận",
  "match.advanced": "Đưa người thắng sang vòng sau",
  "match.walkover": "Xử thua vắng mặt",
  "match.auto_resolved": "Tự đóng trận do thiếu đối thủ",
  "match.third_place_populated": "Xếp người vào trận tranh hạng 3",

  "booking.vehicle_checked_out": "Trả xe",
  "booking.contest_rental_cancelled": "Huỷ phiếu mượn xe",
  "booking.contest_rental_retained": "Giữ lại phiếu mượn xe",
  "race_records.synced": "Đồng bộ thành tích toàn hệ thống",
}

export function getAuditEventLabel(eventType: string): string {
  return AUDIT_EVENT_LABEL[eventType] ?? eventType
}

/**
 * Lượt kế tiếp cần nhập kết quả, tính từ lượt vừa lưu xong.
 *
 * Dùng cho đua tính giờ: nhân viên nhập liên tiếp hàng chục lượt, nên sau khi
 * lưu phải tự đưa họ sang lượt chưa xong ngay sau đó thay vì bắt cuộn ngược lên
 * danh sách. Quét vòng qua đầu danh sách để không bỏ sót lượt còn dở phía trên
 * khi nhân viên nhập nhảy cóc.
 */
export function findNextPendingMatchId(
  matches: Array<{ id: string; status: string }>,
  currentMatchId: string,
): string | null {
  if (!matches.length) return null
  const startIndex = matches.findIndex((match) => match.id === currentMatchId)
  if (startIndex < 0) return null

  for (let step = 1; step <= matches.length; step += 1) {
    const candidate = matches[(startIndex + step) % matches.length]
    if (candidate.id === currentMatchId) break
    if (candidate.status !== "COMPLETED" && candidate.status !== "CANCELLED") {
      return candidate.id
    }
  }
  return null
}
