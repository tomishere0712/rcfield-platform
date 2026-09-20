# Research: Booking Review & Rating

**Phase**: 0 — Resolve unknowns before design  
**Feature**: [spec.md](spec.md)

---

## Decision 1 — Rating aggregate storage

**Decision**: Compute on-the-fly from `reviews` table via SQL `AVG()` + `COUNT()` filtered by `status = 'VISIBLE'`. Aggregate reflects current state immediately — including after Provider hides/unhides a review.  
**Rationale**: Cafe typically has 50–500 reviews; an indexed aggregate query is sub-millisecond. No risk of stale cached values. Confirmed in clarification: aggregate must update immediately on hide/unhide, not via batch.  
**Alternatives considered**:  
- Materialized `rating_score` + `review_count` columns on `cafes` table — rejected; invalidation on hide/unhide adds complexity not justified for v1.  
- PostgreSQL materialized view — same trade-off; can migrate in v2 if perf degrades.  
**Index required**: `CREATE INDEX ON reviews(cafe_id, status)` to support the aggregate query efficiently.

---

## Decision 2 — Notification trigger point

**Decision**: Hook into `staff.service.ts` → at the point where `booking.status` transitions to `COMPLETED` (inside the checkout flow). Call `createNotification(customerId, 'BOOKING_REVIEW_REQUEST', ...)` and `wsService.pushToUser(customerId, 'BOOKING_REVIEW_REQUEST', ...)` immediately after.  
**Rationale**: The checkout service already fires email/invoice notifications at this exact point. Adding a review nudge here keeps the trigger co-located with other post-completion side effects.  
**Important**: Only send for bookings where `booking.source === BookingSource.APP` (i.e., customer-initiated). Skip `STAFF_MANUAL` bookings to avoid sending review requests for internal/walk-in test sessions.  
**Alternatives considered**:  
- Cron job polling for COMPLETED bookings without a review — rejected; harder to guarantee the "within 5 minutes" SLA and adds scheduler complexity.

---

## Decision 3 — Review period tracking (7-day deadline)

**Decision**: Add a `completed_at TIMESTAMPTZ NULL` column to the `bookings` table. Set it to `NOW()` when booking transitions to `COMPLETED`. The review service enforces the deadline by checking `booking.completed_at + 7 days > NOW()`.  
**Rationale**: Bookings do not currently record when they reached COMPLETED status. This column is generally useful (audit trail, reporting) and avoids fragile session-join queries.  
**Alternatives considered**:  
- Query session's `updated_at` when status became COMPLETED — brittle; session could be updated afterward.
- Store deadline in `notifications.metadata` — rejected; deadline logic belongs in the service, not notification metadata.

---

## Decision 4 — Review dismissal tracking

**Decision**: Add `review_dismissed_at TIMESTAMPTZ NULL` column to `bookings`. Set to `NOW()` on dismiss. Pending-review query filters `WHERE review_dismissed_at IS NULL`.  
**Rationale**: Simpler than a separate table — no extra entity, no FK join, dismiss check is a single NULL predicate. The bookings table already owns all per-booking state.  
**Alternatives considered**:  
- Separate `review_dismissals` table — cleaner schema separation but adds overhead (extra entity, extra join query) not justified for a nullable timestamp.
- Store dismissal in Redis — ephemeral, survives only until restart; rejected (must persist).

---

## Decision 5 — NotificationType extension

**Decision**: Add `BOOKING_REVIEW_REQUEST` as a string literal to the `NotificationType` union in `src/types/index.ts` (no migration needed).  
**Rationale**: The `notifications.type` column was already migrated to `VARCHAR(255)` (migration `1750900000000-MigrateNotificationTypeToVarchar`), so new types can be added as string constants without a DB enum migration.

---

## Decision 6 — Frontend reminder injection point

**Decision**:  
- `CustomerBookingsPage.tsx` — shows a `ReviewReminderBanner` at the top when there are pending reviews (most natural location: user sees their bookings).  
- `CustomerHomePage.tsx` — secondary floating card for customers who don't check the bookings tab.  
- Review submission: modal/dialog triggered from the banner (not a separate page), so the user stays in context.  
**Rationale**: The spec says "any page in app" for the reminder. A single persistent banner at top of customer-facing pages keeps implementation contained. Mounting it only in `CustomerBookingsPage` + `CustomerHomePage` covers 90% of sessions.  
**Alternatives considered**:  
- App-level banner in `App.tsx` or `CustomerPageShell.tsx` — polls on every page load; higher API call frequency and intrusive for users in the middle of other tasks.

---

## Decision 7 — Provider "hide review" vs "delete review"

**Decision**: `reviews.status` column with values `VISIBLE | HIDDEN`. `PATCH /provider/reviews/:id/visibility` toggles between the two. Hidden reviews are excluded from aggregate calculations but retained in the database.  
**Rationale**: Spec FR-010 explicitly says "không xóa vĩnh viễn" (no permanent delete). Hidden reviews preserve the audit trail for dispute resolution.

---

## Decision 8 — Review API authorization for public listing

**Decision**: `GET /api/v1/cafes/:cafeId/reviews` is **public** (no auth required). Mirrors the existing `GET /api/v1/cafes/:cafeId` which is already public.  
**Rationale**: Spec FR-008 says "không yêu cầu đăng nhập để xem". Consistent with existing cafe public detail endpoint.

---

## Decision 9 — BYOC vehicle criterion hiding

**Decision**: Backend always stores `vehicle_score = null` for BYOC bookings (service validates and forces null). Frontend also hides the vehicle criterion field based on `booking.play_mode === 'BYOC'`.  
**Rationale**: Double enforcement: backend guarantees data integrity; frontend hides the UI element to avoid confusion.

---

## Decision 10 — Customer name masking format

**Decision**: Display as **tên đệm + tên + chữ cái đầu họ + dấu chấm** — e.g. "Văn An N." Algorithm: `split(full_name, ' ')` → first token = họ, remaining = tên đệm + tên; render as `remaining.join(' ') + ' ' + họ[0] + '.'`  
**Rationale**: Confirmed in clarification. Balances privacy (hides full last name) with readability (retains middle + given name).  
**Edge case**: Single-token name (e.g. "An") → display as-is, no masking applied.

---

## Decision 11 — Double-submit (concurrent review submit)

**Decision**: Frontend disables submit button immediately on first click (loading state). The unique constraint on `reviews.booking_id` acts as a passive server-side safeguard if two requests somehow slip through.  
**Rationale**: Confirmed in clarification — client-side disable is the primary mechanism. No dedicated 409 error flow needed for this case beyond what the DB constraint naturally provides.

---

## Decision 12 — UX for expired review link

**Decision**: When customer opens a review link/modal after the 7-day window, display inline message "Thời hạn đánh giá đã hết (7 ngày)" instead of the form, with a back button. No auto-redirect.  
**Rationale**: Confirmed in clarification. Clearest UX — user immediately understands why no form appears without being sent to an unexpected page.
