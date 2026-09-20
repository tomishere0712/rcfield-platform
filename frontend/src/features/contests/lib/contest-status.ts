import type {
  CustomerJourneyStatus,
  ContestEntryFeePaymentStatus,
  ContestItem,
  ContestMatchType,
  ContestParticipantStatus,
  ContestMatchStatus,
  ContestRegistrationStatus,
} from "../types"

/**
 * Trạng thái ban tổ chức tự quyết định, không suy ra được từ đồng hồ.
 *
 * COMPLETED là kết quả của việc bấm công bố bảng xếp hạng — giải xong sớm hơn
 * lịch là chuyện thường. Suy từ mốc thời gian sẽ kéo nó ngược về "đang mở đăng
 * ký" và trang công khai mời khách đăng ký vào một giải đã trao giải xong.
 */
const OPERATOR_DECIDED_STATUSES: ContestItem["status"][] = [
  "DRAFT",
  "CANCELLED",
  "COMPLETED",
]

export function getEffectiveContestStatus(
  contest: Pick<
    ContestItem,
    | "status"
    | "registration_opens_at"
    | "registration_closes_at"
    | "starts_at"
    | "ends_at"
  >,
  now = new Date(),
): ContestItem["status"] {
  if (OPERATOR_DECIDED_STATUSES.includes(contest.status)) {
    return contest.status
  }

  return getContestTimeWindowPhase(contest, now) ?? contest.status
}

export type ContestRegistrationAvailability =
  | "AVAILABLE"
  | "NOT_OPEN_YET"
  | "CLOSED"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELLED"
  | "DRAFT"

export function getContestRegistrationAvailability(
  contest: Pick<
    ContestItem,
    | "status"
    | "registration_opens_at"
    | "registration_closes_at"
    | "starts_at"
    | "ends_at"
  >,
  now = new Date(),
): ContestRegistrationAvailability {
  if (contest.status === "DRAFT") return "DRAFT"
  if (contest.status === "CANCELLED") return "CANCELLED"

  // Backend đã rời khỏi OPEN nghĩa là đăng ký đã chốt — bốc thăm xong, đang thi,
  // hoặc đã trao giải. Đồng hồ không được kéo ngược lại thành "còn nhận đăng ký".
  if (
    contest.status === "CLOSED" ||
    contest.status === "RUNNING" ||
    contest.status === "COMPLETED"
  ) {
    return contest.status
  }

  const phase = getContestTimeWindowPhase(contest, now)
  if (phase === "COMPLETED" || phase === "RUNNING" || phase === "CLOSED") {
    return phase
  }

  const registrationOpensAt = parseDate(contest.registration_opens_at)
  if (registrationOpensAt && registrationOpensAt.getTime() > now.getTime()) {
    return "NOT_OPEN_YET"
  }

  return contest.status === "OPEN" ? "AVAILABLE" : "DRAFT"
}

export function getRegistrationAvailabilityLabel(
  availability: ContestRegistrationAvailability,
) {
  switch (availability) {
    case "AVAILABLE":
      return "Đang mở đăng ký"
    case "NOT_OPEN_YET":
      return "Sắp mở đăng ký"
    case "CLOSED":
      return "Đã đóng đăng ký"
    case "RUNNING":
      return "Đang diễn ra"
    case "COMPLETED":
      return "Đã hoàn thành"
    case "CANCELLED":
      return "Đã hủy"
    default:
      return "Bản nháp"
  }
}

export function getContestCtaLabel(
  availability: ContestRegistrationAvailability,
  status: ContestItem["status"],
): string {
  if (availability === "AVAILABLE") return "Xem chi tiết và đăng ký"
  if (availability === "NOT_OPEN_YET") return "Xem lịch mở đăng ký"
  if (status === "RUNNING") return "Xem sơ đồ đấu"
  if (status === "COMPLETED") return "Xem bảng xếp hạng"
  return "Xem chi tiết"
}

