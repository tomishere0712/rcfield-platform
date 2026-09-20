# Quickstart: Provider Onboarding & Subscription Management
**Date**: 2026-05-25

---

## Implementation Order

Follow this sequence to avoid circular dependencies between layers:

1. **New enums in `src/types/index.ts`**
   - `ProviderStatus`: `PENDING | ACTIVE | SUSPENDED | REJECTED`
   - `SubscriptionStatus`: `TRIAL | ACTIVE | GRACE_PERIOD | EXPIRED`
   - `SubscriptionPlanName`: `TRIAL | STARTER | GROWTH | PRO`
   - `PaymentRequestStatus`: `PENDING | CONFIRMED | REJECTED`
   - `NotificationType`: `ACCOUNT_APPROVED | ACCOUNT_REJECTED | ACCOUNT_SUSPENDED | GRACE_PERIOD_STARTED | SUBSCRIPTION_EXPIRED | SUBSCRIPTION_ACTIVATED | NEW_PROVIDER_REGISTERED | PAYMENT_REQUEST_RECEIVED`

2. **New TypeORM entities** (`src/models/`)
   - `ProviderProfile` — linked 1:1 to `User(role=PROVIDER)`, holds `status`, `business_name`, `tax_code`, etc.
   - `SubscriptionPlan` — static catalogue (`branch_limit`, `ai_quota_per_month`, `price_per_month`, etc.)
   - `ProviderSubscription` — active subscription per provider; tracks `status`, `expires_at`, `grace_ends_at`, `ai_messages_used`
   - `PaymentRequest` — bank-transfer proof submitted by provider; reviewed by admin
   - `Notification` — per-user inbox; `type`, `payload` (JSONB), `read_at`

3. **Database migration**
   Run TypeORM migration to create all five tables with proper indexes and foreign keys.

4. **Seed `subscription_plans`**
   Insert four rows: `TRIAL` (free, 30-day, 1 branch, limited AI), `STARTER`, `GROWTH`, `PRO`.
   Use a dedicated seed script (`src/seeds/subscription-plans.seed.ts`) so it is idempotent and safe to re-run.

5. **`ProviderOnboardingService`** (`src/services/provider-onboarding.service.ts`)
   Methods: `register`, `approve`, `reject`, `suspend`, `unsuspend`.
   `approve` is the only place that creates the initial `ProviderSubscription` (status=`TRIAL`) and the first `Cafe` branch.

6. **`SubscriptionService`** (`src/services/subscription.service.ts`)
   Methods: `transition`, `checkBranchQuota`, `checkAIQuota`, `getActive`, `stackRenewal`.
   All state changes go through `transition` — direct DB writes to `status` are forbidden.

7. **`PaymentRequestService`** (`src/services/payment-request.service.ts`)
   Methods: `submit`, `confirm`, `reject`.
   `confirm` delegates to `SubscriptionService.stackRenewal` for the actual subscription update.

8. **`NotificationService`** (`src/services/notification.service.ts`)
   Methods: `create`, `listForUser`, `markRead`, `markAllRead`.
   Other services call `NotificationService.create` — never write to the `notifications` table directly.

9. **Controllers + routes**
   - Provider-facing: `src/routes/provider/subscription.routes.ts`, `provider/payment-request.routes.ts`, `provider/notification.routes.ts`
   - Admin-facing: `src/routes/admin/providers.routes.ts`, `admin/payment-requests.routes.ts`
   - Public: extend `src/routes/auth.routes.ts` with `POST /register-provider`

10. **Cron jobs** (`src/jobs/subscription-lifecycle.job.ts`)
    Register the job file in `src/index.ts` after DB connection is confirmed ready.

11. **Frontend pages & components**
    - `ProviderRegisterPage` — public form, no auth
    - `SubscriptionPage` — protected by `PROVIDER` role
    - `NotificationBell` — shared header component
    - `AdminProvidersPage` — protected by `ADMIN` role
    - `AdminPaymentRequestsPage` — protected by `ADMIN` role

---

## Key Code Patterns

