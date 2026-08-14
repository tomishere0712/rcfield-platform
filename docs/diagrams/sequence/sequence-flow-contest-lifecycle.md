# Sequence Flow: Contest Lifecycle

**Last updated**: 2026-06-23  
**Status**: Active for compact contest implementation  
**Related rules**: `docs/spec/business-rules/BR-contest.md`  
**Architecture**: `docs/architecture/03-contest.md`

Tài liệu này mô tả luồng end-to-end hiện tại: Provider tạo contest, Customer đăng ký, Staff/Provider check-in, Provider/Staff tạo match linh hoạt, nhập kết quả, advance winner và publish leaderboard. Schema dùng `contest_matches` và `contest_match_participants`, không dùng class/round/heat/result/reward tables cũ.

---

## 0. Identifiers

| Field | Value | Notes |
|---|---|---|
| Contest owner | `provider_id` | Provider tạo và sở hữu contest |
| Participating branches | `contest_cafes` | Một contest có nhiều cafe tham gia |
| Registration scope | Contest-level | Customer không chọn chi nhánh khi đăng ký |
| Contest status | `DRAFT -> OPEN -> CLOSED -> RUNNING -> COMPLETED` | `CANCELLED` là terminal |
| Registration status | `PENDING -> CONFIRMED -> CHECKED_IN` | `CANCELLED` cho hủy |
| Schedule unit | `contest_matches` | Match/heat/time-attack/final đều là match |
| Match participant | `contest_match_participants` | Không hard-code A/B, hỗ trợ nhiều driver |
| Leaderboard | `contests.config.leaderboard` | Snapshot phase này |
| Monitoring | `contest_audit_logs` | Ghi mọi mutation quan trọng |

---

## 1. Provider tạo Contest DRAFT

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant W as Web App
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    P->>W: Enter contest configuration and participating_cafe_ids
    W->>API: POST /contests
    API->>DB: Validate provider owns ACTIVE cafes
    alt Invalid
        API-->>W: 403/422 error
    else Valid
        API->>DB: INSERT contests(status=DRAFT, provider_id)
        API->>DB: INSERT contest_cafes rows
        API->>Audit: contest.created
        API-->>W: Contest DRAFT + participating cafes
    end
```

---

## 2. Open registration

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    P->>API: POST /contests/:id/open
    API->>DB: Load DRAFT contest owned by Provider
    API->>DB: Validate cafes, time, capacity, registration window, vehicle_rule/config
    alt Invalid config
        API-->>P: 422 invalid contest config
    else Valid
        API->>DB: UPDATE contests.status OPEN
        API->>Audit: contest.opened
        API-->>P: Contest OPEN
    end
```

---

## 3. Customer đăng ký

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant W as Web App
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    C->>W: View public contest
    W->>API: GET /contests/:id
    API-->>W: Contest detail + cafes + summary + rules/prizes
    C->>W: Select vehicle_source RENTAL/BYOC
    W->>API: POST /contests/:id/register
    API->>DB: BEGIN transaction
    API->>DB: Validate OPEN + window + capacity + duplicate + vehicle_rule
    alt Reject
        API->>DB: ROLLBACK
        API-->>W: 409/422 error
    else Accept
        API->>DB: INSERT contest_registrations
        API->>DB: Free contest -> status CONFIRMED
        API->>Audit: registration.created
        API->>DB: COMMIT
        API-->>W: Registration + check_in_code
    end
```

---

## 4. Close registration

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    P->>API: POST /contests/:id/close
    API->>DB: Validate contest OPEN owned by Provider
    API->>DB: UPDATE contests.status CLOSED
    API->>Audit: contest.closed
    API-->>P: Contest CLOSED + registration closed
```

---

## 5. Staff/Provider check-in

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff/Provider
    participant W as Screen<br/>(StaffContestCheckInPage)
    participant API as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest/registrations.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    S->>W: Enter or scan check_in_code
    W->>API: GET /api/v1/contests/:id/registrations/lookup?check_in_code=...
    API->>CS: lookupRegistration()
    CS->>DB: Find registration in contest
    API-->>W: Registration summary
    S->>W: Confirm check-in cafe
    W->>API: POST /api/v1/contest-registrations/:id/check-in
    API->>CS: checkInRegistration()
    CS->>DB: Validate registration CONFIRMED
    CS->>DB: Validate cafe in contest_cafes
    CS->>DB: If STAFF, validate assigned cafe
    CS->>DB: UPDATE registration CHECKED_IN
    CS->>Audit: registration.checked_in
    API-->>W: Checked-in registration
```

---

## 6. Generate matches

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Assigned Staff
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    O->>API: POST /contests/:id/matches/generate
    API->>DB: Validate contest CLOSED/RUNNING
    API->>DB: Validate registrations CONFIRMED/CHECKED_IN
    API->>DB: Read format + drivers_per_match + seeding_mode
    API->>DB: INSERT contest_matches
    API->>DB: INSERT contest_match_participants
    API->>Audit: match.schedule_generated
    API-->>O: Matches + participants
```

