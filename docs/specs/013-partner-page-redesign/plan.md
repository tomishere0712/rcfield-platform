# Implementation Plan: Partner Landing Page Redesign

**Branch**: `main` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/013-partner-page-redesign/spec.md`

## Summary

Redesign `rcfield-fe/src/pages/public/PartnerLandingPage.tsx` — a single-file B2B landing page targeting RC Cafe owners who want to register as Providers. The current page (608 lines) already has the 7 required sections but needs: (1) stronger visual hierarchy and premium feel, (2) clearer pain→solution storytelling, (3) Zalo OA contact integration, (4) contact banner fallback for API errors, and (5) mobile-first layout polish. No backend changes required.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode)  
**Primary Dependencies**: React 18+, Tailwind CSS v4, shadcn/ui, Lucide React, React Query (@tanstack/react-query v5), React Router  
**Storage**: N/A — static page with one API call (`GET /v1/subscription-plans`)  
**Testing**: Vitest + React Testing Library (existing test setup)  
**Target Platform**: Web (mobile 375px → desktop 1440px+)  
**Project Type**: Single React page component (frontend only)  
**Performance Goals**: Above-the-fold LCP < 2s on 4G; Lighthouse Performance ≥ 85 on mobile  
**Constraints**: No new npm packages; no backend changes; font Plus Jakarta Sans already loaded in `index.html`; Tailwind v4 inline `@theme` system (no `tailwind.config.ts`)  
**Scale/Scope**: 1 file primary (`PartnerLandingPage.tsx`), possibly extract sub-components to `src/pages/public/components/`

## Constitution Check

*GATE: Must pass before Phase 0 research.*

This feature is **pure frontend** — a React page redesign with no backend logic, no payment calculations, no state machine transitions, and no database interaction beyond an existing read-only API call. Constitution principles I–VI are backend-specific and **do not apply**. All gates PASS.

| Principle | Applies? | Status |
|-----------|----------|--------|
| I. Snapshot-First Pricing | No — no payment logic | ✅ N/A |
| II. State Machine Gate | No — no booking/session mutations | ✅ N/A |
| III. Evidence-Based Handover | No — no inspection flow | ✅ N/A |
| IV. Payment Component Isolation | No — no payment components | ✅ N/A |
| V. Test-First Financial Logic | No — no financial rules | ✅ N/A |
| VI. RBAC Enforcement | Partial — public page, no auth required | ✅ Route is public |

**Additional checks**:
- CTA for "Đăng ký" navigates to `routePaths.providerRegister` (`/auth/register-provider`) ✅ existing route
- CTA for "Liên hệ" opens Zalo OA in new tab — no auth needed ✅
- `prefers-reduced-motion` respected ✅ (FR-014)

## Project Structure

### Documentation (this feature)

```text
specs/013-partner-page-redesign/
├── plan.md              ← This file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output (UI data interfaces)
├── quickstart.md        ← Phase 1 output (E2E test scenarios)
├── contracts/
│   └── ui.md            ← Phase 1 output (component contracts)
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code (rcfield-fe)

```text
rcfield-fe/src/
├── pages/public/
│   ├── PartnerLandingPage.tsx          ← PRIMARY FILE: full rewrite
│   └── components/                      ← Extract heavy sections if > 200 lines
│       ├── partner/                     ← New subfolder for partner-specific components
│       │   ├── PartnerHero.tsx          ← Hero section (dashboard mockup)
│       │   ├── PartnerPainPoints.tsx    ← Pain points 3-card grid
│       │   ├── PartnerHowItWorks.tsx    ← Numbered steps
│       │   ├── PartnerFeatures.tsx      ← Alternating feature showcases
│       │   ├── PartnerTestimonials.tsx  ← Testimonial quote cards
│       │   ├── PartnerPricing.tsx       ← Pricing cards + skeleton + contact banner fallback
│       │   └── PartnerFinalCta.tsx      ← Final CTA section
│       └── [existing public components unchanged]
├── features/subscriptions/
│   ├── api/subscription.api.ts         ← No change (uses listSubscriptionPlans())
│   └── types/index.ts                  ← No change (SubscriptionPlan, PlanName)
└── app/router/route-paths.ts           ← No change (providerRegister already exists)
```

**Structure Decision**: The primary implementation target is `PartnerLandingPage.tsx`. Sub-components are extracted into `src/pages/public/components/partner/` only if the file exceeds ~250 lines per section — this keeps the redesign self-contained and reviewable. Existing public components (LandingHero, LandingCta, etc.) remain unchanged.

## Implementation Notes & Gotchas

### 1. Zalo OA URL as a module-level constant
All "Liên hệ tư vấn" CTAs MUST reference a single `ZALO_OA_URL` constant defined at the top of `PartnerLandingPage.tsx`. This prevents inconsistency if the URL changes.

```typescript
const ZALO_OA_URL = "https://zalo.me/rcfield" // Replace with real OA URL
```

All `<a href={ZALO_OA_URL} target="_blank" rel="noopener noreferrer">` must use this constant.

### 2. API error → contact banner (not pricing cards)
When `useQuery` for subscription plans fails (`isError === true`), render a contact banner component instead of the plan grid. The banner should:
- Use a distinct warning/info color (amber or indigo, NOT red — this isn't an error the user caused)
- Show text: "Không thể tải bảng giá — liên hệ để được tư vấn trực tiếp"
- Include a CTA button → Zalo OA

### 3. GROWTH plan highlight
The `GROWTH` plan MUST render with a visually distinct treatment. Use a combination of:
- Scale transform (`scale-105` or `ring-2 ring-orange-500`)
- "Phổ biến nhất" badge above the card
- Different background (e.g., `bg-orange-600` vs `bg-slate-800` for others)

### 4. Skeleton loader anti-CLS
Skeleton loaders for pricing cards MUST match the exact dimensions of the real cards to prevent cumulative layout shift (CLS). Use `animate-pulse` Tailwind utility with fixed `h-[280px]` or similar.

### 5. prefers-reduced-motion
Any CSS animation (float, shimmer, pulse-glow) must be conditional:
```css
@media (prefers-reduced-motion: reduce) {
  /* disable animations */
}
```
Or in Tailwind: use the `motion-reduce:` variant.

### 6. Mobile-first breakpoints
- Default: 375px (single column, full-width cards)
- `sm:`: 640px
- `md:`: 768px (2-column features)
- `lg:`: 1024px (3-column pricing, alternating features)
- `xl:`: 1280px+ (max-w-7xl container)

### 7. Plus Jakarta Sans scope
Font applies only to `PartnerLandingPage.tsx` via inline `style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}` on the root `<div>`. Global font remains Be Vietnam Pro per `globals.css`.

### 8. routePaths.providerRegister
All "Đăng ký" CTAs use `<Link to={routePaths.providerRegister}>` — NOT `routePaths.register` (which is for customer signup).

## Complexity Tracking

No constitution violations. No complexity justification required.
