---
description: "Task list for AI Revenue Analytics implementation"
---

# Tasks: AI Revenue Analytics for Providers

**Input**: Design documents from `specs/010-ai-revenue-analytics/`
**Prerequisites**: plan.md ✅, spec.md ✅

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: No new project — existing Express + React monorepos. No setup tasks required.

*Skip to Phase 2.*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database table + entity that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Create migration `rcfeild-be/src/migrations/1752000000000-AiAnalysisLog.ts` — `ai_analysis_logs` table + `ai_analysis_status_enum` + seed `AI_REVENUE_ANALYTICS` feature flag row
- [x] T002 Create entity `rcfeild-be/src/models/ai-analysis-log.entity.ts` — `AiAnalysisLog` with columns: id, providerId, cafeId, periodFrom, periodTo, status, tokensUsed, durationMs, requestedAt, createdAt
- [ ] T003 Run `npm run migration:run` in `rcfeild-be/` and verify `ai_analysis_logs` table + flag row exist in DB

**Checkpoint**: Foundation ready — all user story phases can now begin.

---

## Phase 3: User Story 2 — Admin Enables/Disables Feature Flag (Priority: P1)

> US2 is implemented before US1 because the feature flag must be toggleable before providers can use it.

**Goal**: Admin can toggle `AI_REVENUE_ANALYTICS` on/off via a real backend API; change is persisted immediately.

**Independent Test**: `curl -X PATCH /api/v1/admin/feature-flags/AI_REVENUE_ANALYTICS -H "Authorization: Bearer <admin_token>" -d '{"isEnabled":true}'` returns 200; row in `feature_flags` reflects new value. Then open AdminFeatureFlagsPage and confirm the toggle reflects DB state.

### Implementation for User Story 2

- [x] T004 [US2] Create `rcfeild-be/src/controllers/admin-feature-flags.controller.ts` — `list` handler (GET all flags) and `update` handler (PATCH by key, accepts `isEnabled` and/or `config`)
- [x] T005 [US2] Create `rcfeild-be/src/routes/admin-feature-flags.routes.ts` — `adminFeatureFlagsRouter` with `authenticate, authorize(UserRole.ADMIN)` middleware; `GET /` → list, `PATCH /:key` → update
- [x] T006 [US2] Mount router in `rcfeild-be/src/routes/index.ts` — add import and `router.use('/admin/feature-flags', adminFeatureFlagsRouter)` after line 110 (after `/admin/dashboard`)
- [x] T007 [P] [US2] Create `rcfield-fe/src/features/admin/api/admin-feature-flags.api.ts` — `listFlags()` → `GET /v1/admin/feature-flags`, `updateFlag(key, payload)` → `PATCH /v1/admin/feature-flags/:key`
- [x] T008 [US2] Update `rcfield-fe/src/pages/admin/AdminFeatureFlagsPage.tsx` — replace mock `useState(initialFlags)` with `useQuery` calling `adminFeatureFlagsApi.listFlags()`; wire "Lưu thay đổi" button to call `adminFeatureFlagsApi.updateFlag()` per changed flag; map `is_enabled` (API) → `status: 'READY' | 'DISABLED'` for existing UI
- [x] T009 [P] [US2] Add `AI_REVENUE_ANALYTICS` entry to `rcfield-fe/src/shared/data/admin-mock-data.ts` → `mockFeatureFlags` array (for dev without backend): `{ key: "AI_REVENUE_ANALYTICS", description: "Bảng phân tích doanh thu bằng AI Gemini trong Provider Dashboard", status: "DISABLED" }`

**Checkpoint**: Admin can toggle the flag via UI; DB row updates; flag state persists across page reload.

---

## Phase 4: User Story 1 — Provider Views AI Revenue Insights (Priority: P1) 🎯 MVP

**Goal**: Provider clicks "✨ Phân tích AI", receives a Vietnamese insight report within 15 seconds.

**Independent Test**: Enable flag via admin (T008), open Provider Dashboard, click "✨ Phân tích AI" with a date range that has completed bookings → panel displays summary + ≥3 insight cards + topOpportunity + 1–2 watchouts in Vietnamese.

### Implementation for User Story 1 — Backend

- [x] T010 [US1] Create `rcfeild-be/src/services/ai-revenue-analytics.service.ts` — implement in order:
  1. `checkAnalyticsGate(providerId)` — query `feature_flags WHERE feature_key='AI_REVENUE_ANALYTICS' AND entity_type='GLOBAL'`; admin bypass; return `{ monthlyQuota }`
  2. `checkAndLogAnalyticsQuota(providerId, monthlyQuota, from, to, cafeId)` — COUNT SUCCESS logs for current month; INSERT placeholder log row; return `logId`
  3. `fetchRevenueData(providerId, from, to, cafeId?)` — `Promise.all` across `getProviderKpi`, `getProviderRevenueTrend` (weekly), `getProviderRevenueBreakdown`, `getProviderBranchPerformance`, `getProviderTopStats`
  4. `computeDerivedMetrics(data)` — completion rate, revenue/booking, linear slope → trendDirection (rising/flat/falling), topSource
  5. `buildPrompt(data, metrics, from, to)` — Vietnamese RC Cafe context prompt; request JSON output `{ summary, insights[], topOpportunity, watchouts[] }`
  6. `generateAiInsights(providerId, from, to, cafeId?)` — orchestrate all above; call `ai.models.generateContent({ model: env.ai.supportModel, ... })`; `finally` block updates log with status/tokens/duration
