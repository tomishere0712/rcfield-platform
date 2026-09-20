# Implementation Plan: Booking & Payment Flow

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

## Summary

Build the core booking + VNPay payment flow: customer creates booking (RENTAL/BYOC), slot is locked via Redis, system generates VNPay payment URL, IPN/return URL confirms booking → CONFIRMED, payment components (SLOT_FEE, RENTAL_FEE, SECURITY_DEPOSIT, FNB_PREORDER) transition to HELD. Includes booking timeout job (auto-cancel PENDING after 30 min) and customer cancellation with 3-tier refund policy (R1). Provider/Staff can view bookings by cafe and date.

Frontend booking UI (`CreateBookingPage`, `BookingDetailPage`, `PaymentResultPage`) already exists using mock data — primary frontend work is wiring to real API endpoints.

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict mode  
**Primary Dependencies**: Express.js, TypeORM (PostgreSQL), ioredis (Redis slot locking), node-cron (timeout job), `vnpay.service.ts` (exists — createPaymentUrl, verifyVnpayParams)  
**Storage**: PostgreSQL (7 new entities), Redis (slot locks, TTL 1800s)  
**Testing**: Jest + supertest  
**Target Platform**: Linux server (Express REST API + ReactJS frontend)  
**Project Type**: Web service  
**Performance Goals**: <5min full checkout (SC-001), <10s payment confirmation (SC-004), <1min auto-cancel after timeout (SC-005)  
**Constraints**: 50 concurrent checkouts without slot conflicts (SC-003) — requires atomic Redis locking  
**Scale/Scope**: Phase 1 — booking creation + VNPay payment + cancellation + provider visibility

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Snapshot-First Pricing | ✅ PASS | `booking.snapshot` jsonb written at CONFIRMED, immutable thereafter |
| II. State Machine Gate | ✅ PASS | `BookingService.transition(bookingId, event)` — sole path for all status changes |
| III. Evidence-Based Handover | N/A | Check-in/out is Phase 2 scope |
| IV. Payment Component Isolation | ✅ PASS | `payment_components` immutable ledger — amount never updated, new row per adjustment |
| V. Test-First for Financial Logic | ✅ REQUIRED | Unit tests for R1 (3-window refund), R2 (provider cancel), R3 (timeout) and `canTransition()` MUST be written first |
| VI. RBAC Enforcement | ✅ PASS | `authenticate` + `authorize(...)` at router level, not inside handlers |

**Note on platform_fee_pct**: Constitution Principle IV references `platform_fee_pct = 0.15` in booking snapshot. Per product owner clarification (2026-06-08), revenue model is SaaS subscription — no % commission per booking. `platform_fee_pct` stored in snapshot as `0` for Phase 1. Settlement step (Phase 2) will not compute platform fee either.

## Project Structure

### Documentation (this feature)

```text
specs/007-booking-payment/
├── plan.md              ← This file
├── research.md          ← Phase 0: 6 key technical decisions
├── data-model.md        ← Phase 1: 7 new entities + enums
├── quickstart.md        ← Phase 1: E2E test scenarios
├── contracts/
│   └── api.md           ← Phase 1: 9 endpoints
└── tasks.md             ← /speckit-tasks output
```

### Source Code

**Backend** (`rcfeild-be/src/`):

```text
models/
├── booking.entity.ts                [NEW]
├── booking-participant.entity.ts    [NEW]
├── booking-vehicle.entity.ts        [NEW]
├── payment-component.entity.ts      [NEW]
├── payment-transaction.entity.ts    [NEW]
├── fnb-order.entity.ts              [NEW]
└── fnb-order-item.entity.ts         [NEW]

services/
├── booking.service.ts               [NEW] — transition(), createBooking(), cancelBooking()
└── payment.service.ts               [NEW] — createComponents(), processConfirmation(), processRefund()

controllers/
├── booking.controller.ts            [NEW]
└── vnpay.controller.ts              [UPDATE] — wire IPN/return to booking confirmation

routes/
├── booking.routes.ts                [NEW] — /api/v1/bookings (CUSTOMER)
└── provider-subscription.routes.ts  [UPDATE] — add provider booking list route

jobs/
└── booking-timeout.job.ts           [NEW] — auto-cancel PENDING after 30 min

migrations/
└── {timestamp}-BookingPayment.ts    [NEW] — 7 tables

validate/
└── booking.validate.ts              [NEW] — Zod schemas

__tests__/
├── services/booking.service.test.ts [NEW] — state machine + refund rules (TDD first)
└── services/payment.service.test.ts [NEW] — R1/R2/R3 refund calculations (TDD first)
```

**Frontend** (`rcfield-fe/src/`):

```text
features/booking/
├── api/booking.api.ts               [NEW] — API calls
├── hooks/use-booking.ts             [NEW] — React Query hooks
└── types/booking.types.ts           [NEW] — TypeScript types

pages/booking/
├── CreateBookingPage.tsx            [UPDATE] — wire to real API (remove mock data)
├── BookingDetailPage.tsx            [UPDATE] — wire to real API + payment initiation
└── PaymentResultPage.tsx            [UPDATE] — wire to real booking confirmation

pages/customer/
└── CustomerBookingsPage.tsx         [UPDATE] — wire to real API

pages/provider/
└── ProviderBookingsPage.tsx         [NEW] — provider booking list by cafe+date
```

## Complexity Tracking

No constitution violations requiring justification.
