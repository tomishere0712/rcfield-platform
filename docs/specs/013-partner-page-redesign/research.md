# Research: Partner Landing Page Redesign

**Feature**: `specs/013-partner-page-redesign`  
**Date**: 2026-07-07

---

## Decision 1: Component extraction strategy

**Decision**: Extract each of the 7 sections into dedicated sub-components under `src/pages/public/components/partner/`, orchestrated by a thin `PartnerLandingPage.tsx` shell.

**Rationale**: The current 608-line file is already at the upper limit of maintainability. Each section has distinct data dependencies and visual logic. Splitting allows independent review, easier A/B testing of sections, and prevents one section's changes from touching unrelated sections.

**Alternatives considered**:
- Keep everything in one file: rejected — 7+ sections × 80+ lines each = 600+ lines, hard to navigate and review
- One component per section + shared file: chosen approach — right balance of isolation and discoverability

---

## Decision 2: Data co-location (static data stays in component)

**Decision**: All static data (`PAIN_POINTS`, `HOW_IT_WORKS`, `FEATURES`, `TESTIMONIALS`) stays as module-level constants in each respective component file, NOT in a separate `data/` folder or CMS.

**Rationale**: This is a marketing page with infrequent content changes. No CMS or backend content API exists. Co-locating data with the component reduces indirection and makes content edits straightforward (one file per section). Content changes require a deploy — acceptable for a V1 SaaS landing page.

**Alternatives considered**:
- Separate `data/partner-page.ts`: rejected — adds a file with no behavior, increases cognitive overhead
- CMS / headless Contentful: rejected — no infrastructure, overkill for a Startup-stage product

---

## Decision 3: Pricing API error handling — contact banner pattern

**Decision**: When `listSubscriptionPlans()` fails, replace the pricing grid with a single `ContactBanner` component that links to Zalo OA. No retry button, no hardcoded fallback prices.

**Rationale**: Showing hardcoded fallback prices risks displaying stale pricing to potential customers. A contact banner:
1. Avoids showing incorrect prices
2. Converts the error into a nurturing opportunity (human-assisted sales)
3. Is simpler to implement and maintain

**Alternatives considered**:
- Hardcoded fallback prices: rejected — stale price risk, maintenance burden
- Error message + retry: rejected — users rarely retry; shifts cognitive burden to them
- Hide pricing section entirely: rejected — disrupts page flow, may look broken

---

## Decision 4: Zalo OA URL — single constant

**Decision**: Define `ZALO_OA_URL` as a module-level constant at the top of `PartnerLandingPage.tsx`. All "Liên hệ tư vấn" CTA elements reference this constant.

**Rationale**: The Zalo OA URL will likely change as the business grows. One reference point means one-line change. Using environment variable (VITE_ZALO_OA_URL) is over-engineering for a URL that changes infrequently.

**Alternatives considered**:
- Environment variable: rejected — adds build-time config for a rarely-changing URL
- Inline URL repeated per CTA: rejected — inconsistency risk when URL changes

---

## Decision 5: Animation strategy — CSS keyframes + motion-reduce

**Decision**: Use CSS keyframe animations (via Tailwind `animate-*` or custom `@keyframes` in `globals.css`) with `motion-reduce:` Tailwind variants to disable them. No JavaScript-driven animations (Framer Motion).

**Rationale**: Framer Motion is not in the project's dependencies. Adding it for a landing page is scope creep. Tailwind + CSS keyframes are sufficient for the visual quality target (float animation on Hero mockup, shimmer on CTA button). The `motion-reduce:` variant ensures accessibility compliance (FR-014).

**Alternatives considered**:
- Framer Motion: rejected — not in deps, adds 30KB to bundle
- No animation at all: rejected — premium feel requires subtle motion
- React Spring: same rejection as Framer Motion

---

## Decision 6: GROWTH plan highlight treatment

**Decision**: GROWTH plan card uses: `ring-2 ring-orange-500`, `scale-105` transform, orange background gradient, and a "Phổ biến nhất" badge absolutely positioned at the top center. Other plan cards use `bg-slate-800`.

**Rationale**: The scale + ring combination creates the strongest visual hierarchy without overloading the card with color (which could reduce readability of the feature list). This pattern is standard on SaaS pricing pages (Stripe, Linear, Notion).

**Alternatives considered**:
- Full orange background for GROWTH: partial — used as gradient (`from-orange-600 to-orange-700`) but body text still white
- Border only: rejected — too subtle at a glance
- Larger card: rejected — layout instability on different viewport sizes

---

## Decision 7: Skeleton loader dimensions

**Decision**: Pricing skeleton cards use fixed `h-[320px]` with `animate-pulse` and `rounded-2xl bg-slate-800/50`. Four skeleton cards rendered in the same grid as the real cards.

**Rationale**: Matching exact dimensions of real cards prevents CLS (Core Web Vitals: CLS < 0.1 per SC-004). Four skeletons match the four plan types (TRIAL, STARTER, GROWTH, PRO).

---

## Decision 8: Section background alternation

**Decision**: Alternate between `bg-slate-950` and `bg-slate-900` for adjacent sections to create visual breathing room without color jarring.

- Hero: `bg-slate-950` (darkest)
- Pain Points: `bg-slate-900`
- How It Works: `bg-slate-950`
- Features: `bg-slate-900`
- Testimonials: `bg-slate-950`
- Pricing: `bg-slate-900`
- Final CTA: `bg-slate-950` (dark cap)

**Rationale**: Prevents the "wall of same-color dark background" problem while keeping the premium dark aesthetic consistent. Avoids bright white sections which would clash with the gaming/RC brand.

---

## Decision 9: Features section — inline JSX mockups vs real images

**Decision**: Feature visual elements remain as inline JSX/HTML mockups (no image files) — miniature UI previews built from divs/spans.

**Rationale**: No design assets available. Image files require Cloudinary upload, hosting, and optimization decisions. JSX mockups load instantly (no network request), have perfect CLS (known dimensions), and can be styled consistently with Tailwind. The "premium" visual feel comes from the mockup design quality, not photographic assets.

**Alternatives considered**:
- Unsplash placeholder images: rejected — off-brand, breaks if URL expires
- SVG illustrations: rejected — requires design/illustration work outside scope

---

## Decision 10: Typography hierarchy

**Decision**: 
- Section headlines: `text-3xl font-black` (mobile) → `text-5xl font-black` (desktop)
- Body / description text: `text-slate-400`, `text-base leading-7`
- Section labels (eyebrow): `text-xs font-black uppercase tracking-widest text-orange-400`
- Font: `'Plus Jakarta Sans', sans-serif` scoped to `PartnerLandingPage`

**Rationale**: Plus Jakarta Sans (geometric B2B SaaS font) contrasts with Russo One/Chakra Petch used on the customer landing page, signaling a different (more professional, enterprise) audience. Heavy weights (`font-black = 900`) create strong visual hierarchy on dark backgrounds.
