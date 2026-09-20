import { routePaths } from "@/app/router/route-paths"

export type ProviderTone = "success" | "warning" | "danger" | "info" | "neutral"

export const branches = [
  { name: "RC Quận 7", area: "Quận 7, TP.HCM", status: "Đang mở", revenue: "45.2M ₫", occupancy: 92, vehicles: 44 },
  { name: "RC Thảo Điền", area: "Quận 2, TP.HCM", status: "Đang mở", revenue: "38.5M ₫", occupancy: 85, vehicles: 36 },
  { name: "RC Bình Thạnh", area: "Bình Thạnh, TP.HCM", status: "Bảo trì nhẹ", revenue: "22.8M ₫", occupancy: 64, vehicles: 28 },
]

export const vehicles = [
  { id: "VH-102", name: "Mazda RX-7 FD3S", branch: "RC Quận 7", tier: "Premium Drift", status: "Sẵn sàng", battery: "96%" },
  { id: "VH-118", name: "Nissan GT-R R35", branch: "RC Quận 7", tier: "Speed Touring", status: "Đang thuê", battery: "68%" },
  { id: "VH-207", name: "Subaru BRZ Drift", branch: "RC Thảo Điền", tier: "Standard Drift", status: "Bảo trì", battery: "0%" },
  { id: "VH-311", name: "Traxxas Slash 4X4", branch: "RC Bình Thạnh", tier: "Off-road", status: "Sẵn sàng", battery: "88%" },
]

export const packages = [
  { name: "Gói Drift 10 lượt", price: "900.000 ₫", slots: "10 lượt", validity: "180 ngày", active: 126 },
  { name: "Weekend Speed Pass", price: "1.500.000 ₫", slots: "20 lượt", validity: "90 ngày", active: 84 },
  { name: "Corporate Team Race", price: "4.800.000 ₫", slots: "Sự kiện 12 người", validity: "30 ngày", active: 18 },
]

export const bookings = [
  { id: "BK-8829", customer: "Minh Anh", branch: "RC Quận 7", time: "Hôm nay 14:00", status: "CONFIRMED", amount: "320.000 ₫" },
  { id: "BK-8830", customer: "Gia Huy", branch: "RC Thảo Điền", time: "Hôm nay 15:30", status: "PENDING", amount: "180.000 ₫" },
  { id: "BK-8831", customer: "Team Nova", branch: "RC Bình Thạnh", time: "Mai 09:00", status: "CONFIRMED", amount: "2.400.000 ₫" },
]

export const sessions = [
  { id: "SS-1204", booking: "BK-8829", vehicle: "Nissan GT-R R35", state: "ACTIVE", timer: "00:42:18", staff: "Tuấn" },
  { id: "SS-1205", booking: "BK-8817", vehicle: "Mazda RX-7 FD3S", state: "CHECKING_OUT", timer: "Chờ xác nhận", staff: "Linh" },
  { id: "SS-1206", booking: "BK-8812", vehicle: "Subaru BRZ Drift", state: "EXTENDING", timer: "08:21", staff: "An" },
]

export const staffMembers = [
  { name: "Nguyễn Anh Tuấn", role: "Ca trưởng", branch: "RC Quận 7", shift: "08:00 - 16:00", status: "Đang làm" },
  { name: "Trần Hoàng Linh", role: "Kỹ thuật xe", branch: "RC Thảo Điền", shift: "12:00 - 20:00", status: "Đang làm" },
  { name: "Phạm Minh An", role: "Lễ tân", branch: "RC Bình Thạnh", shift: "16:00 - 22:00", status: "Sắp vào ca" },
]

export const revenueRows = [
  { branch: "RC Quận 7", gross: "45.2M ₫", platform: "3.1M ₫", settlement: "42.1M ₫", status: "Sẵn sàng đối soát" },
  { branch: "RC Thảo Điền", gross: "38.5M ₫", platform: "2.7M ₫", settlement: "35.8M ₫", status: "Đang kiểm tra" },
  { branch: "RC Bình Thạnh", gross: "22.8M ₫", platform: "1.6M ₫", settlement: "21.2M ₫", status: "Chờ hóa đơn" },
]

export function branchDetailPath(name: string) {
  return routePaths.providerCafeDetail.replace(":cafeId", name.toLowerCase().replace(/\s+/g, "-"))
}
