# UI Component Contracts: Partner Landing Page Redesign

**Feature**: `specs/013-partner-page-redesign`  
**Date**: 2026-07-07

> These contracts define the expected props, render behavior, and integration points for each section component. They serve as acceptance criteria for implementation.

---

## `PartnerLandingPage` (orchestrator)

**File**: `src/pages/public/PartnerLandingPage.tsx`

**Renders**:
```
<div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
  <PartnerHero />
  <PartnerPainPoints />
  <PartnerHowItWorks />
  <PartnerFeatures />
  <PartnerTestimonials />
  <PartnerPricing />
  <PartnerFinalCta />
</div>
```

**Invariants**:
- `ZALO_OA_URL` constant defined at module level, referenced by `PartnerHero`, `PartnerPricing` (PRO CTA + contact banner), and `PartnerFinalCta`
- No props required (pure page component, no router params consumed)
- Font scoped to root `<div>` only, does not leak to global

---

## `PartnerHero`

**File**: `src/pages/public/components/partner/PartnerHero.tsx`

**Props**: none (pure static + constant references)

**Must render**:
- `<section>` with `bg-slate-950`, min-height `100svh` or `min-h-screen`
- Headline: bold, ≥ `text-4xl` on mobile, ≥ `text-6xl` on desktop
- Subheadline: `text-slate-400`, `text-base md:text-lg`
- Primary CTA: `<Link to={routePaths.providerRegister}>` — text "Bắt đầu miễn phí 30 ngày"
- Secondary CTA: `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` — text "Liên hệ tư vấn"
- Stats row: 3 items from `STATS` constant (50+, 12k+, 4.8★)
- Dashboard mockup: inline JSX (`<DashboardMockup />` sub-component or inline), visible only `lg:block`

**Accessibility**:
- `<h1>` is unique on the page
- CTA buttons have ≥ 44px touch target height
- Decorative glow divs have `aria-hidden="true"` or `pointer-events-none`

---

## `PartnerPainPoints`

**File**: `src/pages/public/components/partner/PartnerPainPoints.tsx`

**Props**: none

**Must render**:
- `<section>` with `bg-slate-900`
- Section eyebrow label: "Bạn đang gặp vấn đề này?" (orange text, uppercase, small)
- Section headline
- Grid of ≥ 3 `PainPoint` cards from `PAIN_POINTS` constant
- Each card: icon + title + description, dark card background (`bg-slate-800` or `bg-slate-950/60`)
- Grid: `grid-cols-1 md:grid-cols-3`

---

## `PartnerHowItWorks`

**File**: `src/pages/public/components/partner/PartnerHowItWorks.tsx`

**Props**: none

**Must render**:
- `<section>` with `bg-slate-950`
- 3+ numbered steps from `HOW_IT_WORKS` constant
- Each step: large number, title, description
- Visual connector line between steps on desktop (`lg:flex` row with line between)
- On mobile: vertical stack, connector line becomes vertical or hidden

---

## `PartnerFeatures`

**File**: `src/pages/public/components/partner/PartnerFeatures.tsx`

**Props**: none

**Must render**:
- `<section>` with `bg-slate-900`
- ≥ 4 feature rows from `FEATURES` constant
- Each row: alternating layout — on desktop, odd rows have text left + visual right; even rows reverse
- On mobile: always stacked (text top, visual bottom)
- Visual element: inline JSX mockup (dark card with fake UI elements)

**Alternating invariant**: `imagePosition === 'right'` → `flex-row` on desktop; `imagePosition === 'left'` → `flex-row-reverse` on desktop

---

## `PartnerTestimonials`

**File**: `src/pages/public/components/partner/PartnerTestimonials.tsx`

**Props**: none

**Must render**:
- `<section>` with `bg-slate-950`
- Grid of 3 testimonial cards from `TESTIMONIALS` constant
- Each card: quote text (with `<Quote />` icon), author name, cafe name, city, star rating
- Star rating: render ★ symbols — filled stars in amber, count matches `rating` value
- Grid: `grid-cols-1 md:grid-cols-3`

---

## `PartnerPricing`

**File**: `src/pages/public/components/partner/PartnerPricing.tsx`

**Props**: none (uses `useQuery` internally)

**Must render (loading state)**:
- 4 skeleton cards in same grid layout as real cards
- `animate-pulse` on each skeleton
- Fixed height `h-[320px]` per skeleton to prevent CLS

**Must render (success state)**:
- Grid of subscription plan cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- Each card: plan name, price, period, feature list, CTA button
- GROWTH card: `ring-2 ring-orange-500`, `scale-105` or equivalent highlight, "Phổ biến nhất" badge
- PRO card CTA: `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` (NOT a router Link)
- All other plan CTAs: `<Link to={routePaths.providerRegister}>`
- TRIAL card badge: "Dùng thử miễn phí — không cần thẻ tín dụng"

**Must render (error state)**:
- `<ContactBanner />` sub-component
- Banner text: "Không thể tải bảng giá hiện tại — vui lòng liên hệ để được tư vấn trực tiếp"
- Banner CTA: `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">Liên hệ qua Zalo</a>`
- Banner color: amber/indigo tone (NOT red — this is not a user error)

**Helper functions** (internal to component or extracted):
```typescript
function getPlanFeatures(plan: SubscriptionPlan): string[]
function formatPrice(plan: SubscriptionPlan): { price: string; period: string }
```

---

## `PartnerFinalCta`

**File**: `src/pages/public/components/partner/PartnerFinalCta.tsx`

**Props**: none

**Must render**:
- `<section>` with `bg-slate-950` (dark cap at page end)
- Large headline (motivational, action-oriented)
- Primary CTA: `<Link to={routePaths.providerRegister}>` — "Bắt đầu miễn phí 30 ngày"
- Secondary CTA: `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` — "Liên hệ tư vấn"
- Trust strip: ≥ 3 trust items (e.g., "Không cần thẻ tín dụng", "Hủy bất cứ lúc nào", "Hỗ trợ setup miễn phí")

---

## Cross-cutting constraints

| Constraint | Applies to |
|------------|-----------|
| `min-h-[44px]` on all CTA buttons | All CTAs in all sections |
| `motion-reduce:animate-none` on all animations | Hero, Pricing skeleton, any shimmer |
| `ZALO_OA_URL` constant for all Zalo links | Hero, Pricing (PRO + error), FinalCta |
| `routePaths.providerRegister` (NOT `.register`) | Hero, Pricing (non-PRO), FinalCta |
| `target="_blank" rel="noopener noreferrer"` | All external links (Zalo) |
| No `console.error` unhandled in production | PartnerPricing (wrap useQuery properly) |