- [x] T011 [US1] Create `rcfeild-be/src/controllers/ai-revenue-analytics.controller.ts` — `generateInsights` handler; zod validate `from`, `to` (date regex), optional `cafeId` (uuid); call `generateAiInsights`; return `{ type: 'SUCCESS'|'INSUFFICIENT_DATA', data }`
- [ ] T012 [US1] Add route to `rcfeild-be/src/routes/provider-subscription.routes.ts` — import `aiRevenueAnalyticsController`; add `providerSubscriptionRouter.post('/dashboard/ai-insights', requireActiveProvider, aiRevenueAnalyticsController.generateInsights)` after the `top-stats` route (line 85+)

### Implementation for User Story 1 — Frontend

- [ ] T013 [P] [US1] Add types to `rcfield-fe/src/features/dashboard/types/dashboard.types.ts` — `InsightSeverity`, `AiInsight`, `AiInsightResponse`, `AiInsightResult`
- [ ] T014 [P] [US1] Add `generateAiInsights(params)` to `rcfield-fe/src/features/dashboard/api/provider-dashboard.api.ts` — `POST /v1/provider/dashboard/ai-insights` with query params `from`, `to`, `cafeId`
- [ ] T015 [US1] Create `rcfield-fe/src/features/dashboard/components/AiInsightsPanel.tsx` — props: `{ from, to, cafeId?, isFeatureEnabled }`; states: Idle (show "✨ Phân tích AI" button), Loading (spinner + "Đang phân tích..."), InsufficientData (friendly message), Error 503 (retry prompt — no raw error), Success (summary paragraph + insight cards + topOpportunity box + watchouts list); on filter change after result → reset to Idle with "Phân tích lại" label; duplicate-click protection (disable button while loading)
- [ ] T016 [US1] Inject `<AiInsightsPanel>` into `rcfield-fe/src/pages/provider/ProviderDashboardPage.tsx` — import component; pass existing `from`, `to`, `selectedCafeId` state; render after existing charts section; hardcode `isFeatureEnabled={true}` for initial wiring (replace with real flag check in US2 integration)

**Checkpoint**: Full E2E happy path works — click button, Gemini responds, panel renders Vietnamese insights.

---

## Phase 5: User Story 3 — Trend-Specific Insight Cards (Priority: P2)

**Goal**: Each insight card clearly shows category type, severity color, and RC-field-specific actionable body text.

**Independent Test**: Run AI analysis on a period with declining revenue (3+ weeks of drop) → trend insight card has `severity: warning`; on period with utilization < 40% → fleet card appears with `critical` or `warning` severity. Cards are visually color-coded.

### Implementation for User Story 3

- [x] T017 [US3] Extend `buildPrompt()` in `rcfeild-be/src/services/ai-revenue-analytics.service.ts` — strengthen prompt to enforce insight `type` values (`trend`, `revenue_mix`, `fleet`, `retention`, `branch`) and `severity` rules matching spec acceptance scenarios (e.g., 3 weeks decline → `warning`, utilization < 40% → fleet insight, extension fees > 20% → revenue_mix insight, 1 customer > 30% revenue → retention warning)
- [x] T018 [P] [US3] Add severity color map to `rcfield-fe/src/features/dashboard/components/AiInsightsPanel.tsx` — `positive` → emerald, `neutral` → blue, `warning` → amber, `critical` → red; apply to insight card border + background + text
- [x] T019 [P] [US3] Add insight type badge to each card in `rcfield-fe/src/features/dashboard/components/AiInsightsPanel.tsx` — display `type` as a small label (e.g., "📈 Xu hướng", "🚗 Phương tiện", "👥 Khách hàng") using a type→label map

**Checkpoint**: Each insight card visually distinguishes severity; correct insight categories appear for known data patterns.

---

## Phase 6: User Story 4 — Monthly Quota Enforcement (Priority: P3)

**Goal**: Provider cannot exceed their monthly analysis quota; button shows reset date when exhausted.

**Independent Test**: Set `monthly_quota=1` via admin API; run 1 analysis (succeeds); run 2nd analysis → button disabled with label "Hết lượt — reset 01/08"; `ai_analysis_logs` has 1 SUCCESS + 1 QUOTA_EXCEEDED row.

