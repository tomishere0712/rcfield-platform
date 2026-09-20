# Sequence Flow: Contest Vehicle Operations

**Last updated:** 2026-06-27  
**Status:** Active for current contest vehicle flow  
**Related docs:** `docs/spec/03-contest.md`, `docs/spec/business-rules/BR-contest.md`, `docs/spec/05-api-contracts.md`, `docs/spec/06-database.md`

Tai lieu nay bo sung sequence flow cho 2 luong chinh cua contest phase hien tai:

1. Rental contest link sang Booking/Session
2. BYOC contest registration review

No cung mo ta check-in, match operations, result correction va leaderboard guard.

---

## 1. Rental registration linked booking

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as Screen<br/>(PublicContestDetailPage)
    participant BAPI as API<br/>(Express / BookingController)
    participant BS as BookingService<br/>(booking.service.ts)
    participant CAPI as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest/registrations.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    C->>FE: Chon contest RENTAL_ONLY hoac MIXED + RENTAL
    FE->>BAPI: POST /api/v1/bookings
    BAPI->>BS: createBooking()
    BS->>DB: Validate slot / vehicle / payment
    BS->>DB: Save booking + booking_vehicles
    BAPI-->>FE: Booking CONFIRMED

    C->>FE: Dang ky contest voi booking_id + vehicle_id
    FE->>CAPI: POST /api/v1/contests/:id/register
    CAPI->>CS: registerForContest(customerId, payload)
    CS->>DB: Load contest
    CS->>DB: Validate vehicle_policy
    CS->>DB: Load booking by booking_id + customer_id
    CS->>DB: Validate booking CONFIRMED
    CS->>DB: Validate booking cafe in contest_cafes
    CS->>DB: Validate booking track_type = contest.track_type_id
    CS->>DB: Validate booking time covers contest window
    CS->>DB: Validate vehicle_id belongs to booking
    CS->>DB: Validate vehicle not already active in same contest
    CS->>DB: INSERT contest_registrations(status=PENDING, booking_id, vehicle_id)
    CS->>Audit: registration.created
    CAPI-->>FE: Registration PENDING
```

---

## 2. BYOC registration review

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as Screen<br/>(PublicContestDetailPage)
    participant CAPI as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest/registrations.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Staff as Screen<br/>(ProviderContestWorkspacePage)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    C->>FE: Tao hoac chon customer vehicle
    FE->>CAPI: POST /api/v1/me/customer-vehicles
    CAPI->>CS: createCustomerVehicle()
    CS->>DB: INSERT customer_vehicles(customer_id,...)
    CAPI-->>FE: customer_vehicle_id

    C->>FE: Dang ky contest bang BYOC
    FE->>CAPI: POST /api/v1/contests/:id/register
    CAPI->>CS: registerForContest()
    CS->>DB: Load contest + validate vehicle_policy
    CS->>DB: Load customer_vehicle by customer_id
    CS->>DB: Validate vehicle not already active in same contest
    CS->>DB: INSERT contest_registrations(status=PENDING, customer_vehicle_id)
    CS->>Audit: registration.created
    CAPI-->>FE: Registration PENDING

    Staff->>CAPI: POST /api/v1/contest-registrations/:id/approve
    CAPI->>CS: approveRegistration()
    CS->>DB: Validate Provider owner hoac Staff assigned
    CS->>DB: UPDATE contest_registrations -> CONFIRMED
    CS->>Audit: registration.approved
    CAPI-->>Staff: Registration CONFIRMED
```

---

## 3. BYOC rejected and redirected to rental

```mermaid
sequenceDiagram
    autonumber
    participant Staff as Screen<br/>(ProviderContestWorkspacePage)
    participant CAPI as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest/registrations.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant FE as Screen<br/>(PublicContestDetailPage)
    actor C as Customer
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    Staff->>CAPI: POST /api/v1/contest-registrations/:id/reject { reason }
    CAPI->>CS: rejectRegistration()
    CS->>DB: Validate operator permission
    CS->>DB: UPDATE contest_registrations -> CANCELLED
    CS->>Audit: registration.rejected
    CAPI-->>FE: registration cancelled + rejection_reason

    FE-->>C: Hien ly do reject
    alt Contest vehicle_policy = MIXED
        FE-->>C: Goi y dang ky lai bang rental flow
    else BYOC_ONLY
        FE-->>C: Chi hien ly do reject
    end
```

---

## 4. Contest check-in

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Staff
    participant FE as Screen<br/>(StaffContestCheckInPage)
    participant CAPI as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest/registrations.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    O->>FE: Nhap check_in_code
    FE->>CAPI: GET /api/v1/contests/:id/registrations/lookup
    CAPI->>CS: lookupRegistration()
    CS->>DB: Load registration
    CAPI-->>FE: Registration summary

    O->>FE: Xac nhan cafe check-in
    FE->>CAPI: POST /api/v1/contest-registrations/:id/check-in
    CAPI->>CS: checkInRegistration()
    CS->>DB: Validate registration CONFIRMED
    CS->>DB: Validate cafe in contest_cafes
    alt Actor = STAFF
        CS->>DB: Validate staff_cafe_assignments includes cafe_id
    end
    CS->>DB: UPDATE registration CHECKED_IN + checked_in_cafe_id
    CS->>Audit: registration.checked_in
    CAPI-->>FE: CHECKED_IN
