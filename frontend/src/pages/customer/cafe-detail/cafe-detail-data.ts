export type CafeAmenity = {
  title: string
  description: string
  icon: "timer" | "tool" | "road" | "snow" | "coffee" | "camera"
}

export const cafeAmenities: CafeAmenity[] = [
  { title: "Hệ thống Mylaps", description: "Đo thời gian chính xác", icon: "timer" },
  { title: "Pit Area Pro", description: "Bàn thao tác, khí nén", icon: "tool" },
  { title: "Đường đua thảm", description: "Độ bám cao, kỹ thuật", icon: "road" },
  { title: "Điều hòa TT", description: "Mát mẻ 24/7", icon: "snow" },
  { title: "Cafe & Lounge", description: "Nước uống, thức ăn nhẹ", icon: "coffee" },
  { title: "Live Stream", description: "Camera toàn cảnh", icon: "camera" },
]

export const cafeRules = [
  "Chỉ sử dụng xe RC điện. Không sử dụng xe động cơ nổ tại cơ sở này.",
  "Sử dụng lốp được quy định riêng cho mặt thảm để bảo vệ đường đua.",
  "Vệ sinh xe tại khu vực quy định bằng máy nén khí trước khi mang vào Pit.",
]