### 1. Subscription State Transition (Constitution Principle II — explicit state machine)

```typescript
// src/services/subscription.service.ts

import { AppError } from '../utils/app-error';
import { SubscriptionStatus } from '../types';
import { ProviderSubscription } from '../models/ProviderSubscription';

const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.GRACE_PERIOD,
    SubscriptionStatus.ACTIVE,
  ],
  [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.GRACE_PERIOD],
  [SubscriptionStatus.GRACE_PERIOD]: [
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.ACTIVE,
  ],
  [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE],
};

async transition(
  subscriptionId: string,
  toStatus: SubscriptionStatus,
): Promise<ProviderSubscription> {
  const repo = this.dataSource.getRepository(ProviderSubscription);

  const sub = await repo.findOneOrFail({ where: { id: subscriptionId } });

  const allowed = VALID_TRANSITIONS[sub.status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      `Cannot transition subscription from ${sub.status} to ${toStatus}`,
      422,
      'INVALID_STATUS_TRANSITION',
    );
  }

  sub.status = toStatus;
  return repo.save(sub);
}
```

### 2. Atomic AI Quota Increment + Check

Perform the check and increment in a single `UPDATE … RETURNING` to avoid TOCTOU race conditions when multiple concurrent requests arrive for the same provider.

```typescript
// src/services/subscription.service.ts

async incrementAndCheckAIQuota(providerId: string): Promise<void> {
  const repo = this.dataSource.getRepository(ProviderSubscription);

  const result = await repo.query<{ ai_messages_used: number }[]>(
    `UPDATE provider_subscriptions
     SET ai_messages_used = ai_messages_used + 1
     WHERE provider_id = $1
       AND status IN ('TRIAL', 'ACTIVE', 'GRACE_PERIOD')
       AND (ai_quota_per_month = -1 OR ai_messages_used < ai_quota_per_month)
     RETURNING ai_messages_used`,
    [providerId],
  );

  if (!result.length) {
    throw new AppError('AI quota exceeded or subscription inactive', 429, 'AI_QUOTA_EXCEEDED');
  }
}
```

`ai_quota_per_month = -1` is the sentinel value meaning unlimited (used on the `PRO` plan).

### 3. Cron Job Skeleton

```typescript
// src/jobs/subscription-lifecycle.job.ts

import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { SubscriptionService } from '../services/subscription.service';
import { NotificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

const subscriptionService = new SubscriptionService(AppDataSource);
const notificationService = new NotificationService(AppDataSource);

// Daily at 00:05 UTC — expire TRIAL/ACTIVE → GRACE_PERIOD
cron.schedule('5 0 * * *', async () => {
  logger.info('[cron] processExpiredSubscriptions start');
  try {
    await processExpiredSubscriptions();
  } catch (err) {
    logger.error('[cron] processExpiredSubscriptions failed', err);
  }
});

// Daily at 00:07 UTC — expire GRACE_PERIOD → EXPIRED
cron.schedule('7 0 * * *', async () => {
  logger.info('[cron] processExpiredGracePeriods start');
  try {
    await processExpiredGracePeriods();
  } catch (err) {
    logger.error('[cron] processExpiredGracePeriods failed', err);
  }
});

// Monthly on 1st at 00:10 UTC — reset ai_messages_used
cron.schedule('10 0 1 * *', async () => {
  logger.info('[cron] resetMonthlyAIQuotas start');
  try {
    await resetMonthlyAIQuotas();
  } catch (err) {
    logger.error('[cron] resetMonthlyAIQuotas failed', err);
  }
});

async function processExpiredSubscriptions(): Promise<void> {
  // Query subscriptions where expires_at <= NOW() AND status IN (TRIAL, ACTIVE)
  // For each: subscriptionService.transition(id, GRACE_PERIOD)
  //           set grace_ends_at = expires_at + INTERVAL '7 days'
  //           notificationService.create(providerId, GRACE_PERIOD_STARTED)
}

async function processExpiredGracePeriods(): Promise<void> {
  // Query subscriptions where grace_ends_at <= NOW() AND status = GRACE_PERIOD
  // For each: subscriptionService.transition(id, EXPIRED)
  //           soft-delete all branches for this provider
  //           notificationService.create(providerId, SUBSCRIPTION_EXPIRED)
}

async function resetMonthlyAIQuotas(): Promise<void> {
  // UPDATE provider_subscriptions SET ai_messages_used = 0
  // WHERE status IN (TRIAL, ACTIVE, GRACE_PERIOD)
}
```

