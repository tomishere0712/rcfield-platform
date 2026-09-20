# Feature Specification: AI Revenue Analytics for Providers

**Feature Branch**: `main`
**Created**: 2026-07-05
**Status**: Draft
**Input**: AI-powered revenue analysis panel in Provider Dashboard — admin-managed feature flag, analyzes all revenue metrics using LLM and returns structured Vietnamese insights including trends, anomalies, opportunities, and actionable recommendations.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Provider views AI revenue insights (Priority: P1)

A provider opens their revenue dashboard and sees an "AI Phân Tích" panel. They click the button to generate an AI analysis of the current period's revenue data. Within seconds, they receive a Vietnamese-language summary covering overall revenue health, key highlights, warning signals, and one concrete recommended action.

**Why this priority**: Core value of the feature — this is the entire reason it exists. Without this story, nothing else matters.

**Independent Test**: Can be fully tested by enabling the flag for a provider and clicking the "Phân tích AI" button; the result delivers value even without any other story implemented.

**Acceptance Scenarios**:

1. **Given** a provider with `AI_REVENUE_ANALYTICS` flag enabled, **When** they open the dashboard and click "Phân tích AI", **Then** the panel loads within 15 seconds and displays a structured insight report in Vietnamese with at least: a summary paragraph, 3–5 insight cards, one top opportunity, and 1–2 watch-out warnings.
2. **Given** the analysis has completed, **When** the provider changes the date range or cafe filter, **Then** the AI panel resets to show a "Phân tích lại" prompt (not auto-re-run, to avoid unnecessary LLM calls).
3. **Given** the provider has no completed bookings in the selected period, **When** they request AI analysis, **Then** the system shows a friendly message explaining there is insufficient data to analyze, rather than a failed or empty response.
4. **Given** an analysis request is in progress, **When** the provider clicks the button again, **Then** the duplicate request is ignored and the current loading state is preserved.

---

### User Story 2 — Admin enables/disables AI analytics feature flag (Priority: P1)

An admin user opens the Feature Flags management page. They can see the `AI_REVENUE_ANALYTICS` flag listed, toggle it on or off globally (applying to all providers at once), and save the change. The change takes effect immediately without requiring a deployment.

**Why this priority**: Without this, the feature cannot be controlled per business/compliance needs. Parity with the existing chatbot feature flag pattern.

**Independent Test**: Admin toggles the flag on, then a provider loads their dashboard and sees the AI panel appear (or disappear when toggled off) — fully testable without any other story.

**Acceptance Scenarios**:

1. **Given** an admin is on the Feature Flags page, **When** they toggle `AI_REVENUE_ANALYTICS` to enabled and save, **Then** all provider dashboards immediately show the AI insights panel.
2. **Given** the flag is enabled globally, **When** the admin disables it and saves, **Then** the AI panel is hidden from all provider dashboards without any code deployment.
3. **Given** the admin saves a flag change, **When** they reload the Feature Flags page, **Then** the persisted state reflects their last action correctly.

---

### User Story 3 — Provider receives trend-specific insights (Priority: P2)

