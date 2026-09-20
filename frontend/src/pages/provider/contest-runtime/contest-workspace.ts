export const contestWorkspaceSections = [
  { key: "overview", label: "Tổng quan" },
  // Một danh sách người duy nhất: duyệt, lệ phí và điểm danh cùng một chỗ.
  // Trước đây tách thêm tab "Check-in / Vận hành" nhưng 4/5 nút bị lặp lại y
  // hệt, provider không biết chỗ nào mới là chỗ đúng để thao tác.
  { key: "registrations", label: "Người chơi" },
  { key: "bracket", label: "Nhánh đấu" },
  { key: "leaderboard", label: "Bảng xếp hạng" },
  // Chỉ chủ doanh nghiệp sở hữu giải mở được — nhân viên gọi API sẽ nhận 403.
  { key: "finance", label: "Tài chính" },
  { key: "audit", label: "Nhật ký" },
  // Nhãn cũ là "Kỷ luật / Nhân sự" — dấu gạch chéo trong tên tab gần như luôn
  // là dấu hiệu hai việc không liên quan bị nhét chung. Loại khỏi giải và cấm
  // tham gia đã chuyển sang tab Người chơi, nơi có sẵn danh sách người thật.
  { key: "staff", label: "Nhân sự" },
] as const

export type ContestWorkspaceSectionKey =
  (typeof contestWorkspaceSections)[number]["key"]

export const defaultContestWorkspaceSection: ContestWorkspaceSectionKey =
  "overview"

export function getContestWorkspacePath(
  contestId: string,
  section: ContestWorkspaceSectionKey,
) {
  return `/provider/contests/${contestId}/${section}`
}

export function parseContestWorkspaceContext(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "provider" || parts[1] !== "contests") return null

  const contestId = parts[2]
  if (!contestId || contestId === "new") return null

  const rawSection = parts[3]
  const section =
    rawSection &&
    contestWorkspaceSections.some((item) => item.key === rawSection)
      ? (rawSection as ContestWorkspaceSectionKey)
      : null

  return {
    contestId,
    section,
  }
}