Register the file in `src/index.ts`:

```typescript
// src/index.ts  (after AppDataSource.initialize())
import '../jobs/subscription-lifecycle.job';
```

### 4. Quota Enforcement in Branch Creation Middleware

Before any route that creates a branch, call `SubscriptionService.checkBranchQuota(providerId)`:

```typescript
// src/services/subscription.service.ts

async checkBranchQuota(providerId: string): Promise<void> {
  const sub = await this.getActive(providerId);
  // getActive throws 403 SUBSCRIPTION_INACTIVE if no active/trial/grace subscription

  const plan = await this.planRepo.findOneOrFail({ where: { id: sub.plan_id } });

  if (plan.branch_limit === -1) return; // unlimited

  const branchCount = await this.cafeRepo.count({
    where: { provider_id: providerId, deleted_at: IsNull() },
  });

  if (branchCount >= plan.branch_limit) {
    throw new AppError(
      `Branch limit of ${plan.branch_limit} reached on the ${plan.name} plan. Upgrade to add more branches.`,
      403,
      'PLAN_LIMIT_EXCEEDED',
    );
  }
}
```

Wire it as an Express middleware on the branch creation route:

```typescript
// src/routes/provider/branches.routes.ts

router.post(
  '/',
  requireAuth,
  requireRole(Role.PROVIDER),
  asyncHandler(async (req, res, next) => {
    await subscriptionService.checkBranchQuota(req.user.providerId);
    next();
  }),
  branchController.create,
);
```

---

## Integration Scenarios

### Scenario 1: New Provider Registration → Trial Activation

```
1. POST /api/v1/auth/register-provider
   Body: { email, password, business_name, tax_code, phone, ... }
   → Creates User(role=PROVIDER)
   → Creates ProviderProfile(status=PENDING)
   → NotificationService.create(adminUserId, NEW_PROVIDER_REGISTERED, { providerId })
   Response: 201 { message: "Registration submitted, pending review" }

2. GET /api/v1/admin/providers?status=PENDING
   → Admin sees list of PENDING providers

3. POST /api/v1/admin/providers/:providerId/approve
   Body: { plan_name: "TRIAL" }           // optional, defaults to TRIAL
   → ProviderProfile.status = ACTIVE
   → Creates ProviderSubscription(status=TRIAL, expires_at=now+30d, plan=TRIAL)
   → Creates first Cafe branch (name from ProviderProfile.business_name)
   → NotificationService.create(providerUserId, ACCOUNT_APPROVED)
   Response: 200 { subscription, cafe }

4. Provider logs in → GET /api/v1/provider/subscription
   Response: {
     status: "TRIAL",
     plan: "TRIAL",
     expires_at: "...",
     days_remaining: 28,
     branch_limit: 1,
     branches_used: 1,
     ai_quota_per_month: 100,
     ai_messages_used: 4
   }
```

### Scenario 2: Trial Expiry Flow

```
1. Daily cron (00:05 UTC) queries:
   SELECT * FROM provider_subscriptions
   WHERE expires_at <= NOW()
     AND status IN ('TRIAL', 'ACTIVE');

2. For each row:
   → SubscriptionService.transition(id, GRACE_PERIOD)
   → UPDATE provider_subscriptions
     SET grace_ends_at = expires_at + INTERVAL '7 days'
     WHERE id = $1
   → NotificationService.create(providerUserId, GRACE_PERIOD_STARTED, {
       grace_ends_at,
       message: "Your subscription has expired. You have 7 days to renew."
     })

3. 7 days later, daily cron (00:07 UTC) queries:
   SELECT * FROM provider_subscriptions
   WHERE grace_ends_at <= NOW()
     AND status = 'GRACE_PERIOD';

4. For each row:
   → SubscriptionService.transition(id, EXPIRED)
   → Soft-delete all branches:
     UPDATE cafes SET deleted_at = NOW()
     WHERE provider_id = $1 AND deleted_at IS NULL
   → NotificationService.create(providerUserId, SUBSCRIPTION_EXPIRED, {
       message: "Your subscription has expired and branches are deactivated."
     })
```

