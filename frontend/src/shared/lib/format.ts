export function formatCurrency(value: number, currency = "VND") {
  if (currency !== "VND") {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)}đ`
}

export function formatPaymentGateway(gateway?: string | null): string {
  if (!gateway) return "Cổng thanh toán"
  const normalized = gateway.trim().toUpperCase()
  switch (normalized) {
    case "COUNTER_CASH":
    case "CASH":
    case "DIRECT":
      return "Tiền mặt tại quầy"
    case "COUNTER_BANK_TRANSFER":
    case "COUNTER_VIETQR":
    case "VIETQR":
      return "Chuyển khoản VietQR"
    case "BANK_TRANSFER":
      return "Chuyển khoản ngân hàng"
    case "VNPAY":
      return "VNPay"
    case "MOCK":
    case "DEV_MOCK":
      return "Thử nghiệm"
    case "WALLET":
      return "Ví điện tử"
    case "PACKAGE":
    case "PACKAGE_PURCHASE":
      return "Gói giờ chơi"
    default:
      if (normalized.startsWith("COUNTER_")) {
        const sub = normalized.replace("COUNTER_", "")
        if (sub === "CASH") return "Tiền mặt tại quầy"
        if (sub === "BANK_TRANSFER" || sub === "VIETQR") return "Chuyển khoản VietQR"
        return `Tại quầy (${sub})`
      }
      return gateway
  }
}

export function formatPaymentGatewayInline(gateway?: string | null): string {
  if (!gateway) return "cổng thanh toán"
  const normalized = gateway.trim().toUpperCase()
  switch (normalized) {
    case "COUNTER_CASH":
    case "CASH":
    case "DIRECT":
      return "tiền mặt tại quầy"
    case "COUNTER_BANK_TRANSFER":
    case "COUNTER_VIETQR":
    case "VIETQR":
      return "chuyển khoản VietQR"
    case "BANK_TRANSFER":
      return "chuyển khoản ngân hàng"
    case "VNPAY":
      return "VNPAY"
    case "MOCK":
    case "DEV_MOCK":
      return "thử nghiệm"
    case "WALLET":
      return "ví điện tử"
    case "PACKAGE":
    case "PACKAGE_PURCHASE":
      return "gói giờ chơi"
    default:
      if (normalized.startsWith("COUNTER_")) {
        const sub = normalized.replace("COUNTER_", "")
        if (sub === "CASH") return "tiền mặt tại quầy"
        if (sub === "BANK_TRANSFER" || sub === "VIETQR") return "chuyển khoản VietQR"
        return `tại quầy (${sub.toLowerCase()})`
      }
      return gateway.toLowerCase()
  }
}
