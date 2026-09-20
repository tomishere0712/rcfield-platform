# Tasks: Partner Landing Page Redesign

**Input**: Design documents from `specs/013-partner-page-redesign/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ui.md ✅, quickstart.md ✅

**Tests**: Not requested in spec — no test tasks generated. Unit test checklist is in `quickstart.md` for manual verification.

**Organization**: Tasks grouped by user story. All tasks target `rcfield-fe/` frontend project. No backend changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: US1 / US2 / US3 per spec.md user stories
- All paths relative to `rcfield-fe/src/`

---

## Phase 1: Setup

**Purpose**: Create directory structure and shared data layer used by all sections.

- [X] T001 Create directory `rcfield-fe/src/pages/public/components/partner/` (mkdir)
- [X] T00X Create `rcfield-fe/src/pages/public/components/partner/partner-data.ts` — define all TypeScript interfaces (`PainPoint`, `HowItWorksStep`, `FeatureShowcase`, `Testimonial`, `PricingDisplayMeta`) and all static data constants (`PAIN_POINTS`, `HOW_IT_WORKS`, `FEATURES`, `TESTIMONIALS`, `STATS`, `ZALO_OA_URL`, `PLAN_DISPLAY`) per `specs/013-partner-page-redesign/data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: Rewrite the orchestrator component so all section imports resolve before implementing sections.

**⚠️ CRITICAL**: Completing T003 unblocks all US1–US3 tasks since they each live in separate files.

- [X] T00X Rewrite `rcfield-fe/src/pages/public/PartnerLandingPage.tsx` as a thin orchestrator: root `<div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>` wrapping 7 stub-exported section components (`PartnerHero`, `PartnerPainPoints`, `PartnerHowItWorks`, `PartnerFeatures`, `PartnerTestimonials`, `PartnerPricing`, `PartnerFinalCta`) imported from `./components/partner/`; create each stub file with a placeholder `export function PartnerXxx() { return null }` so the page compiles

**Checkpoint**: `npm run dev` shows `/partner` route without compile errors — sections render nothing yet but page loads.

---

## Phase 3: User Story 1 — Discovery & Value (Priority: P1) 🎯 MVP

**Goal**: Chủ sân lần đầu vào trang hiểu được: nền tảng giải quyết vấn đề gì, cách hoạt động, ai đang dùng.

**Independent Test**: Open `/partner`, disable network after load, scroll from top to bottom — all 5 storytelling sections (Hero, Pain Points, How It Works, Features, Testimonials) render with real content and no blank areas.

### Implementation

- [X] T00X [P] [US1] Implement `rcfield-fe/src/pages/public/components/partner/PartnerHero.tsx` — `<section className="relative overflow-hidden bg-slate-950 min-h-screen">`, ambient glow divs (pointer-events-none aria-hidden), eyebrow badge ("Dành cho chủ sân RC Cafe"), `<h1>` headline (≥text-4xl mobile, ≥text-6xl lg), subheadline text-slate-400, primary CTA `<Link to={routePaths.providerRegister}>` "Bắt đầu miễn phí 30 ngày", secondary CTA `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` "Liên hệ tư vấn", STATS row (3 items from STATS constant), inline DashboardMockup JSX (dark card with fake booking rows + KPI grid, visible only lg:block)

- [X] T00X [P] [US1] Implement `rcfield-fe/src/pages/public/components/partner/PartnerPainPoints.tsx` — `<section className="bg-slate-900">`, section eyebrow "Bạn đang gặp vấn đề này?" (orange, uppercase, text-xs), section headline, `grid grid-cols-1 md:grid-cols-3 gap-6` of pain point cards from `PAIN_POINTS` (each: icon + title + description on `bg-slate-800 rounded-2xl p-6`)

- [X] T00X [P] [US1] Implement `rcfield-fe/src/pages/public/components/partner/PartnerHowItWorks.tsx` — `<section className="bg-slate-950">`, section eyebrow + headline, 3 step items from `HOW_IT_WORKS` rendered as `flex flex-col lg:flex-row` with large step numbers (text-6xl font-black text-orange-500/20), step title + description; on desktop show horizontal connector line between steps using `border-t border-dashed border-white/10` or equivalent

- [X] T00X [P] [US1] Implement `rcfield-fe/src/pages/public/components/partner/PartnerFeatures.tsx` — `<section className="bg-slate-900">`, section eyebrow + headline, map over `FEATURES` constant; each feature row rendered as `flex flex-col lg:flex-row` (or `lg:flex-row-reverse` when `imagePosition === 'left'`) with text column (icon, eyebrow, title, description, bullets list) and visual column (inline JSX mockup on dark card); on mobile always stacked (text top, visual bottom); implement 4 inline JSX mockup sub-components (BookingCalendarMockup, VehicleHandoffMockup, AIChatMockup, AnalyticsDashboardMockup)