### Implementation for User Story 4

- [x] T020 [US4] Add quota exhausted UI state to `rcfield-fe/src/features/dashboard/components/AiInsightsPanel.tsx` — catch 429 `AI_QUOTA_EXCEEDED` error response; show disabled button with label "Hết lượt — reset DD/MM" (derive reset date from 1st of next month); clear message explaining when quota resets
- [x] T021 [P] [US4] Add `monthly_quota` config display to `rcfield-fe/src/pages/admin/AdminFeatureFlagsPage.tsx` — when viewing `AI_REVENUE_ANALYTICS` flag row, show current `monthly_quota` from `config` and allow admin to edit and save via PATCH

**Checkpoint**: Quota exhaustion blocks button with clear reset date; admin can adjust quota; `monthly_quota=0` means unlimited (no blocking).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T022 [P] Validate `rcfield-fe/src/features/dashboard/components/AiInsightsPanel.tsx` handles all edge cases: flag disabled mid-session (503 → friendly error), Gemini JSON parse error (503 → retry prompt), `isFeatureEnabled=false` hides panel entirely
- [x] T023 Wire `isFeatureEnabled` in `rcfield-fe/src/pages/provider/ProviderDashboardPage.tsx` — replace hardcoded `true` with a query to `GET /v1/provider/dashboard/feature-flags`; hide panel entirely when flag is disabled
- [x] T024 [P] Update `website/sidebars-specs.ts` — confirm `ai-revenue-analytics/tasks` entry is present *(already done in plan phase)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US2 (Phase 3)**: Depends on Phase 2 (needs flag row in DB from T001)
- **US1 (Phase 4)**: Depends on Phase 2; can run in parallel with US2 (different files)
- **US3 (Phase 5)**: Depends on US1 (extends service prompt + panel UI)
- **US4 (Phase 6)**: Depends on US1 (extends panel UI) and US2 (admin can set monthly_quota)
- **Polish (Phase 7)**: Depends on all prior phases

### User Story Dependencies

- **US2 (P1)**: After Phase 2 — independent of US1 (backend + admin frontend only)
- **US1 (P1)**: After Phase 2 — independent of US2 (but needs flag enabled to test E2E)
- **US3 (P2)**: After US1 — extends existing service and panel (not independently buildable)
- **US4 (P3)**: After US1 + US2 — extends panel (quota UI) and admin page (quota config)

### Within Each Phase

- Backend tasks (T010–T012) must complete before E2E test of US1
- Frontend types (T013) and API method (T014) are independent of each other — both can run in parallel before T015
- T015 (AiInsightsPanel) depends on T013 + T014
- T016 (inject into DashboardPage) depends on T015

---

## Parallel Opportunities

### Phase 2 — Foundational
```
T001 (migration file) ── T003 (run migration) ──▶ unblock all stories
T002 (entity file)    ──▶ unblocks T010
```

### Phase 3 + Phase 4 — US2 and US1 can run in parallel (different files)
```
[Developer A — US2]          [Developer B — US1 backend]
T004 admin controller        T010 ai-analytics service
T005 admin router            T011 ai-analytics controller
T006 mount in index.ts       T012 add route to provider router

[Developer C — US1 frontend, after T013/T014 ready]
T013 [P] add types
T014 [P] add API method
T015 AiInsightsPanel component (after T013+T014)
T016 inject into DashboardPage (after T015)
```

### Phase 5 — US3
```
T017 strengthen prompt (backend)
T018 [P] severity colors (frontend)
T019 [P] type badges (frontend)
```

---

## Implementation Strategy

### MVP (US1 + US2 only)

1. Complete Phase 2: Foundational (T001–T003)
2. Complete Phase 3: US2 backend (T004–T006) → admin can toggle flag
3. Complete Phase 4: US1 (T010–T016) → provider can click and receive insights
4. **STOP and validate**: Run E2E happy path — enable flag, click button, see Vietnamese insights
5. Ship MVP

### Incremental Delivery

1. Phase 2 → DB ready
2. Phase 3 (US2) → Admin can control the feature
3. Phase 4 (US1) → Core provider experience works (MVP!)
4. Phase 5 (US3) → Insight cards are richer and color-coded
5. Phase 6 (US4) → Cost control via quota enforcement
6. Phase 7 → Polish and edge cases

---

## Notes

- No test tasks generated — project convention is manual E2E (no automated test suite)
- `env.ai.supportModel` (gemini-2.0-flash) must be set in backend `.env` — verify before T010
- `feature_flags` table already exists (used by AI chatbot); Phase 2 only adds the new row via migration seed
- Quota logic lives entirely in the service (`checkAndLogAnalyticsQuota`) — no separate quota endpoint needed
- `finally` block in `generateAiInsights` ensures log is always updated regardless of Gemini outcome
