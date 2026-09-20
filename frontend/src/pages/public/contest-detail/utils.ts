export function getVehiclePolicyLabel(policy: string | null | undefined) {
  if (!policy) return "--"
  switch (policy) {
    case "RENTAL_ONLY":
      return "Chỉ sử dụng xe thuê của chi nhánh"
    case "BYOC_ONLY":
      return "Chỉ sử dụng xe cá nhân"
    case "MIXED":
      return "Hỗn hợp (Xe thuê hoặc Xe cá nhân)"
    default:
      return policy
  }
}

/**
 * Câu diễn giải "người thường" cho luật xe — dùng ở phần giới thiệu, nơi khách
 * cần hiểu mình phải chuẩn bị gì chứ không cần biết mã enum.
 */
export function getVehiclePolicyBlurb(policy: string | null | undefined) {
  switch (policy) {
    case "RENTAL_ONLY":
      return "Ban tổ chức chuẩn bị sẵn xe theo chuẩn giải. Bạn chỉ cần tới và cầm lái."
    case "BYOC_ONLY":
      return "Mang chiếc xe của riêng bạn. Khai báo trước để ban tổ chức duyệt kỹ thuật."
    case "MIXED":
      return "Thuê xe tại quầy hoặc mang xe cá nhân — chọn phương án bạn thấy thoải mái nhất."
    default:
      return "Luật sử dụng xe sẽ được ban tổ chức công bố trong điều lệ giải."
  }
}

export function formatCurrency(value: number) {
  if (value === 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Phần thưởng là ô chữ tự do nên có thể là số tiền, mà cũng có thể là hiện vật.
 *
 * Ban tổ chức gõ "10000000" thì trang công khai hiện đúng chuỗi đó — dài, không
 * dấu ngăn, đọc phải đếm từng chữ số mới biết là mười triệu hay một triệu.
 * Nhưng "Cúp vàng + voucher 2 giờ chơi" thì phải giữ nguyên.
 *
 * Nên chỉ định dạng khi giá trị THUẦN là số. Ngưỡng bốn chữ số để "3" trong
 * "3 vé" không bị biến thành "3 ₫"; phần thưởng dưới một nghìn đồng thì không
 * có thật.
 */
export function formatPrizeReward(reward: string): string {
  const trimmed = reward.trim()
  if (!/^\d[\d.,\s]*$/.test(trimmed)) return trimmed

  const digits = trimmed.replace(/[.,\s]/g, "")
  if (digits.length < 4) return trimmed

  const amount = Number(digits)
  if (!Number.isFinite(amount)) return trimmed
  return formatCurrency(amount)
}

export function getErrorMessage(error: unknown) {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe.response?.data?.message ?? "Vui lòng thử lại sau."
}
