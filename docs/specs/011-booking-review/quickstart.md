# Quickstart & E2E Scenarios: Booking Review & Rating

**Feature**: [spec.md](spec.md)

---

## Implementation Order

1. **Migration** — `1752100000000-AddReviewTables.ts` (reviews, review_dismissals, bookings.completed_at)
2. **Types** — add `ReviewStatus`, `BOOKING_REVIEW_REQUEST` to `src/types/index.ts`
3. **Entities** — `review.entity.ts`, `review-dismissal.entity.ts`
4. **Validate** — Zod schemas in `src/validate/index.ts`
5. **Service** — `review.service.ts` (submit, dismiss, pending, list, aggregate, provider visibility)
6. **Notification hook** — modify `staff.service.ts` checkout flow → fire `BOOKING_REVIEW_REQUEST` noti
7. **Controllers + Routes** — wire service to HTTP, register in `src/routes/index.ts`
8. **Frontend: API layer** — `src/features/booking-review/api/review.api.ts`
9. **Frontend: Review form** — `src/features/booking-review/components/ReviewFormModal.tsx`
10. **Frontend: Reminder banner** — `src/features/booking-review/components/ReviewReminderBanner.tsx`
11. **Frontend: Inject into pages** — `CustomerBookingsPage`, `CustomerHomePage`, `CafeDetailPage`, `ProviderCafeDetailPage`

---

## E2E Scenario 1 — Happy path: customer submits 5-star review

```
Precondition: booking B1 has status=COMPLETED (completed_at = now)

1. Customer opens app
2. GET /customer/reviews/pending → returns B1
3. ReviewReminderBanner shows with "Đánh giá ngay" button
4. Customer opens ReviewFormModal
5. Selects 5 stars overall, 4 staff, 5 facility, types "Rất tuyệt!"
6. POST /customer/reviews { booking_id: B1, overall_score: 5, staff_score: 4, facility_score: 5, note: "..." }
7. Server: validates booking owner, checks completed_at within 7 days, inserts review
8. Response 201 with review data
9. GET /cafes/:cafeId/reviews now returns this review in list, aggregate updates

Assertions:
- review.status = 'VISIBLE'
- cafe aggregate increments review_count by 1
- GET /customer/reviews/pending no longer includes B1
```

---

## E2E Scenario 2 — BYOC booking hides vehicle criterion

```
Precondition: booking B2 has play_mode=BYOC, status=COMPLETED

1. GET /customer/reviews/pending → returns B2 with play_mode=BYOC
2. ReviewFormModal renders without "Chất lượng xe" criterion
3. POST /customer/reviews { booking_id: B2, overall_score: 4, vehicle_score: 4 }  ← intentional invalid
4. Server: forces vehicle_score = null because play_mode=BYOC
5. Response 201: review.vehicle_score = null

Assertions:
- Stored review has vehicle_score = null
- Public listing for this review has no vehicle score displayed
```

---

## E2E Scenario 3 — Review dismissed, no more reminders

```
Precondition: booking B3 COMPLETED, no review, no dismissal

1. GET /customer/reviews/pending → returns B3
2. Customer clicks "Bỏ qua"
3. POST /customer/reviews/B3/dismiss
4. review_dismissals row created for B3
5. GET /customer/reviews/pending → B3 no longer in list
6. Subsequent logins: B3 never reappears

Assertions:
- review_dismissals has row for booking_id=B3
- pending list excludes dismissed bookings
```

---

## E2E Scenario 4 — 7-day deadline expired

```
Precondition: booking B4 COMPLETED, completed_at = 8 days ago

1. GET /customer/reviews/pending → B4 not returned (expired)
2. POST /customer/reviews { booking_id: B4, overall_score: 5 }
3. Server: completed_at + 7 days < now → reject
4. Response 400 { code: "REVIEW_PERIOD_EXPIRED" }
```

---

## E2E Scenario 5 — Provider hides a review

```
Precondition: review R1 is VISIBLE, associated with provider's cafe

1. Provider sees R1 in dashboard
2. PATCH /provider/reviews/R1/visibility { status: "HIDDEN" }
3. Response 200: review.status = "HIDDEN"
4. GET /cafes/:cafeId/reviews → R1 absent from list
5. Cafe aggregate recomputes without R1 → overall_avg changes
6. PATCH /provider/reviews/R1/visibility { status: "VISIBLE" } → reverses the hide

Assertions:
- HIDDEN reviews excluded from aggregate
- Provider can still see HIDDEN reviews in their own dashboard (status filter)
```

---

## E2E Scenario 6 — Duplicate submit blocked

```
Precondition: booking B5 already has a review

1. POST /customer/reviews { booking_id: B5, overall_score: 3 }
2. Server: finds existing review for B5
3. Response 409 { code: "ALREADY_REVIEWED" }
```

---

## Unit Test Checklist

- [ ] `reviewService.createReview`: valid submission creates row
- [ ] `reviewService.createReview`: rejects when booking not owned by customer
- [ ] `reviewService.createReview`: rejects when booking not COMPLETED
- [ ] `reviewService.createReview`: rejects when completed_at > 7 days ago
- [ ] `reviewService.createReview`: rejects duplicate (ALREADY_REVIEWED)
- [ ] `reviewService.createReview`: forces vehicle_score = null for BYOC
- [ ] `reviewService.getCafeAggregate`: returns correct AVG rounded to 1 decimal
- [ ] `reviewService.getCafeAggregate`: excludes HIDDEN reviews
- [ ] `reviewService.getCafeAggregate`: returns null fields when no reviews exist
- [ ] `reviewService.getCafeAggregate`: reflects hide/unhide immediately (no stale cache)
- [ ] `reviewService.getPendingReviews`: excludes bookings with review_dismissed_at IS NOT NULL
- [ ] `reviewService.getPendingReviews`: excludes expired bookings (> 7 days)
- [ ] `reviewService.setVisibility`: throws NOT_FOUND when review not in provider scope
- [ ] Name masking: `maskName('Nguyễn Văn An')` → `'Văn An N.'`
- [ ] Name masking: `maskName('An')` → `'An'` (single token, no masking)
- [ ] Frontend: submit button disabled on first click (loading state prevents double-submit)
- [ ] Frontend: expired review link shows inline message, not form, has back button