The AI analysis breaks down insights by category: revenue trend direction (growing/declining/stable), revenue mix health (which sources are dominant and whether that's a risk), fleet efficiency commentary, customer retention signals, and branch comparison (if multi-branch). Each insight card clearly states what the signal is, why it matters in the RC field business context, and what to do about it.

**Why this priority**: This is what makes the AI useful vs. a generic dashboard — context-aware, actionable interpretation of the numbers.

**Independent Test**: An insight card for "revenue trend" can be rendered and validated independently using any period's data.

**Acceptance Scenarios**:

1. **Given** the revenue trend data shows 3 consecutive weeks of decline, **When** AI analysis runs, **Then** the trend insight card has `severity: warning` and suggests at least one corrective action specific to RC field operations (e.g., adjust pricing, open new slots).
2. **Given** extension fees represent more than 20% of counter-bill revenue, **When** AI analysis runs, **Then** the insight mentions this as a signal that customers want more time and suggests offering longer default slots.
3. **Given** vehicle utilization rate is below 40%, **When** AI analysis runs, **Then** the fleet insight flags this as over-capacity and recommends a review of fleet size or pricing strategy.
4. **Given** one customer accounts for more than 30% of total revenue, **When** AI analysis runs, **Then** the customer insight flags customer concentration risk.

---

### User Story 4 — AI analysis respects monthly usage quota (Priority: P3)

Each provider is subject to a configurable monthly quota for AI analysis requests (set by admin in the feature flag config). When a provider has exhausted their quota for the current month, the button is disabled and a clear message explains when the quota resets. Admins can adjust the quota per provider.

**Why this priority**: Cost control for LLM API usage. Lower priority than core functionality but necessary for production sustainability.

**Independent Test**: Set quota to 1, run analysis once (success), run again (blocked with quota message) — independently testable.

**Acceptance Scenarios**:

1. **Given** a provider has used their monthly quota, **When** they view the dashboard, **Then** the "Phân tích AI" button is disabled with a label showing the reset date (e.g., "Hết lượt — reset 01/08").
2. **Given** admin sets a provider's monthly quota to 0 (unlimited), **When** that provider runs analyses, **Then** they are never blocked by quota.
3. **Given** the 1st day of a new month, **When** a provider who was quota-exhausted opens the dashboard, **Then** their quota is reset and the button is re-enabled.

---

### Edge Cases

- What happens when the LLM API (Gemini) times out or returns an error? → Show a user-friendly retry message; do not count against quota if the LLM failed.
- What happens when all revenue values are zero for the period? → Return a "insufficient data" message, not an AI analysis with meaningless zeros.
- What happens if the provider has only 1 booking in the period? → AI should still respond but qualify its insights as based on limited data.
- What if the feature flag is disabled while an in-progress analysis is loading? → The response is returned if already in-flight; the flag check applies to new requests only.
- What happens with very large date ranges (e.g., 12 months of data)? → The system aggregates data normally; the AI prompt receives summarized totals, not raw row-level data.

---

## Requirements *(mandatory)*

### Functional Requirements

**Feature Flag Management**

- **FR-001**: Admin MUST be able to enable or disable `AI_REVENUE_ANALYTICS` globally via the admin Feature Flags page, with the change persisted to the database immediately.
- **FR-002**: The system MUST expose backend API endpoints for reading and updating feature flag state (currently the admin UI has no backend API for this).
- **FR-003**: The feature flag MUST support a `monthly_quota` config value (integer) per flag record; `0` means unlimited.
- **FR-004**: The system MUST track the number of AI analysis requests made per provider per calendar month and enforce the monthly quota.

**AI Analysis Endpoint**

- **FR-005**: The system MUST expose a single endpoint that accepts `from`, `to`, and optional `cafeId` parameters, checks the feature flag, fetches all 6 revenue data sources in parallel, and returns a structured AI insight response.
- **FR-006**: The system MUST compute the following derived metrics before passing data to the AI: revenue per booking, booking completion rate, implied retention proxy, top revenue source by share, revenue trend direction (rising/falling/flat based on linear slope), and period-over-period delta if sufficient data points exist.
- **FR-007**: The AI MUST respond in Vietnamese, structured as: `summary` (2–3 sentence overview), `insights[]` (each with `type`, `title`, `body`, `severity`), `topOpportunity` (single most impactful recommendation), and `watchouts[]` (1–2 warning signals).
- **FR-008**: If the LLM call fails or times out, the system MUST return an error response without counting the attempt against the provider's quota.
- **FR-009**: If the selected period contains no completed bookings, the system MUST return a structured "insufficient data" response without calling the LLM.
- **FR-010**: The system MUST log each AI analysis request (provider, timestamp, period requested, token usage if available) for cost monitoring.

**Provider Dashboard UI**

- **FR-011**: The provider dashboard MUST display an "AI Phân Tích" panel that is visible only when `AI_REVENUE_ANALYTICS` is enabled for that provider.
- **FR-012**: The panel MUST show a trigger button ("✨ Phân tích AI") and only call the analysis endpoint when the provider explicitly clicks it — no auto-run on page load.
- **FR-013**: When quota is exhausted, the button MUST be disabled and display the quota reset date.
- **FR-014**: Each insight card MUST visually distinguish severity levels: `positive` (green), `neutral` (blue/gray), `warning` (amber), `critical` (red).
- **FR-015**: When the date range or cafe filter changes after an analysis has been shown, the panel MUST reset to the pre-analysis state with a "Phân tích lại" prompt.

### Key Entities

- **FeatureFlag** (existing, extended): `feature_key = 'AI_REVENUE_ANALYTICS'`, `entity_type = 'GLOBAL'`, `config: { monthly_quota: number, used_this_month: number, quota_reset_day: number }` — global flag controlling feature visibility.
- **AiAnalysisLog** (new): Records each analysis request — `provider_id`, `cafe_id`, `period_from`, `period_to`, `requested_at`, `tokens_used`, `duration_ms`, `status` (`SUCCESS | FAILED | QUOTA_EXCEEDED | INSUFFICIENT_DATA`).
- **RevenueInsightResponse** (API response shape, not persisted): `{ period, summary, insights[], topOpportunity, watchouts[], generatedAt }` — ephemeral, returned per-request only.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A provider can receive a complete AI revenue analysis within 15 seconds of clicking the button on a standard internet connection.
- **SC-002**: The admin can toggle the `AI_REVENUE_ANALYTICS` flag and the change is reflected on provider dashboards within 30 seconds (no deployment required).
- **SC-003**: 100% of AI insight responses are in Vietnamese and contain at minimum: 1 summary, 3 insights, 1 top opportunity, 1 watchout — or a clear "insufficient data" explanation.
- **SC-004**: Monthly quota enforcement prevents any provider from exceeding their configured request limit; over-limit requests receive a clear block message, not a silent failure.
- **SC-005**: All LLM API failures surface as user-friendly retry prompts — zero instances of raw error messages shown to providers.
- **SC-006**: The AI analysis log captures 100% of requests with status and duration, enabling cost review without accessing LLM provider dashboards directly.

---

## Assumptions

- The feature uses the existing Google Gemini integration already in the backend (`gemini-2.0-flash` for cost efficiency; analysis does not require the highest-tier model).
- The AI prompt is designed around the RC field business domain — Gemini receives business context about RC racing cafes in Vietnam, not generic analytics instructions.
- Revenue data passed to the AI is aggregated (summary totals and time-series), not raw transaction rows — keeping prompt size manageable and avoiding PII exposure (no customer names or emails in the prompt).
- The feature flag is global by default (not per-cafe or per-provider) for the initial release; per-provider granularity can be added in a future iteration.
- Admin API for feature flags (currently missing backend endpoints) will be implemented as part of this feature since the AI flag requires it to be fully functional.
- Monthly quota tracking reuses the existing `feature_flags.config` JSONB field (`used_this_month`, `quota_reset_day`) — same pattern as the AI chatbot quota.
- The `AiAnalysisLog` table is new and requires a database migration.
- The provider must have at least 1 completed booking in the selected period for analysis to proceed; the threshold is not configurable in v1.
- Analysis results are not cached or stored — each button click triggers a fresh LLM call. Caching can be added in a future iteration if quota/cost becomes an issue.
- The feature is unavailable to providers on inactive or suspended subscriptions (enforced by existing `requireActiveProvider` middleware).