### Scenario 3: Payment & Reactivation

```
1. Provider submits proof of bank transfer:
   POST /api/v1/provider/payment-requests
   Body: {
     plan_name: "STARTER",      // target plan (can be same as current)
     months: 1,                 // number of months to pay for
     amount: 299000,            // VND, must match plan * months
     bank_ref: "FT2605250001",
     transfer_note: "RCF-sub-renewal"
   }
   → Creates PaymentRequest(status=PENDING)
   → NotificationService.create(adminUserId, PAYMENT_REQUEST_RECEIVED, { requestId })
   Response: 201 { payment_request_id }

2. Admin reviews:
   GET /api/v1/admin/payment-requests?status=PENDING
   → Returns list with provider name, plan, amount, bank_ref

3. Admin confirms:
   POST /api/v1/admin/payment-requests/:requestId/confirm
   → PaymentRequest.status = CONFIRMED
   → SubscriptionService.stackRenewal(providerId, planName, months):
       new_expires_at = MAX(current expires_at, NOW()) + months * 30 days  // stacked
       if plan changed: sub.plan_id = new plan
       if sub.status == EXPIRED:
         restore soft-deleted branches:
           UPDATE cafes SET deleted_at = NULL WHERE provider_id = $1
       SubscriptionService.transition(id, ACTIVE)
       sub.expires_at = new_expires_at
   → NotificationService.create(providerUserId, SUBSCRIPTION_ACTIVATED, {
       plan: "STARTER",
       expires_at: new_expires_at
     })
   Response: 200 { subscription }

   Admin rejects (invalid payment):
   POST /api/v1/admin/payment-requests/:requestId/reject
   Body: { reason: "Amount mismatch" }
   → PaymentRequest.status = REJECTED
   → NotificationService.create(providerUserId, PAYMENT_REQUEST_REJECTED, { reason })
```

---

## Frontend Component Map

| Component / Page | Location | Role Guard | Purpose |
|---|---|---|---|
| `ProviderRegisterPage` | `src/pages/auth/ProviderRegisterPage.tsx` | Public | Multi-step registration form: business info, contact, T&C acceptance. Submits to `POST /auth/register-provider`. Shows success state instructing provider to wait for email. |
| `SubscriptionPage` | `src/pages/provider/SubscriptionPage.tsx` | PROVIDER | Displays current plan name, status badge, expiry date, days-remaining countdown. Renders usage bars for branches (used / limit) and AI messages (used / quota). Embeds `PaymentRequestForm` for manual renewal submission. |
| `NotificationBell` | `src/components/layout/NotificationBell.tsx` | Authenticated | Bell icon in the top navbar with unread-count badge. Clicking opens a dropdown list of recent notifications (type icon + message + relative time). Calls `markRead` on open and `markAllRead` on button click. Polls or uses WebSocket for real-time count. |
| `AdminProvidersPage` | `src/pages/admin/AdminProvidersPage.tsx` | ADMIN | Searchable, filterable table of all providers (name, status, plan, registered date). Row actions: Approve (opens plan-select modal), Reject (opens reason modal), Suspend, Unsuspend. Status badges use color coding: PENDING=yellow, ACTIVE=green, SUSPENDED=red, REJECTED=grey. |
| `AdminPaymentRequestsPage` | `src/pages/admin/AdminPaymentRequestsPage.tsx` | ADMIN | Table of payment requests sorted by submitted date. Columns: provider name, target plan, months, amount, bank_ref, status. Row actions: Confirm, Reject (opens reason modal). Links to provider detail for context. |
