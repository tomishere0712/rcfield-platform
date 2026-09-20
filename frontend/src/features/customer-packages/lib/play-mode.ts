/**
 * Nhãn hiển thị chế độ chơi mà một gói slot áp dụng.
 *
 * Toàn hệ thống đang dùng nhiều cách gọi khác nhau cho cùng một khái niệm
 * ("Thuê xe" / "Thuê xe quán" / "Thuê xe của quán", "Mang xe riêng" /
 * "Mang xe cá nhân"). Mọi bề mặt liên quan tới GÓI phải dùng chung file này để
 * khách không thấy hai cách gọi khác nhau cho cùng một gói.
 */
export const PLAY_MODE_LABEL: Record<string, string> = {
  RENTAL: "Thuê xe của quán",
  BYOC: "Mang xe cá nhân",
}

const ALL_MODES_LABEL = "Cả hai hình thức"

/**
 * Chuyển `applicable_play_modes` thành nhãn tiếng Việt.
 *
 * ⚠️ Mảng RỖNG nghĩa là gói áp dụng cho MỌI hình thức — khớp với luật xét điều
 * kiện ở BookingPackageSelector (chỉ chặn khi mảng có phần tử và không chứa chế
 * độ đang chọn). Map rồi join thẳng sẽ cho ra chuỗi rỗng và khách tưởng gói
 * không dùng được cho hình thức nào.
 */
export function formatApplicablePlayModes(modes?: string[] | null): string {
  if (!modes?.length) return ALL_MODES_LABEL

  const unique = new Set(modes)
  if (unique.has("RENTAL") && unique.has("BYOC")) return ALL_MODES_LABEL

  return [...unique].map((mode) => PLAY_MODE_LABEL[mode] ?? mode).join(" · ")
}