export function getContestFormatLabel(format?: string | null): string {
  switch (format) {
    case "TIME_TRIAL":
      return "Đua tính giờ"
    case "KNOCKOUT":
      return "Đấu loại trực tiếp"
    case "QUALIFYING_FINAL":
      return "Vòng loại + Chung kết (Grand Prix)"
    default:
      return format || "--"
  }
}

export function getContestStatusClass(status: ContestItem["status"]) {
  switch (status) {
    case "OPEN":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "CLOSED":
    case "RUNNING":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "COMPLETED":
      return "bg-slate-100 text-slate-700 border-slate-200"
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-[#f6f3f2] text-[#5d5f5f] border-[#e5e2e1]"
  }
}

export function getContestStatusLabel(status: ContestItem["status"]): string {
  switch (status) {
    case "DRAFT":
      return "Bản nháp"
    case "OPEN":
      return "Đang mở đăng ký"
    case "CLOSED":
      return "Đã đóng đăng ký"
    case "RUNNING":
      return "Đang diễn ra"
    case "COMPLETED":
      return "Đã hoàn thành"
    case "CANCELLED":
      return "Đã hủy"
    default:
      return status
  }
}

export type ContestCheckInAvailability =
  | { canCheckIn: true }
  | { canCheckIn: false; reason: string }

/**
 * Nhân viên có điểm danh được lúc này không.
 *
 * Soi đúng các điều kiện backend áp trong `checkInRegistration`, để nút được
 * khoá kèm lý do ngay trên màn hình thay vì cho bấm rồi mới nhận lỗi 400
 * (`CONTEST_NOT_CHECKIN_READY` / `CONTEST_CHECKIN_NOT_STARTED`).
 */
export function getContestCheckInAvailability(
  contest: Pick<ContestItem, "status" | "starts_at" | "ends_at" | "check_in_window_bypassed">,
  now = new Date(),
): ContestCheckInAvailability {
  /**
   * Máy chủ nói nó đang bỏ qua khung giờ thì tin theo.
   *
   * Trước đây chỗ này đọc một biến `VITE_*` — Vite nướng giá trị đó vào bản
   * build, nên đổi cờ ở máy chủ mà không build lại giao diện thì nút vẫn khoá:
   * máy chủ đồng ý nhưng không ai bấm được. Hỏi máy chủ thì hai bên luôn cùng
   * một câu trả lời, và bật/tắt chỉ cần khởi động lại backend.
   */
  if (contest.check_in_window_bypassed) return { canCheckIn: true }

  if (contest.status !== "CLOSED" && contest.status !== "RUNNING") {
    return {
      canCheckIn: false,
      reason:
        contest.status === "OPEN"
          ? "Còn đang mở đăng ký — đóng đăng ký rồi mới điểm danh được"
          : "Giải chưa sẵn sàng để điểm danh",
    }
  }

  const startsAt = parseDate(contest.starts_at)
  if (startsAt && now.getTime() < startsAt.getTime()) {
    return { canCheckIn: false, reason: "Chưa tới giờ thi đấu" }
  }

  const endsAt = parseDate(contest.ends_at)
  if (endsAt && now.getTime() > endsAt.getTime()) {
    return { canCheckIn: false, reason: "Giải đã kết thúc" }
  }

  return { canCheckIn: true }
}

export type ContestActionAvailability =
  | { allowed: true }
  | { allowed: false; reason: string }

const ALLOWED: ContestActionAvailability = { allowed: true }

/**
 * Sửa thông tin giải.
 *
 * Backend `updateContest` chỉ nhận DRAFT/OPEN — đã đóng đăng ký rồi thì giờ
 * giấc, sức chứa, lệ phí đều đã là căn cứ để khách sắp lịch, đổi là sai lệch.
 */
export function getContestEditAvailability(
  contest: Pick<ContestItem, "status" | "public_stats">,
): ContestActionAvailability {
  if (contest.status === "DRAFT") return ALLOWED

  /*
    Mở đăng ký rồi vẫn sửa được — nhưng chỉ khi CHƯA AI đăng ký.

    Đó là khoảng thời gian chủ sân bấm mở xong mới thấy sai giờ hay sai chính
    tả. Có người đăng ký rồi thì mỗi trường là một cam kết đã đưa ra, và backend
    (`CONTEST_HAS_REGISTRATIONS`) từ chối — điều kiện ở đây phải trùng với nó,
    nếu không nút mở ra được mà lưu thì báo lỗi.
  */
  if (contest.status === "OPEN") {
    const soNguoiDangKy = contest.public_stats?.registration_count ?? 0
    if (soNguoiDangKy === 0) return ALLOWED
    return {
      allowed: false,
      reason: `Đã có ${soNguoiDangKy} người đăng ký — thông tin giải là cam kết với họ, không sửa được nữa`,
    }
  }

  return {
    allowed: false,
    reason:
      contest.status === "COMPLETED" || contest.status === "CANCELLED"
        ? "Giải đã kết thúc — không sửa được nữa"
        : "Đã đóng đăng ký — không sửa được thông tin giải nữa",
  }
}

/**
 * Bốc thăm sơ đồ đấu.
 *
 * Backend `ensureContestRuntimeEditable` cần OPEN/CLOSED/RUNNING, và chặn bốc
 * lại khi đã có trận thi đấu xong hoặc đang diễn ra (`CONTEST_RUNTIME_LOCKED`).
 * Trận thắng do gặp ô trống không tính là đã thi đấu nên vẫn bốc lại được.
 */
export function getContestDrawAvailability(
  contest: Pick<ContestItem, "status">,
  options: { eligibleCount: number; hasPlayedMatch: boolean },
): ContestActionAvailability {
  if (
    contest.status !== "OPEN" &&
    contest.status !== "CLOSED" &&
    contest.status !== "RUNNING"
  ) {
    return {
      allowed: false,
      reason:
        contest.status === "DRAFT"
          ? "Giải còn là bản nháp — mở đăng ký trước đã"
          : "Giải đã kết thúc — không bốc thăm được nữa",
    }
  }
  if (options.hasPlayedMatch) {
    return {
      allowed: false,
      reason: "Đã có trận thi đấu — không bốc thăm lại được nữa",
    }
  }
  if (options.eligibleCount < 2) {
    return {
      allowed: false,
      reason: "Cần ít nhất 2 người đã được duyệt để bốc thăm",
    }
  }
  return ALLOWED
}

/**
 * Công bố bảng xếp hạng.
 *
 * Backend `publishContestLeaderboard` cần RUNNING/CLOSED, phải có match, và
 * không còn match nào ở DRAFT/READY/RUNNING.
 */
export function getContestPublishAvailability(
  contest: Pick<ContestItem, "status">,
  options: { totalMatches: number; unfinishedMatches: number },
): ContestActionAvailability {
  if (contest.status === "COMPLETED") {
    return { allowed: false, reason: "Bảng xếp hạng đã được công bố" }
  }
  if (contest.status !== "CLOSED" && contest.status !== "RUNNING") {
    return {
      allowed: false,
      reason:
        contest.status === "OPEN"
          ? "Còn đang mở đăng ký — chưa có gì để công bố"
          : "Giải chưa sẵn sàng để công bố kết quả",
    }
  }
  if (options.totalMatches === 0) {
    return { allowed: false, reason: "Chưa bốc thăm nên chưa có trận nào" }
  }
  if (options.unfinishedMatches > 0) {
    return {
      allowed: false,
      reason: `Còn ${options.unfinishedMatches} trận chưa có kết quả`,
    }
  }
  return ALLOWED
}

/** Nhãn tiếng Việt cho cách xếp hạng; đừng in mã nội bộ ra cho người dùng đọc. */
export function getLeaderboardModeLabel(mode?: string | null): string {
  switch (mode) {
    case "KNOCKOUT_BRACKET":
    case "KNOCKOUT_WINS":
      return "Theo vòng bị loại"
    case "TOTAL_TIME":
      return "Theo tổng thời gian"
    case "BEST_LAP":
      return "Theo vòng chạy nhanh nhất"
    default:
      return "--"
  }
}

export function getRegistrationStatusClass(status: ContestRegistrationStatus) {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "CHECKED_IN":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-amber-50 text-amber-700 border-amber-200"
  }
}

