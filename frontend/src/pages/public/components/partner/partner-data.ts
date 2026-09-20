import type { ReactNode } from "react"
import type { PlanName, SubscriptionPlan } from "@/features/subscriptions/types"

// ─── Zalo OA — single source of truth ────────────────────────────────────────
export const ZALO_OA_URL = "https://zalo.me/rcfield"

// ─── Social proof stats ───────────────────────────────────────────────────────
export const STATS = [
  { value: "50+",  label: "RC Cafe đang dùng" },
  { value: "12k+", label: "Phiên chơi đặt qua app" },
  { value: "4.8★", label: "Đánh giá trung bình" },
]

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PainPoint {
  icon: ReactNode
  title: string
  description: string
}

export interface HowItWorksStep {
  number: number
  title: string
  description: string
}

export interface FeatureShowcase {
  eyebrow: string
  icon: ReactNode
  title: string
  description: string
  bullets: string[]
  imagePosition: "left" | "right"
}

export interface Testimonial {
  quote: string
  authorName: string
  cafeName: string
  city: string
  rating: 1 | 2 | 3 | 4 | 5
}

export interface PricingDisplayMeta {
  label: string
  cta: string
  badge?: string
  isHighlighted: boolean
}

// ─── Static data ──────────────────────────────────────────────────────────────

export const PAIN_POINTS: PainPoint[] = [
  {
    icon: null, // Icons injected in component to avoid JSX in .ts
    title: "Tranh chấp hư hỏng xe",
    description: "Không có bằng chứng hình ảnh khi bàn giao — tranh cãi mất thời gian và mất lòng tin khách hàng.",
  },
  {
    icon: null,
    title: "Quản lý lịch thủ công",
    description: "Ghi sổ, nhắn Zalo, nhận tiền mặt — dễ nhầm lẫn khi có nhiều khách cùng một lúc.",
  },
  {
    icon: null,
    title: "Tư vấn mất nhân lực",
    description: "Mỗi lần khách hỏi giá hoặc xe phù hợp đều cần người trả lời trực tiếp, 7 ngày/tuần.",
  },
]

export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    number: 1,
    title: "Đăng ký & cấu hình sân",
    description: "Tạo tài khoản Provider, nhập thông tin sân và danh sách xe trong vài phút.",
  },
  {
    number: 2,
    title: "Nhận đặt lịch tự động",
    description: "Khách tìm sân, chọn xe, đặt lịch và thanh toán online — không cần nhân viên can thiệp.",
  },
  {
    number: 3,
    title: "Bàn giao có bằng chứng",
    description: "Check-in/out bằng ảnh trực tiếp trong app — bảo vệ cả sân lẫn khách, không còn tranh chấp.",
  },
]

