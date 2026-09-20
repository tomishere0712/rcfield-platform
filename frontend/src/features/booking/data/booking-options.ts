export type BookingMode = "hourly" | "slotPackage" | "recurring"

export type HourlyPlan = {
  id: string
  label: string
  durationHours: number
  pricePerHour: number
  note: string
}

export type SlotPackage = {
  id: string
  label: string
  slots: number
  minutesPerSlot: number
  price: number
  note: string
}

export type RecurringPlan = {
  id: string
  label: string
  sessionsPerMonth: number
  pricePerMonth: number
  note: string
}

export type BookingCatalog = {
  hourlyPlans: HourlyPlan[]
  slotPackages: SlotPackage[]
  recurringPlans: RecurringPlan[]
  timeOptions: string[]
  weekdayOptions: string[]
}

export const bookingCatalog: BookingCatalog = {
  hourlyPlans: [
    { id: "hour-1", label: "1 giờ tiêu chuẩn", durationHours: 1, pricePerHour: 150000, note: "Phù hợp chạy thử hoặc đi một mình." },
    { id: "hour-2", label: "2 giờ luyện tập", durationHours: 2, pricePerHour: 140000, note: "Tiết kiệm hơn cho nhóm nhỏ." },
    { id: "hour-3", label: "3 giờ race night", durationHours: 3, pricePerHour: 130000, note: "Tối ưu cho buổi mini tournament." },
  ],
  slotPackages: [
    { id: "slot-5", label: "Gói 5 slot", slots: 5, minutesPerSlot: 45, price: 520000, note: "Dùng dần trong 30 ngày." },
    { id: "slot-10", label: "Gói 10 slot", slots: 10, minutesPerSlot: 45, price: 960000, note: "Ưu tiên giữ slot cuối tuần." },
    { id: "slot-20", label: "Gói team 20 slot", slots: 20, minutesPerSlot: 45, price: 1760000, note: "Dành cho team luyện tập cố định." },
  ],
  recurringPlans: [
    { id: "rec-weekly", label: "Lịch cố định hàng tuần", sessionsPerMonth: 4, pricePerMonth: 720000, note: "Giữ cùng ngày, cùng giờ mỗi tuần." },
    { id: "rec-biweekly", label: "Lịch 2 buổi mỗi tuần", sessionsPerMonth: 8, pricePerMonth: 1360000, note: "Có nhắc lịch và ưu tiên đổi ngày." },
  ],
  timeOptions: ["09:00", "10:30", "14:00", "15:30", "18:00", "19:30"],
  weekdayOptions: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"],
}

export const bookingModeCopy = {
  hourly: {
    title: "Book theo giờ",
    description: "Chọn số giờ chơi, ngày và khung giờ bắt đầu. Demo mặc định đã tách đơn giá 1 giờ để sau này API trả pricing rõ ràng.",
  },
  slotPackage: {
    title: "Mua gói slot",
    description: "Mua trước nhiều slot chơi, dùng dần theo chính sách từng cơ sở. Phù hợp người chơi thường xuyên.",
  },
  recurring: {
    title: "Lịch cố định",
    description: "Giữ lịch lặp lại theo tuần hoặc theo tháng cho team luyện tập, CLB hoặc lớp hướng dẫn.",
  },
} satisfies Record<BookingMode, { title: string; description: string }>