export function getRegistrationStatusLabel(
  status: ContestRegistrationStatus,
): string {
  switch (status) {
    case "PENDING":
      return "Chờ duyệt"
    case "CONFIRMED":
      return "Đã xác nhận"
    case "CHECKED_IN":
      return "Đã điểm danh"
    case "CANCELLED":
      return "Đã hủy"
    default:
      return status
  }
}

export function getPaymentStatusClass(status: ContestEntryFeePaymentStatus) {
  switch (status) {
    case "MARKED_PAID":
    case "WAIVED":
    case "NOT_REQUIRED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "PENDING_REVIEW":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "PENDING_PAYMENT":
      return "bg-amber-50 text-amber-700 border-amber-200"
    default:
      return "bg-[#f6f3f2] text-[#5d5f5f] border-[#e5e2e1]"
  }
}

export function getPaymentStatusLabel(
  status: ContestEntryFeePaymentStatus,
): string {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Chờ thanh toán"
    case "PENDING_REVIEW":
      return "Đang chờ duyệt thanh toán"
    case "MARKED_PAID":
      return "Đã thanh toán"
    case "WAIVED":
      return "Được miễn phí"
    case "NOT_REQUIRED":
      return "Miễn lệ phí"
    default:
      return status
  }
}

export function getMatchStatusClass(status: ContestMatchStatus) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "RUNNING":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "READY":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-[#f6f3f2] text-[#5d5f5f] border-[#e5e2e1]"
  }
}

