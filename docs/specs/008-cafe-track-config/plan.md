# Implementation Plan: Cafe Track Config

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-06-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/008-cafe-track-config/spec.md`

## Summary

Introduce per-track BYOC capacity configuration (`cafe_track_configs` table), replacing the single `cafe.byoc_capacity` field. Provider manages track types per branch — config creation and image upload are two separate steps; configs without images are hidden from customers. Provider can toggle active/inactive (deactivation guarded by upcoming bookings, reactivation always free). Booking flow adds a mandatory track selection step before BYOC/RENTAL choice, with vehicle-to-track compatibility validation. Multi-slot booking uses a click-slot + duration stepper (1–8 giờ). Data migration backfills `track_config_id` on existing bookings (pre-production, no live data concern).

## Technical Context

**Language/Version**: Node.js 20+, TypeScript strict mode  
**Primary Dependencies**: Express.js, TypeORM, zod, Cloudinary (image upload), Redis (slot locks), multer  
**Storage**: PostgreSQL (primary), Redis (lock TTL), Cloudinary (track images)  
**Testing**: Jest (unit), Supertest (integration)  
**Target Platform**: Linux server (same as existing backend)  
**Project Type**: Web service — REST API backend + ReactJS frontend  
**Performance Goals**: Availability check < 200ms p95; track config list < 100ms  
**Constraints**: Backward compatible — `track_type_id` on `bookings` stays; `cafe.byoc_capacity` deprecated but kept  
**Scale/Scope**: Single provider (chain), ~10 cafes, ~5 track types per cafe

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Snapshot-First Pricing | ✅ PASS | Booking snapshot must include `track_config_id`, `track_type_id`, and `byoc_capacity` snapshot value. Capacity at booking time is captured, not re-read from live config. |
| II. State Machine Gate | ✅ PASS | No new booking state transitions. Existing PENDING→CONFIRMED flow unchanged. |
| III. Evidence-Based Handover | ✅ PASS | Track config feature does not touch inspection flow. |
| IV. Payment Component Isolation | ✅ PASS | Track config affects capacity, not payment components. No new component types needed. |
| V. Test-First for Financial & State Logic | ✅ PASS | Capacity check and vehicle compatibility validation are not financial rules — unit tests recommended but not constitution-mandatory. |
| VI. RBAC Enforcement | ✅ PASS | Provider manages configs (authenticated + `authorize(PROVIDER)`); Customer reads configs (public); booking creation requires CUSTOMER auth with track_config_id validation. |

**Post-design re-check**: No violations. Snapshot field additions are additive and backward-compatible.

## Project Structure

### Documentation (this feature)

```text
specs/008-cafe-track-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
rcfeild-be/src/
├── models/
│   └── cafe-track-config.entity.ts          # NEW — CafeTrackConfig entity
├── controllers/
│   └── cafe-track-config.controller.ts      # NEW — CRUD + image upload handlers
├── services/
│   └── cafe-track-config.service.ts         # NEW — business logic
├── routes/
│   └── cafe.routes.ts                       # MODIFY — mount /track-configs sub-router
├── validate/
│   └── index.ts                             # MODIFY — add CafeTrackConfig schemas
├── types/
│   └── index.ts                             # NO CHANGE (no new enums needed)
├── controllers/
│   └── cafe.controller.ts                   # MODIFY — availability check uses per-track capacity
└── migrations/
    └── YYYYMMDD-cafe-track-configs.ts       # NEW — create cafe_track_configs, alter bookings

rcfield-fe/src/
├── pages/
│   ├── booking/components/checkout/
│   │   ├── TrackSelectionStep.tsx           # NEW — Step 0 in booking flow
│   │   └── CheckoutFlow.tsx (or parent)     # MODIFY — add track step, multi-slot selection
│   └── customer/cafe-detail/
│       └── components/TrackConfigList.tsx   # NEW — display track configs on branch page
└── pages/
    └── provider/cafe-management/
        └── components/TrackConfigManager.tsx # NEW — provider CRUD UI for track configs
```

**Structure Decision**: Extends existing router-per-domain backend architecture. Track config endpoints mount under `/:cafeId/track-configs` in `cafe.routes.ts`. Frontend adds new step component to existing booking checkout flow.
