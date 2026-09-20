# Quickstart: Partner Landing Page Redesign

**Feature**: `specs/013-partner-page-redesign`  
**Date**: 2026-07-07

> End-to-end implementation and validation scenarios. Follow these in order to verify the redesign works correctly.

---

## Prerequisites

```bash
cd rcfield-fe
npm run dev   # Start dev server at http://localhost:5173
# Navigate to http://localhost:5173/partner
```

---

## Scenario 1: Hero section renders correctly on desktop

**Goal**: Verify hero has headline, CTAs, stats, and dashboard mockup.

**Steps**:
1. Open `/partner` in Chrome, viewport 1280px wide
2. Observe above-the-fold content

**Expected**:
- [ ] `<h1>` visible with bold headline (≥ 4rem)
- [ ] "Bắt đầu miễn phí 30 ngày" orange button visible
- [ ] "Liên hệ tư vấn" outline/secondary button visible
- [ ] Stats row shows "50+" / "12k+" / "4.8★"
- [ ] Dashboard mockup visible on the right side
- [ ] Orange ambient glow background effect present

---

## Scenario 2: Full page scroll on mobile (375px)

**Goal**: Verify all 7 sections render without horizontal scroll, text readable.

**Steps**:
1. Open DevTools → Device toolbar → iPhone SE (375×667)
2. Scroll from top to bottom of `/partner`

**Expected**:
- [ ] No horizontal scrollbar at any point
- [ ] All 7 sections visible in correct order: Hero → Pain Points → How It Works → Features → Testimonials → Pricing → Final CTA
- [ ] Text minimum size ≥ 14px (readable without pinch-zoom)
- [ ] Pain points grid: 1 column (stacked)
- [ ] Features: text above, visual below (stacked)
- [ ] Pricing cards: 1 column stack
- [ ] All CTA buttons ≥ 44px tall

---

## Scenario 3: Pricing section — loading state

**Goal**: Verify skeleton loaders appear and don't cause layout shift.

**Steps**:
1. Open Chrome DevTools → Network → Throttle to "Slow 3G"
2. Hard refresh `/partner`
3. Watch pricing section during load

**Expected**:
- [ ] 4 skeleton cards appear immediately (same grid as real cards)
- [ ] Each skeleton is `animate-pulse` with muted background
- [ ] No layout jump when real cards replace skeletons (CLS ≈ 0)

---

## Scenario 4: Pricing section — real data loaded

**Goal**: Verify correct plan cards with proper CTA routing.

**Steps**:
1. Open `/partner` with normal network
2. Wait for pricing section to load
3. Inspect each plan card

**Expected**:
- [ ] 4 cards visible: Trial, Starter, Growth, Pro
- [ ] GROWTH card: visually distinct (highlighted border/color, scale, "Phổ biến nhất" badge)
- [ ] TRIAL card shows "Dùng thử miễn phí — không cần thẻ tín dụng" note
- [ ] PRO card CTA opens new tab (Zalo link, NOT react-router navigation)
- [ ] Starter/Growth CTAs navigate to `/auth/register-provider` (react-router)
- [ ] Prices render as formatted Vietnamese currency (e.g., "299.000đ")

---

## Scenario 5: Pricing section — API error state

**Goal**: Verify contact banner appears when API fails.

**Steps**:
1. Open DevTools → Network → Block request matching `/v1/subscription-plans`
2. Hard refresh `/partner`
3. Scroll to pricing section

**Expected**:
- [ ] Pricing cards are NOT shown (no blank cards)
- [ ] Contact banner appears with amber/indigo background
- [ ] Banner text: "Không thể tải bảng giá..." (or equivalent)
- [ ] Banner has CTA button → click opens new tab to Zalo OA
- [ ] No uncaught errors in console

---

## Scenario 6: "Liên hệ tư vấn" CTA — all instances

**Goal**: Verify all Zalo CTAs open correct URL in new tab.

**Steps**:
1. Open `/partner` normally
2. Click each "Liên hệ tư vấn" / "Liên hệ" CTA found on page

**Expected for each click**:
- [ ] New tab opens (not current tab navigation)
- [ ] URL is the Zalo OA URL (matches `ZALO_OA_URL` constant)
- [ ] No browser security warning (correct `rel="noopener noreferrer"`)

**CTAs to check**:
- Hero section secondary button
- Final CTA section secondary button
- PRO plan card button
- Contact banner button (if API error state)

---

## Scenario 7: Reduced motion preference

**Goal**: Verify animations respect `prefers-reduced-motion`.

**Steps**:
1. In Chrome: DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion: reduce"
2. Refresh `/partner`

**Expected**:
- [ ] Float animations on hero mockup are NOT playing
- [ ] Shimmer effects (if any on CTA buttons) are NOT playing
- [ ] Page layout remains intact (no broken layout from disabled animations)
- [ ] Skeleton pulse may or may not animate (acceptable either way)

---

## Scenario 8: Desktop feature section — alternating layout

**Goal**: Verify even/odd feature rows alternate text/visual sides.

**Steps**:
1. Open `/partner` at 1280px wide
2. Scroll to Features section

**Expected**:
- [ ] Row 1: text LEFT, visual RIGHT
- [ ] Row 2: text RIGHT, visual LEFT
- [ ] Row 3: text LEFT, visual RIGHT
- [ ] Row 4: text RIGHT, visual LEFT
- [ ] On mobile (375px): all rows stack vertically (text on top, visual on bottom)

---

## Unit Test Checklist

These are the minimum unit tests to write for `PartnerPricing`:

```typescript
// PartnerPricing.test.tsx
describe('PartnerPricing', () => {
  it('renders 4 skeleton cards while loading')
  it('renders plan cards when data loaded')
  it('highlights GROWTH plan with badge and visual distinction')
  it('renders contact banner when API returns error')
  it('PRO plan CTA is an <a> tag with target="_blank"')
  it('non-PRO plan CTAs navigate to /auth/register-provider')
  it('TRIAL card shows no-credit-card note')
  it('formatPrice returns "0đ" for trial plan')
  it('formatPrice formats Vietnamese currency correctly')
})
```