export function getMatchStatusLabel(status: ContestMatchStatus): string {
  switch (status) {
    case "DRAFT":
      return "Bản nháp"
    case "READY":
      return "Sẵn sàng"
    case "RUNNING":
      return "Đang đua"
    case "COMPLETED":
      return "Đã hoàn thành"
    case "CANCELLED":
      return "Đã hủy"
    default:
      return status
  }
}

export function getMatchTypeLabel(type: ContestMatchType): string {
  switch (type) {
    case "HEAD_TO_HEAD":
      return "Đối kháng"
    case "MULTI_DRIVER":
      return "Nhiều người chơi"
    case "TIME_ATTACK":
      return "Tính giờ"
    case "FINAL":
      return "Chung kết"
    default:
      return type
  }
}

export function getParticipantStatusLabel(
  status: ContestParticipantStatus,
): string {
  switch (status) {
    case "READY":
      return "Sẵn sàng"
    case "STARTED":
      return "Đã bắt đầu"
    case "FINISHED":
      return "Đã hoàn thành"
    case "DNS":
      return "Không xuất phát"
    case "DNF":
      return "Không hoàn thành"
    case "DQ":
      return "Bị loại"
    default:
      return status
  }
}

/**
 * Nhãn ngắn cho những trạng thái BẤT THƯỜNG của một tay đua trong trận.
 *
 * Trả `null` cho `READY`/`STARTED`/`FINISHED` — đó là đường đi bình thường,
 * không cần dán nhãn. Chỉ ba trạng thái còn lại mới là chuyện phải nói ra, vì
 * chúng giải thích vì sao một người thua mà không cần thi đấu.
 *
 * Thiếu nhãn này thì trên sơ đồ, người bị xử thua vắng mặt trông y hệt người
 * thua trên sân — và không có cách nào biết trận đó có diễn ra hay không.
 */