export const FEATURES: Omit<FeatureShowcase, "icon">[] = [
  {
    eyebrow: "Lịch & Đặt chỗ",
    title: "Lịch thông minh, không cần nhân viên trực",
    description:
      "Khách đặt lịch 24/7 qua app, tự động confirm và nhắc nhở. Bạn chỉ cần chuẩn bị sân và xe.",
    bullets: [
      "Đặt lịch online bất kỳ lúc nào, kể cả ngoài giờ làm việc",
      "Tự động ngăn double-booking và xung đột khung giờ",
      "Thông báo real-time khi có booking mới",
    ],
    imagePosition: "right",
  },
  {
    eyebrow: "Bàn giao xe",
    title: "Check-in/out bằng ảnh, không còn tranh chấp",
    description:
      "Ghi nhận tình trạng xe bằng 4 ảnh (trước, sau, trái, phải) trước và sau mỗi phiên chơi.",
    bullets: [
      "4 góc ảnh bắt buộc trước khi bàn giao xe",
      "Hồ sơ hình ảnh lưu trữ 90 ngày, xuất được khi cần",
      "Khách ký xác nhận điện tử ngay trên app",
    ],
    imagePosition: "left",
  },
  {
    eyebrow: "AI Chatbot",
    title: "AI tư vấn khách hàng, bạn ngủ yên",
    description:
      "Chatbot AI được train theo thông tin sân của bạn — tự trả lời câu hỏi về giá, xe, lịch trống.",
    bullets: [
      "Trả lời tức thì 24/7, không cần nhân viên",
      "Hiểu context từng khách, tư vấn xe phù hợp",
      "Tích hợp Facebook Messenger & Zalo OA",
    ],
    imagePosition: "right",
  },
  {
    eyebrow: "Báo cáo",
    title: "Báo cáo doanh thu & hiệu suất theo ngày",
    description:
      "Dashboard tổng hợp doanh thu, số phiên, tỷ lệ đặt lịch và hiệu suất theo từng xe.",
    bullets: [
      "Biểu đồ doanh thu theo ngày, tuần, tháng",
      "Phân tích xe nào được đặt nhiều nhất",
      "Export báo cáo PDF để báo cáo nội bộ",
    ],
    imagePosition: "left",
  },
]

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Trước đây tôi phải nhắn tin hỏi từng khách xem muốn thuê xe gì. Bây giờ app làm hết — tôi chỉ cần chuẩn bị xe.",
    authorName: "Nguyễn Văn Hùng",
    cafeName: "RC Arena Sài Gòn",
    city: "TP. Hồ Chí Minh",
    rating: 5,
  },
  {
    quote:
      "Lần đầu tiên tôi có bằng chứng ảnh rõ ràng khi bàn giao xe. Không còn tranh chấp với khách nữa, tuyệt vời.",
    authorName: "Trần Minh Khoa",
    cafeName: "RC Cafe Hà Nội",
    city: "Hà Nội",
    rating: 5,
  },
  {
    quote:
      "Gói GROWTH phù hợp với sân 3 track của tôi. Báo cáo doanh thu theo ngày rất tiện để kiểm soát chi phí.",
    authorName: "Lê Thị Bích Ngọc",
    cafeName: "PlayZone RC Đà Nẵng",
    city: "Đà Nẵng",
    rating: 5,
  },
]

export const PLAN_DISPLAY: Record<PlanName, PricingDisplayMeta> = {
  TRIAL:   { label: "Trial",   cta: "Dùng thử miễn phí",  isHighlighted: false },
  STARTER: { label: "Starter", cta: "Bắt đầu ngay",        isHighlighted: false },
  GROWTH:  { label: "Growth",  cta: "Đăng ký Growth",       badge: "Phổ biến nhất", isHighlighted: true },
  PRO:     { label: "Pro",     cta: "Liên hệ tư vấn",       isHighlighted: false },
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

export function formatPrice(plan: SubscriptionPlan): { price: string; period: string } {
  if (plan.isTrial) return { price: "0đ", period: "30 ngày" }
  return {
    price: `${Math.round(plan.pricePerMonth).toLocaleString("vi-VN")}đ`,
    period: "/ tháng",
  }
}

export function getPlanFeatures(plan: SubscriptionPlan): string[] {
  const f: string[] = []
  f.push(plan.branchLimit <= 0 ? "Không giới hạn chi nhánh" : `${plan.branchLimit} chi nhánh`)
  f.push(`${plan.aiQuotaPerMonth.toLocaleString("vi-VN")} tin nhắn AI/tháng`)
  if (plan.channelLimit <= 0) f.push("Không giới hạn kênh Facebook/Zalo")
  else if (plan.channelLimit === 1) f.push("1 kênh Facebook/Zalo")
  else f.push(`${plan.channelLimit} kênh Facebook/Zalo`)
  f.push("Báo cáo doanh thu")
  f.push("Check-in/out bằng ảnh")
  if (!plan.isTrial) f.push("Hỗ trợ setup miễn phí")
  return f
}