---

## 7. Drag/drop participants

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Assigned Staff
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    O->>API: PATCH /contest-matches/:id/participants
    API->>DB: Validate match belongs to contest and actor can operate
    API->>DB: Replace/update slot_no, lane, grid_position
    API->>Audit: match.participants_updated
    API-->>O: Updated match participants
```

---

## 8. Submit result and advance

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Assigned Staff
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit

    O->>API: POST /contest-matches/:id/results
    API->>DB: Validate participants belong to match
    API->>DB: Update score/finish_position/best_lap/total_time/is_winner
    API->>DB: Update contest_matches.result_summary + status COMPLETED
    API->>Audit: match.result_submitted
    API-->>O: Completed match

    opt Winner advances
        O->>API: POST /contest-matches/:id/advance
        API->>DB: Load next_match_id and winners/qualified
        API->>DB: Insert/update next contest_match_participants
        API->>Audit: match.advanced
        API-->>O: Next match updated
    end
```

---

## 9. Publish leaderboard

```mermaid
sequenceDiagram
    autonumber
    actor O as Provider/Assigned Staff
    participant API as API
    participant DB as PostgreSQL
    participant Audit as ContestAudit
    participant Pub as Public Contest Page

    O->>API: POST /contests/:id/leaderboard/publish
    API->>DB: Validate completed result/final exists
    API->>DB: Compute standings from match participants
    API->>DB: UPDATE contests.config.leaderboard
    API->>Audit: leaderboard.published
    API-->>O: Published leaderboard
    Pub->>API: GET /contests/:id
    API-->>Pub: Contest detail with leaderboard
```

---

## 10. Cancel contest or registration

```mermaid
sequenceDiagram
    autonumber
    actor A as Provider / Staff / Customer
    participant FE as Screen<br/>(ProviderContestWorkspacePage or MyRegistrationSection)
    participant API as API<br/>(Express / ContestController)
    participant CS as ContestService<br/>(contest services)
    participant DB as Database<br/>(PostgreSQL)
    participant Audit as ContestAudit<br/>(contest_audit_logs)

    alt Cancel registration
        A->>FE: Click cancel registration
        FE->>API: POST /api/v1/contest-registrations/:id/cancel
        API->>CS: cancelRegistration(actor, id, reason)
        CS->>DB: Validate cancellable status/actor
        CS->>DB: UPDATE registration CANCELLED + reason
        CS->>Audit: registration.cancelled
        API-->>FE: Cancelled registration
    else Cancel contest
        A->>FE: Click cancel contest
        FE->>API: POST /api/v1/contests/:id/cancel
        API->>CS: cancelContest(providerId, contestId)
        CS->>DB: Validate Provider owner and contest not COMPLETED
        CS->>DB: UPDATE contest CANCELLED
        CS->>DB: Optionally cancel active registrations
        CS->>Audit: contest.cancelled
        API-->>FE: Cancelled contest
    end
```

---

## 11. Class Diagram: Contest Lifecycle

```mermaid
classDiagram
    class ProviderContestFormPage {
        +createContest()
        +publishContest()
    }
    class PublicContestDetailPage {
        +register()
        +viewLeaderboard()
    }
    class ProviderContestWorkspacePage {
        +reviewRegistrations()
        +generateMatches()
        +manageResults()
        +publishLeaderboard()
    }
    class StaffContestRuntimePage {
        +checkIn()
        +submitResult()
    }
    class ContestController {
        +create()
        +publish()
        +register()
        +approveRegistration()
        +generateMatches()
        +submitResults()
        +cancel()
    }
    class ContestService {
        +createContest()
        +registerForContest()
        +transitionContest()
    }
    class ContestRuntimeService {
        +lookupRegistration()
        +generateMatches()
        +submitResults()
        +advanceWinner()
        +publishLeaderboard()
    }
    class Contest
    class ContestCafe
    class ContestRegistration
    class ContestMatch
    class ContestMatchParticipant
    class ContestStaffAssignment
    class ContestAuditLog

    ProviderContestFormPage --> ContestController
    PublicContestDetailPage --> ContestController
    ProviderContestWorkspacePage --> ContestController
    StaffContestRuntimePage --> ContestController
    ContestController --> ContestService
    ContestController --> ContestRuntimeService
    Contest "1" --> "*" ContestCafe
    Contest "1" --> "*" ContestRegistration
    Contest "1" --> "*" ContestMatch
    ContestMatch "1" --> "*" ContestMatchParticipant
    Contest "1" --> "*" ContestStaffAssignment
    Contest "1" --> "*" ContestAuditLog
```

---

## Reference

- `docs/architecture/03-contest.md` — module architecture
- `docs/architecture/diagrams/contest-lifecycle-flow.md` — lifecycle flowchart
- `docs/spec/business-rules/BR-contest.md` — business rules
- `docs/spec/05-api-contracts.md` — endpoint contract
- `docs/spec/06-database.md` — current contest schema