- [X] T00X [P] [US1] Implement `rcfield-fe/src/pages/public/components/partner/PartnerTestimonials.tsx` — `<section className="bg-slate-950">`, section eyebrow + headline, `grid grid-cols-1 md:grid-cols-3 gap-6` of testimonial cards from `TESTIMONIALS`; each card: `<Quote />` Lucide icon, quote text (italic, text-slate-300), star rating row (filled ★ in amber-400 based on `rating` value), author name (font-black text-white), cafe name + city (text-slate-400 text-sm)

**Checkpoint**: Reload `/partner` — sections 1–5 (Hero, Pain Points, How It Works, Features, Testimonials) render with real content. No compile errors. Mobile scroll test passes (no horizontal overflow).

---

## Phase 4: User Story 2 — Pricing & Signup (Priority: P2)

**Goal**: Chủ sân so sánh gói và click CTA để đăng ký Provider.

**Independent Test**: Scroll to pricing section — 4 plan cards (or skeleton during load, or contact banner on error) render correctly; clicking non-PRO CTA navigates to `/auth/register-provider`; GROWTH card visually distinct.

### Implementation

- [X] T00X [US2] Replace stub in `rcfield-fe/src/pages/public/components/partner/PartnerPricing.tsx` with skeleton loading state — add `const { data: plans, isLoading, isError } = useQuery({ queryKey: ['subscription-plans'], queryFn: subscriptionApi.listSubscriptionPlans })` from `@tanstack/react-query`; when `isLoading`: render `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6` of 4 skeleton divs each `h-[320px] rounded-2xl bg-slate-800/50 animate-pulse motion-reduce:animate-none`; section wrapper `<section className="bg-slate-900">`

- [X] T01X [US2] Add success state to `rcfield-fe/src/pages/public/components/partner/PartnerPricing.tsx` — when `!isLoading && !isError && plans`: render same grid with real plan cards; each card shows: plan label (`PLAN_DISPLAY[plan.name].label`), formatted price (`formatPrice(plan)`), period, feature list (`getPlanFeatures(plan)` helper returning string[]), CTA button; non-PRO plans use `<Link to={routePaths.providerRegister}>`, PRO plan uses `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">`; TRIAL card shows "Không cần thẻ tín dụng" note below CTA; implement `formatPrice` and `getPlanFeatures` helpers inside the file

- [X] T01X [US2] Add GROWTH highlight treatment to `rcfield-fe/src/pages/public/components/partner/PartnerPricing.tsx` — wrap GROWTH card in `<div className="relative scale-105 z-10">`; add `ring-2 ring-orange-500 shadow-lg shadow-orange-500/20` to card; position "Phổ biến nhất" badge `absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-black px-4 py-1 rounded-full whitespace-nowrap`; use `bg-gradient-to-b from-orange-600 to-orange-700` for GROWTH card background vs `bg-slate-800` for others

- [X] T01X [US2] Add ContactBanner error state to `rcfield-fe/src/pages/public/components/partner/PartnerPricing.tsx` — when `isError`: render a `<div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-10 text-center">` banner; headline "Không thể tải bảng giá"; subtext "Vui lòng liên hệ để được tư vấn và báo giá trực tiếp"; CTA `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer" className="...orange button...">Liên hệ qua Zalo</a>`

**Checkpoint**: Pricing section shows skeleton → loads plan cards with GROWTH highlighted → test error state by blocking API in DevTools (ContactBanner appears); CTA routing correct.

---

## Phase 5: User Story 3 — Contact & Nurture (Priority: P3)

**Goal**: Chủ sân chưa sẵn sàng đăng ký tìm được đường liên hệ tư vấn.

**Independent Test**: Scroll to bottom of page — PartnerFinalCta section renders with both register and Zalo CTAs; all "Liên hệ" buttons on page open Zalo OA in new tab.

### Implementation

- [X] T01X [US3] Replace stub in `rcfield-fe/src/pages/public/components/partner/PartnerFinalCta.tsx` — `<section className="relative bg-slate-950 overflow-hidden">`, decorative dot-grid texture (inline CSS `backgroundImage: radial-gradient(...)`), container `max-w-3xl mx-auto text-center`, large headline (text-4xl md:text-5xl font-black text-white), supporting text (text-slate-400), button row: primary `<Link to={routePaths.providerRegister}>` "Bắt đầu miễn phí 30 ngày" (orange, h-13), secondary `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` "Liên hệ tư vấn" (outline/ghost); trust strip row below buttons with ≥3 items (e.g., "Không cần thẻ tín dụng", "Hủy bất cứ lúc nào", "Hỗ trợ setup miễn phí") with checkmark icons

- [X] T01X [US3] Audit all Zalo OA links across `PartnerHero.tsx`, `PartnerPricing.tsx` (PRO card + error banner), `PartnerFinalCta.tsx` — verify each is `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` using the imported `ZALO_OA_URL` constant (not a hardcoded string); run global search in `rcfield-fe/src/pages/public/components/partner/` for any hardcoded Zalo URL string and replace with constant reference

