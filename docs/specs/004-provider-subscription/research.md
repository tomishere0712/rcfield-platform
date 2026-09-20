# Research: Provider Onboarding & Subscription Management
**Feature**: specs/004-provider-subscription/spec.md  
**Date**: 2026-05-25

---

### Subscription State Machine Implementation

**Decision**: Explicit `SubscriptionService.transition(subscriptionId, event)` method pattern, matching Principle II from the project constitution.

**Rationale**: Centralising all state transitions in a single method with a validated transition table ensures no invalid state changes can occur from anywhere in the codebase. Every call site must go through the same guard, making the lifecycle auditable and testable. This mirrors the booking state machine pattern already established in the project and aligns with Principle II ("explicit state machine over ad-hoc status flags").

**State enum**: `TRIAL | ACTIVE | GRACE_PERIOD | EXPIRED`

**Valid transitions**:
| From | Event | To |
|------|-------|----|
| `TRIAL` | trial period expires | `GRACE_PERIOD` |
| `ACTIVE` | billing period expires | `GRACE_PERIOD` |
| `GRACE_PERIOD` | grace period ends without payment | `EXPIRED` |
| `GRACE_PERIOD` | payment confirmed | `ACTIVE` |
| `EXPIRED` | payment confirmed | `ACTIVE` |
| `TRIAL` | payment confirmed during trial | `ACTIVE` |

Any attempted transition not in the table throws `AppError('Invalid subscription transition', 400, 'INVALID_SUBSCRIPTION_STATE')`.

**Alternatives considered**:
- Ad-hoc status flag updates scattered across cron jobs and payment webhooks — rejected because it scatters transition logic, making it easy to create inconsistent states and hard to audit the lifecycle.
- XState / statechart library — rejected for MVP; adds a dependency and learning curve for a state machine with only 4 states and 6 transitions that is trivially expressible as a lookup table.

---

### Cron Job Scheduling

**Decision**: `node-cron` with two recurring jobs: (1) daily at `00:05 UTC` to scan `provider_subscriptions` for expired trials or billing periods and drive transitions; (2) monthly on the 1st at `00:10 UTC` to reset `ai_messages_used` to `0` for all active subscriptions.

**Rationale**: `node-cron` is already the standard lightweight scheduler for Node.js projects of this scale and adds no new dependencies. The two jobs are simple, low-frequency, and have no queue or retry requirements — they run to completion in a single pass over the DB. Staggering the start times by 5 minutes avoids any overlap.

**Cron expressions**:
```
Daily expiry check:   5 0 * * *
Monthly quota reset:  10 0 1 * *
```

**Alternatives considered**:
- `bull` / `bullmq` — rejected as overkill; these libraries add Redis-backed job queues, worker processes, and retry strategies appropriate for high-volume async task processing, none of which are needed for 2 simple scheduled scans.
- `agenda` (MongoDB-backed scheduler) — rejected; project uses PostgreSQL, not MongoDB.
- Cloud scheduler (AWS EventBridge / GCP Cloud Scheduler) — deferred; adds infrastructure complexity that is not justified at this stage.

---

### In-App Notification Storage

**Decision**: Store notifications in a `notifications` table in PostgreSQL. Frontend polls via `GET /api/v1/notifications` (paginated, filtered by `read_at IS NULL`). No WebSocket or SSE for MVP.

**Rationale**: Persistent DB storage gives notifications durability — they survive server restarts and are available on any device the Provider logs in from. A simple polling approach (e.g., on page focus or a 30-second interval) is sufficient for non-time-critical events like subscription status changes and trial reminders. This avoids the operational complexity of maintaining long-lived connections.

**Schema**:
```
notifications
  id          UUID PK
  user_id     UUID FK → users.id
  type        ENUM (TRIAL_EXPIRING, SUBSCRIPTION_EXPIRED, PAYMENT_CONFIRMED, ...)
  title       VARCHAR(255)
  message     TEXT
  read_at     TIMESTAMPTZ NULL   -- NULL = unread
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Alternatives considered**:
- WebSocket (Socket.IO) — deferred; adds persistent connection management, authentication over WS, and horizontal scaling concerns (sticky sessions or Redis pub/sub adapter). Not justified when notification latency of ~30 seconds is acceptable.
- Server-Sent Events (SSE) — deferred for the same reason; one-directional push is simpler than WS but still requires managing open HTTP connections per client.
- Email-only notifications — rejected as the sole mechanism; in-app notifications are required so Providers see them without leaving the dashboard.

---

### AI Quota Tracking

**Decision**: Store `ai_messages_used INT NOT NULL DEFAULT 0` directly in `provider_subscriptions`. Increment atomically in PostgreSQL using a conditional `UPDATE ... WHERE id = $1 AND ai_messages_used < ai_quota` before dispatching to the AI layer. Use `-1` as a sentinel value for unlimited plans (`branch_limit`, `ai_quota`, `channel_limit` fields all use `-1` to mean unlimited).

**Rationale**: The quota counter lives alongside the subscription record that defines the limit, making the check a single-row read. The atomic `UPDATE ... WHERE ai_messages_used < ai_quota` pattern prevents over-counting without application-level locks — if the row is not updated (0 rows affected), the quota is exhausted and the request is rejected before any AI API call is made. This avoids a wasted round-trip to the AI provider. The `-1` sentinel is a well-established pattern (cf. Unix file descriptors, POSIX limits) and avoids nullable columns on numeric limit fields.

**Quota check pseudo-code**:
```sql
UPDATE provider_subscriptions
SET ai_messages_used = ai_messages_used + 1
WHERE id = $subscriptionId
  AND (ai_quota = -1 OR ai_messages_used < ai_quota)
RETURNING id;
-- 0 rows returned → quota exhausted, throw QuotaExceededError
```

**Alternatives considered**:
- Redis counter (`INCR` + `GET`) — rejected; adds a Redis dependency for a single counter that has no high-concurrency justification. Provider AI message rates are low (tens per day at most), so PostgreSQL row-level locking is not a bottleneck.
- Separate `ai_quota_usage` table — rejected; adds a join on every quota check for no benefit when a single column on the subscription row suffices.

---

### Provider Profile Separation

**Decision**: Separate `provider_profiles` table with a 1:1 foreign key to `users.id`. Contains provider-specific fields: `business_name`, `business_description`, `registration_status` (`PENDING | ACTIVE | REJECTED | SUSPENDED`), plus audit timestamps.

**Rationale**: The `users` table is shared by all roles (CUSTOMER, STAFF, PROVIDER, ADMIN). Adding provider-specific columns to `users` would pollute the generic identity record with fields that are `NULL` for 75% of rows and have no meaning outside the Provider context. A separate table keeps `users` clean, makes provider-specific queries and indexes straightforward, and allows provider profile data to evolve independently without touching the core auth table.

**Schema (key fields)**:
```
provider_profiles
  id                    UUID PK
  user_id               UUID UNIQUE FK → users.id
  business_name         VARCHAR(255) NOT NULL
  business_description  TEXT
  registration_status   ENUM (PENDING, ACTIVE, REJECTED, SUSPENDED) NOT NULL DEFAULT 'PENDING'
  rejected_reason       TEXT NULL
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Alternatives considered**:
- Extra columns directly on `users` table — rejected; creates sparse nullable columns for non-Provider roles, couples provider lifecycle changes to the core auth schema, and violates single-responsibility for the users table.
- Storing provider metadata in a JSON column on `users` — rejected; loses column-level constraints, indexability, and TypeORM type safety.
