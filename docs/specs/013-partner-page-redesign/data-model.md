# Data Model: Partner Landing Page Redesign

**Feature**: `specs/013-partner-page-redesign`  
**Date**: 2026-07-07

> This is a frontend-only feature. "Data model" here refers to the TypeScript interface contracts for static data constants and component props. No database entities are introduced.

---

## Static Data Interfaces

### `PainPoint`
```typescript
interface PainPoint {
  icon: ReactNode      // Lucide icon element
  title: string        // Short pain label (≤ 5 words)
  description: string  // 1–2 sentence description of the problem
}
```

**Sample data** (3 required, per FR-003):
```typescript
const PAIN_POINTS: PainPoint[] = [
  {
    icon: <AlertTriangle className="size-5 text-red-400" />,
    title: "Tranh chấp hư hỏng xe",
    description: "Không có bằng chứng hình ảnh khi bàn giao — tranh cãi mất thời gian và lòng tin khách.",
  },
  {
    icon: <Clock className="size-5 text-amber-400" />,
    title: "Quản lý lịch thủ công",
    description: "Ghi sổ, nhắn Zalo, nhận tiền mặt — dễ nhầm lẫn khi có nhiều khách cùng lúc.",
  },
  {
    icon: <MessageSquare className="size-5 text-rose-400" />,
    title: "Tư vấn mất nhân lực",
    description: "Mỗi lần khách hỏi giá hoặc xe phù hợp đều cần người trả lời trực tiếp.",
  },
]
```

---

### `HowItWorksStep`
```typescript
interface HowItWorksStep {
  number: number    // Display number (1, 2, 3)
  title: string     // Step headline
  description: string  // 1–2 sentence step description
}
```

**Sample data** (3 steps minimum, per FR-004):
```typescript
const HOW_IT_WORKS: HowItWorksStep[] = [
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
    description: "Check-in/out bằng ảnh trực tiếp trong app — bảo vệ cả sân lẫn khách.",
  },
]
```

---

### `FeatureShowcase`
```typescript
interface FeatureShowcase {
  icon: ReactNode          // Lucide icon for the eyebrow
  eyebrow: string          // Short category label (e.g., "Dashboard")
  title: string            // Feature headline
  description: string      // 2–3 sentence benefit description
  bullets: string[]        // 3–4 bullet points of specific benefits
  visual: ReactNode        // Inline JSX mockup element
  imagePosition: 'left' | 'right'  // Which side the visual is on
}
```

**Sample data** (≥4 features, per FR-005):
```typescript
const FEATURES: FeatureShowcase[] = [
  {
    eyebrow: "Lịch & Đặt chỗ",
    icon: <CalendarCheck />,
    title: "Lịch thông minh, không cần nhân viên trực",
    description: "...",
    bullets: ["Khách đặt 24/7 qua app", "Tự động confirm & nhắc nhở", "Ngăn double-booking"],
    visual: <BookingCalendarMockup />,
    imagePosition: 'right',
  },
  // ... 3 more features
]
```

---

### `Testimonial`
```typescript
interface Testimonial {
  quote: string       // The testimonial text (2–3 sentences)
  authorName: string  // Full name of the provider owner
  cafeName: string    // Name of their RC Cafe
  city: string        // City (e.g., "TP. Hồ Chí Minh")
  rating: 1 | 2 | 3 | 4 | 5  // Star rating
}
```

**Sample data** (3 testimonials, per FR-006):
```typescript
const TESTIMONIALS: Testimonial[] = [
  {
    quote: "Trước đây tôi phải nhắn tin hỏi từng khách xem muốn thuê xe gì. Bây giờ app làm hết — tôi chỉ cần chuẩn bị xe.",
    authorName: "Nguyễn Văn Hùng",
    cafeName: "RC Arena Sài Gòn",
    city: "TP. Hồ Chí Minh",
    rating: 5,
  },
  {
    quote: "Lần đầu tiên tôi có bằng chứng ảnh rõ ràng khi bàn giao xe. Không còn tranh chấp với khách nữa.",
    authorName: "Trần Minh Khoa",
    cafeName: "RC Cafe Hà Nội",
    city: "Hà Nội",
    rating: 5,
  },
  {
    quote: "Gói GROWTH phù hợp với sân 3 track của tôi. Báo cáo doanh thu theo ngày rất tiện để kiểm soát.",
    authorName: "Lê Thị Bích Ngọc",
    cafeName: "PlayZone RC Đà Nẵng",
    city: "Đà Nẵng",
    rating: 5,
  },
]
```

---

## API Data (External)

### `SubscriptionPlan` (existing, from `src/features/subscriptions/types/index.ts`)
```typescript
interface SubscriptionPlan {
  id: string
  name: 'TRIAL' | 'STARTER' | 'GROWTH' | 'PRO'  // PlanName
  branchLimit: number          // -1 = unlimited
  aiQuotaPerMonth: number      // -1 = unlimited
  channelLimit: number         // -1 = unlimited
  pricePerMonth: number        // VND amount
  isTrial: boolean
}
```

**Source**: `subscriptionApi.listSubscriptionPlans()` → `GET /v1/subscription-plans`  
**Caching**: React Query default (staleTime: 0, refetch on mount)  
**Error state**: Render `<ContactBanner />` instead of pricing grid  
**Loading state**: Render 4 skeleton cards with `animate-pulse`

---

## UI State Interfaces

### `PricingDisplayMeta` (derived, per plan)
```typescript
interface PricingDisplayMeta {
  label: string       // Human-readable name ("Trial", "Starter", "Growth", "Pro")
  cta: string         // CTA button text
  badge?: string      // Optional badge text (only GROWTH: "Phổ biến nhất")
  isHighlighted: boolean  // Only GROWTH = true
}

const PLAN_DISPLAY: Record<PlanName, PricingDisplayMeta> = {
  TRIAL:   { label: "Trial",   cta: "Dùng thử miễn phí",  isHighlighted: false },
  STARTER: { label: "Starter", cta: "Bắt đầu ngay",        isHighlighted: false },
  GROWTH:  { label: "Growth",  cta: "Đăng ký Growth",       badge: "Phổ biến nhất", isHighlighted: true },
  PRO:     { label: "Pro",     cta: "Liên hệ tư vấn",       isHighlighted: false },
}
```

---

## Constants

```typescript
// Single source of truth for Zalo OA URL — change here only
const ZALO_OA_URL = "https://zalo.me/rcfield"  // Replace with real OA ID

// Social proof stats (hardcoded, no live API)
const STATS = [
  { value: "50+",  label: "RC Cafe đang dùng" },
  { value: "12k+", label: "Phiên chơi đặt qua app" },
  { value: "4.8★", label: "Đánh giá trung bình" },
]
```