**Checkpoint**: All 4 "Liên hệ" CTA instances (Hero secondary, PRO card, error banner, FinalCta secondary) open the same Zalo OA URL in new tab. No hardcoded strings.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, responsive, motion, and quality validation across all partner components.

- [X] T01X Audit mobile-first responsive layout at 375px across all 7 sections — open DevTools → iPhone SE preset → verify: no horizontal scroll, all grids collapse to 1-column, text ≥14px, GROWTH card scale-105 doesn't cause overflow; fix any overflowing elements in relevant `rcfield-fe/src/pages/public/components/partner/*.tsx` files

- [X] T01X Add `motion-reduce:animate-none` Tailwind variant to all `animate-*` classes across `rcfield-fe/src/pages/public/components/partner/PartnerHero.tsx` (float animations, glow pulses) and `PartnerPricing.tsx` (skeleton animate-pulse already has it from T009); verify in DevTools Rendering → prefers-reduced-motion: reduce — no animations play

- [X] T01X [P] Verify all CTA buttons across partner/* components have `min-h-[44px]` or equivalent (h-11, h-12, h-13) for touch target compliance — scan `PartnerHero.tsx`, `PartnerPricing.tsx`, `PartnerFinalCta.tsx`; add `min-h-[44px]` where missing

- [X] T01X [P] Verify section background alternation in `rcfield-fe/src/pages/public/PartnerLandingPage.tsx` — confirm sections render in order with correct alternating backgrounds (Hero: slate-950, PainPoints: slate-900, HowItWorks: slate-950, Features: slate-900, Testimonials: slate-950, Pricing: slate-900, FinalCta: slate-950) per research.md Decision 8; add `px-4 md:px-6` container padding inside each section's inner div if missing

- [X] T01X Run all 8 Quickstart scenarios from `specs/013-partner-page-redesign/quickstart.md` manually in browser — document any failing scenarios and fix in the corresponding component before marking this task complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2, T003)**: Depends on T001+T002 — BLOCKS all user story tasks
- **User Story 1 (Phase 3, T004–T008)**: Depend on T003 — all 5 can run in parallel (different files)
- **User Story 2 (Phase 4, T009–T012)**: Depend on T003; T010 depends on T009 (success state builds on loading state); T011 depends on T010; T012 is independent of T010/T011
- **User Story 3 (Phase 5, T013–T014)**: T013 depends on T003; T014 depends on T004, T010–T012, T013 (audits all files)
- **Polish (Phase 6, T015–T019)**: Depend on all US phases complete

### Within User Story 2 (sequential)
```
T009 (skeleton/loading) → T010 (success state) → T011 (GROWTH highlight)
                         ↘ T012 (error banner) — independent of T010/T011
```

### Parallel Opportunities

US1 tasks T004–T008 can all run concurrently (5 independent files):
```bash
# Simultaneously implement:
PartnerHero.tsx       (T004)
PartnerPainPoints.tsx (T005)
PartnerHowItWorks.tsx (T006)
PartnerFeatures.tsx   (T007)
PartnerTestimonials.tsx (T008)
```

Polish tasks T017 and T018 can run in parallel (different concerns, different files).

---

## Parallel Example: User Story 1

```bash
# After T003 completes, launch all US1 tasks simultaneously:
Task T004: "Implement PartnerHero.tsx"
Task T005: "Implement PartnerPainPoints.tsx"
Task T006: "Implement PartnerHowItWorks.tsx"
Task T007: "Implement PartnerFeatures.tsx"
Task T008: "Implement PartnerTestimonials.tsx"
# All 5 tasks touch different files → zero conflicts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003) — compile check
3. Complete Phase 3: User Story 1 (T004–T008 in parallel)
4. **STOP and VALIDATE**: Page shows full storytelling narrative (Hero → Testimonials)
5. Deploy/demo with pricing section hidden or placeholder

### Incremental Delivery

1. Phase 1 + 2 → Foundation + compile ✅
2. Phase 3 (US1) → Storytelling sections live ✅ (MVP)
3. Phase 4 (US2) → Pricing with API live ✅
4. Phase 5 (US3) → All Zalo CTAs wired ✅
5. Phase 6 → Polish + Quickstart validation ✅ (ship-ready)

### Single Developer Order (Recommended)

```
T001 → T002 → T003 → T004 (Hero) → T005 (PainPoints) → T006 (HowItWorks) 
     → T007 (Features) → T008 (Testimonials)
     → T009 → T010 → T011 → T012 (Pricing)
     → T013 → T014 (Contact CTAs)
     → T015 → T016 → T017 → T018 → T019 (Polish)
```

---

## Notes

- All paths relative to `rcfield-fe/src/` unless otherwise noted
- `ZALO_OA_URL` imported from `partner-data.ts` — never hardcode in component files
- `routePaths.providerRegister` (not `routePaths.register`) for all signup CTAs
- Stub components created in T003 are overwritten in T004–T008 and T009–T013 — this is expected
- T007 (Features) is the most complex task — JSX mockup components for 4 features require visual design judgment; reference the current `PartnerLandingPage.tsx` (608 lines) for existing mockup patterns