```

---

## 5. Generate matches and bye round auto-advance

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant FE as Screen<br/>(ProviderContestWorkspacePage)
    participant CAPI as API<br/>(Express / ContestController)
    participant Runtime as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    P->>FE: Chon registrations + cafe + track config
    FE->>CAPI: POST /api/v1/contests/:id/matches/generate
    CAPI->>Runtime: generateMatches()
    Runtime->>DB: Validate contest state
    Runtime->>DB: Validate registrations CONFIRMED/CHECKED_IN
    Runtime->>DB: INSERT contest_matches(cafe_id, track_config_id)
    Runtime->>DB: INSERT contest_match_participants
    Runtime->>DB: Scan bye matches
    opt Match chi co 1 participant
        CAPI->>DB: Auto mark source match COMPLETED
        CAPI->>DB: Auto advance participant sang next_match_id
    end
    Runtime->>Audit: match.schedule_generated
    CAPI-->>FE: Match list
```

---

## 6. Submit result and advance

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Staff
    participant FE as Screen<br/>(ContestMatchDetailPanel)
    participant CAPI as API<br/>(Express / ContestController)
    participant Runtime as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    O->>FE: Nhap ket qua
    FE->>CAPI: POST /api/v1/contest-matches/:id/results
    CAPI->>Runtime: submitResults()
    Runtime->>DB: Load match + participants
    alt Actor = STAFF
        CAPI->>DB: Validate staff assigned to contest_matches.cafe_id
    end
    CAPI->>DB: Update participant result fields
    CAPI->>DB: Update match status COMPLETED
    Runtime->>Audit: match.result_submitted
    CAPI-->>FE: Match completed

    opt Co next_match_id
        FE->>CAPI: POST /api/v1/contest-matches/:id/advance
        CAPI->>Runtime: advanceWinner()
        Runtime->>DB: Insert advancing participants to next match
        Runtime->>Audit: match.advanced
        CAPI-->>FE: Next match updated
    end
```

---

## 7. Result correction with cascade guard

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Staff
    participant FE as Screen<br/>(ContestMatchDetailPanel)
    participant CAPI as API<br/>(Express / ContestController)
    participant Runtime as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    O->>FE: Mo correction dialog
    FE->>CAPI: POST /api/v1/contest-matches/:id/results/correct
    CAPI->>Runtime: correctResults()
    Runtime->>DB: Load match + descendants
    alt Actor = STAFF
        CAPI->>DB: Validate staff assigned to match cafe
        CAPI->>DB: Check downstream not COMPLETED
    else Actor = PROVIDER
        opt force_cascade = true
            CAPI->>DB: Invalidate descendants and re-seed winner flow
        end
    end
    CAPI->>DB: Rewrite participant results
    CAPI->>DB: Update match/result summary
    Runtime->>Audit: match.result_corrected
    CAPI-->>FE: Corrected match
```

---

## 8. Publish leaderboard guard

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant FE as Screen<br/>(ContestLeaderboardPanel)
    participant CAPI as API<br/>(Express / ContestController)
    participant Runtime as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    P->>FE: Publish leaderboard
    FE->>CAPI: POST /api/v1/contests/:id/leaderboard/publish
    CAPI->>Runtime: publishLeaderboard()
    Runtime->>DB: Count contest_matches with status not in (COMPLETED, CANCELLED)
    alt Van con unfinished matches
        CAPI-->>FE: 409 CONTEST_LEADERBOARD_MATCHES_UNFINISHED
    else All terminal
        Runtime->>DB: Build standings from final completed matches
        Runtime->>DB: Save leaderboard snapshot to contests.config
        Runtime->>Audit: leaderboard.published
        CAPI-->>FE: Standings published
    end
```

---

## 9. Operational Notes

- Rental contest khong duoc duplicate payment/inspection logic.
- BYOC approval la theo registration cua contest, khong la global car approval.
- Staff permission cho check-in va match ops phai localize theo cafe.
- Correction phai de lai audit trail day du.
- Metrics va audit logs la phan bat buoc de theo doi event day operations.

---

## 10. Class Diagram: Contest Vehicle Operations

```mermaid
classDiagram
    class PublicContestDetailPage {
        +registerRental()
        +registerByoc()
        +showMyRegistration()
    }
    class StaffContestCheckInPage {
        +lookupCode()
        +checkInRegistration()
    }
    class ProviderContestWorkspacePage {
        +approveRegistration()
        +generateMatches()
        +publishLeaderboard()
    }
    class ContestMatchDetailPanel {
        +submitResults()
        +correctResults()
        +advanceWinner()
    }
    class BookingController {
        +create()
    }
    class ContestController {
        +register()
        +approveRegistration()
        +checkInRegistration()
        +generateMatches()
        +submitResults()
        +publishLeaderboard()
    }
    class BookingService
    class ContestRegistrationService {
        +registerForContest()
        +approveRegistration()
        +rejectRegistration()
        +checkInRegistration()
    }
    class ContestRuntimeService {
        +generateMatches()
        +submitResults()
        +correctResults()
        +publishLeaderboard()
    }
    class Contest
    class ContestCafe
    class ContestRegistration
    class ContestMatch
    class ContestMatchParticipant
    class ContestAuditLog
    class Booking
    class BookingVehicle
    class CustomerVehicle

    PublicContestDetailPage --> BookingController
    PublicContestDetailPage --> ContestController
    StaffContestCheckInPage --> ContestController
    ProviderContestWorkspacePage --> ContestController
    ContestMatchDetailPanel --> ContestController
    BookingController --> BookingService
    ContestController --> ContestRegistrationService
    ContestController --> ContestRuntimeService
    Contest "1" --> "*" ContestCafe
    Contest "1" --> "*" ContestRegistration
    Contest "1" --> "*" ContestMatch
    ContestMatch "1" --> "*" ContestMatchParticipant
    ContestRegistration "*" --> "0..1" Booking
    Booking "1" --> "*" BookingVehicle
    ContestRegistration "*" --> "0..1" CustomerVehicle
    Contest "1" --> "*" ContestAuditLog
```