export function getParticipantAnomalyBadge(
  status: ContestParticipantStatus,
): { short: string; full: string; className: string } | null {
  switch (status) {
    case "DNS":
      return {
        short: "Vắng",
        full: "Không xuất phát — xử thua vắng mặt",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      }
    case "DNF":
      return {
        short: "Bỏ cuộc",
        full: "Không hoàn thành phần thi",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      }
    case "DQ":
      return {
        short: "Bị loại",
        full: "Bị loại khỏi trận",
        className: "border-red-200 bg-red-50 text-red-700",
      }
    default:
      return null
  }
}

export function getJourneyStatusClass(status: CustomerJourneyStatus | null) {
  switch (status) {
    case "CHECKED_IN_WAITING_BRACKET":
    case "ADVANCED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "IN_BRACKET":
    case "APPROVED_WAITING_CHECKIN":
      return "bg-blue-50 text-blue-700 border-blue-200"
    case "ELIMINATED":
    case "CANCELLED":
      return "bg-red-50 text-red-700 border-red-200"
    case "FINISHED":
      return "bg-slate-100 text-slate-700 border-slate-200"
    case "PENDING_APPROVAL":
      return "bg-amber-50 text-amber-700 border-amber-200"
    default:
      return "bg-[#f6f3f2] text-[#5d5f5f] border-[#e5e2e1]"
  }
}

/**
 * Journey status là bản rút gọn DÀNH CHO KHÁCH của trạng thái đăng ký, nên ở
 * màn provider nó lặp lại y nguyên badge trạng thái trong suốt giai đoạn đầu —
 * "Chờ duyệt" hiện hai lần cạnh nhau. Chỉ những giai đoạn thi đấu mới nói thêm
 * được điều mà trạng thái đăng ký (dừng ở "Đã điểm danh") không nói được.
 */
const JOURNEY_STATUSES_BEYOND_REGISTRATION: CustomerJourneyStatus[] = [
  "IN_BRACKET",
  "ADVANCED",
  "ELIMINATED",
  "FINISHED",
]

export function journeyStatusAddsDetail(
  status: CustomerJourneyStatus | null,
): boolean {
  return (
    status !== null && JOURNEY_STATUSES_BEYOND_REGISTRATION.includes(status)
  )
}

export function getJourneyStatusLabel(status: CustomerJourneyStatus | null) {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Chờ duyệt"
    case "APPROVED_WAITING_CHECKIN":
      return "Đã duyệt, chờ điểm danh"
    case "CHECKED_IN_WAITING_BRACKET":
      return "Đã điểm danh, chờ xếp nhánh"
    case "IN_BRACKET":
      return "Đang thi đấu"
    case "ADVANCED":
      return "Đã vào vòng tiếp"
    case "ELIMINATED":
      return "Đã bị loại"
    case "FINISHED":
      return "Đã hoàn thành"
    case "CANCELLED":
      return "Đã hủy"
    default:
      return "Đang cập nhật"
  }
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

type ContestTimeWindowPhase = "COMPLETED" | "RUNNING" | "CLOSED" | "OPEN"

function getContestTimeWindowPhase(
  contest: Pick<
    ContestItem,
    "registration_opens_at" | "registration_closes_at" | "starts_at" | "ends_at"
  >,
  now: Date,
): ContestTimeWindowPhase | null {
  const endsAt = parseDate(contest.ends_at)
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    return "COMPLETED"
  }

  const startsAt = parseDate(contest.starts_at)
  if (startsAt && startsAt.getTime() <= now.getTime()) {
    return "RUNNING"
  }

  const registrationClosesAt = parseDate(contest.registration_closes_at)
  if (registrationClosesAt && registrationClosesAt.getTime() <= now.getTime()) {
    return "CLOSED"
  }

  const registrationOpensAt = parseDate(contest.registration_opens_at)
  if (registrationOpensAt && registrationOpensAt.getTime() <= now.getTime()) {
    return "OPEN"
  }

  return null
}
