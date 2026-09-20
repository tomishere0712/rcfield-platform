# Data Model: Provider Onboarding & Subscription Management
**Date**: 2026-05-25

---

## Table of Contents

1. [provider_profiles](#1-provider_profiles)
2. [subscription_plans](#2-subscription_plans)
3. [provider_subscriptions](#3-provider_subscriptions)
4. [payment_requests](#4-payment_requests)
5. [notifications](#5-notifications)
6. [Relationships](#6-relationships)

---

## 1. `provider_profiles`

One-to-one extension of the `users` table. Created when a PROVIDER-role user completes registration. Tracks registration approval state and any suspension history.

### Fields

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | FK → `users.id`, UNIQUE, NOT NULL | One profile per Provider user |
| `business_name` | `VARCHAR(255)` | NOT NULL | |
| `business_description` | `TEXT` | NULLABLE | |
| `registration_status` | `ENUM` | NOT NULL, DEFAULT `PENDING` | See enum values below |
| `rejection_reason` | `TEXT` | NULLABLE | Populated by Admin on rejection |
| `suspended_at` | `TIMESTAMPTZ` | NULLABLE | Set when Admin suspends |
| `suspended_reason` | `TEXT` | NULLABLE | Required when `suspended_at` is set |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | Auto-updated on save |
| `deleted_at` | `TIMESTAMPTZ` | NULLABLE | Soft delete (TypeORM `@DeleteDateColumn`) |

### Enum: `RegistrationStatus`

```typescript
enum RegistrationStatus {
  PENDING   = 'PENDING',
  ACTIVE    = 'ACTIVE',
  REJECTED  = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}
```

### State Transitions

```
PENDING ──(Admin approves)──► ACTIVE
PENDING ──(Admin rejects)───► REJECTED
ACTIVE  ──(Admin suspends)──► SUSPENDED
SUSPENDED ─(Admin unsuspends)► ACTIVE
```

| From | To | Trigger | Side Effects |
|------|----|---------|--------------|
| `PENDING` | `ACTIVE` | Admin approval | Notify provider: `ACCOUNT_APPROVED` |
| `PENDING` | `REJECTED` | Admin rejection | Populate `rejection_reason`; notify: `ACCOUNT_REJECTED` |
| `ACTIVE` | `SUSPENDED` | Admin suspend | Set `suspended_at`, `suspended_reason`; notify: `ACCOUNT_SUSPENDED` |
| `SUSPENDED` | `ACTIVE` | Admin unsuspend | Clear `suspended_at`; notify: `ACCOUNT_UNSUSPENDED` |

### TypeORM Entity Sketch

```typescript
@Entity('provider_profiles')
export class ProviderProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index({ unique: true })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'business_name', length: 255 })
  businessName: string;

  @Column({ name: 'business_description', type: 'text', nullable: true })
  businessDescription: string | null;

  @Column({
    name: 'registration_status',
    type: 'enum',
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING,
  })
  registrationStatus: RegistrationStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'suspended_reason', type: 'text', nullable: true })
  suspendedReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

### Relationships

- `provider_profiles.user_id` → `users.id` (1:1)
- `provider_profiles` ← `provider_subscriptions` (1:many via `provider_id`)
- `provider_profiles` ← `payment_requests` (1:many via `provider_id`)

---

## 2. `subscription_plans`

Seeded, read-only reference data defining the available subscription tiers. Not editable via UI — changes require a migration or seed script.

### Fields

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `name` | `ENUM` | NOT NULL, UNIQUE | See enum values below |
| `branch_limit` | `INT` | NOT NULL | `-1` = unlimited |
| `ai_quota_per_month` | `INT` | NOT NULL | `-1` = unlimited |
| `channel_limit` | `INT` | NOT NULL | `-1` = unlimited |
| `price_per_month` | `DECIMAL(12,2)` | NOT NULL | `0.00` for TRIAL |
| `is_trial` | `BOOLEAN` | NOT NULL, DEFAULT `false` | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |

> No `deleted_at`: plans are never soft-deleted; deprecated plans are left as-is to preserve FK integrity on historical subscriptions.

### Enum: `PlanName`

```typescript
enum PlanName {
  TRIAL   = 'TRIAL',
  STARTER = 'STARTER',
  GROWTH  = 'GROWTH',
  PRO     = 'PRO',
}
```

### Seed Data (reference)

| name | branch_limit | ai_quota_per_month | channel_limit | price_per_month | is_trial |
|------|--------------|--------------------|---------------|-----------------|----------|
| `TRIAL` | 1 | 500 | 1 | 0.00 | true |
| `STARTER` | 1 | 1000 | 1 | 299000.00 | false |
| `GROWTH` | 3 | 5000 | 3 | 699000.00 | false |
| `PRO` | -1 | -1 | -1 | 1499000.00 | false |

### TypeORM Entity Sketch

```typescript
@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PlanName, unique: true })
  name: PlanName;

  @Column({ name: 'branch_limit', type: 'int' })
  branchLimit: number;

  @Column({ name: 'ai_quota_per_month', type: 'int' })
  aiQuotaPerMonth: number;

  @Column({ name: 'channel_limit', type: 'int' })
  channelLimit: number;

  @Column({ name: 'price_per_month', type: 'decimal', precision: 12, scale: 2 })
  pricePerMonth: number;

  @Column({ name: 'is_trial', type: 'boolean', default: false })
  isTrial: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

### Relationships

- `subscription_plans` ← `provider_subscriptions` (1:many via `plan_id`)
- `subscription_plans` ← `payment_requests` (1:many via `plan_id`)

---

## 3. `provider_subscriptions`

Tracks the current and historical subscription lifecycle for each provider. Only one subscription per provider may be in a non-`EXPIRED` status at any given time (enforced at service layer).

### Fields

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `provider_id` | `UUID` | FK → `users.id`, NOT NULL | |
| `plan_id` | `UUID` | FK → `subscription_plans.id`, NOT NULL | |
| `status` | `ENUM` | NOT NULL | See enum values below |
| `started_at` | `TIMESTAMPTZ` | NOT NULL | When this subscription period began |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | When the paid/trial period ends |
| `grace_ends_at` | `TIMESTAMPTZ` | NULLABLE | Set to `expires_at + 7 days` on grace entry |
| `ai_messages_used` | `INT` | NOT NULL, DEFAULT `0` | Resets to 0 on `ai_quota_reset_at` |
| `ai_quota_reset_at` | `TIMESTAMPTZ` | NOT NULL | Typically 1st of next calendar month |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `deleted_at` | `TIMESTAMPTZ` | NULLABLE | Soft delete |

### Enum: `SubscriptionStatus`

```typescript
enum SubscriptionStatus {
  TRIAL        = 'TRIAL',
  ACTIVE       = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  EXPIRED      = 'EXPIRED',
}
```

### State Transitions

```
TRIAL  ──(payment confirmed)────────► ACTIVE
TRIAL  ──(expires_at reached)────────► GRACE_PERIOD
ACTIVE ──(expires_at reached)────────► GRACE_PERIOD
GRACE_PERIOD ──(grace_ends_at reached)► EXPIRED
GRACE_PERIOD ──(payment confirmed)───► ACTIVE
EXPIRED ─────(payment confirmed)─────► ACTIVE
```

| From | To | Trigger | Side Effects |
|------|----|---------|--------------|
| `TRIAL` | `ACTIVE` | Payment confirmed (`payment_requests` → CONFIRMED) | Set new `expires_at` (+30 days); notify: `SUBSCRIPTION_ACTIVATED` |
| `TRIAL` | `GRACE_PERIOD` | Cron: `expires_at` passed | Set `grace_ends_at = expires_at + 7d`; notify: `GRACE_PERIOD_STARTED` |
| `ACTIVE` | `GRACE_PERIOD` | Cron: `expires_at` passed | Set `grace_ends_at = expires_at + 7d`; notify: `GRACE_PERIOD_STARTED` |
| `GRACE_PERIOD` | `EXPIRED` | Cron: `grace_ends_at` passed | Notify: `SUBSCRIPTION_EXPIRED`; block Provider operations |
| `GRACE_PERIOD` | `ACTIVE` | Payment confirmed | Reset `ai_messages_used = 0`; set new `expires_at`; notify: `SUBSCRIPTION_ACTIVATED` |
| `EXPIRED` | `ACTIVE` | Payment confirmed | Same as above |

### Indexes

```sql
-- Fast quota enforcement on every AI message request
CREATE INDEX idx_provider_subscriptions_provider_status
  ON provider_subscriptions (provider_id, status);

-- Efficient cron scan for expiry/grace transitions
CREATE INDEX idx_provider_subscriptions_expires_status
  ON provider_subscriptions (expires_at, status);
```

### TypeORM Entity Sketch

```typescript
@Entity('provider_subscriptions')
@Index(['providerId', 'status'])
@Index(['expiresAt', 'status'])
export class ProviderSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id' })
  providerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'provider_id' })
  provider: User;

  @Column({ name: 'plan_id' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'grace_ends_at', type: 'timestamptz', nullable: true })
  graceEndsAt: Date | null;

  @Column({ name: 'ai_messages_used', type: 'int', default: 0 })
  aiMessagesUsed: number;

  @Column({ name: 'ai_quota_reset_at', type: 'timestamptz' })
  aiQuotaResetAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

### Relationships

- `provider_subscriptions.provider_id` → `users.id` (many:1)
- `provider_subscriptions.plan_id` → `subscription_plans.id` (many:1)

---

## 4. `payment_requests`

Records manual bank-transfer payment submissions from Providers. An Admin reviews each request and either confirms (triggering subscription activation) or rejects it.

**Constraint**: A Provider may have at most one `PENDING` payment request at a time (enforced at service layer before insert).

### Fields

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `provider_id` | `UUID` | FK → `users.id`, NOT NULL | |
| `plan_id` | `UUID` | FK → `subscription_plans.id`, NOT NULL | Target plan being paid for |
| `status` | `ENUM` | NOT NULL, DEFAULT `PENDING` | See enum values below |
| `transfer_reference` | `VARCHAR(255)` | NOT NULL | Bank transfer reference/code |
| `transfer_date` | `DATE` | NOT NULL | Date of transfer per Provider |
| `transfer_amount` | `DECIMAL(12,2)` | NOT NULL | Amount transferred (VND) |
| `admin_notes` | `TEXT` | NULLABLE | Admin rejection reason or remarks |
| `reviewed_by` | `UUID` | FK → `users.id`, NULLABLE | Admin user who actioned the request |
| `reviewed_at` | `TIMESTAMPTZ` | NULLABLE | Timestamp of review action |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `deleted_at` | `TIMESTAMPTZ` | NULLABLE | Soft delete |

### Enum: `PaymentRequestStatus`

```typescript
enum PaymentRequestStatus {
  PENDING   = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED  = 'REJECTED',
}
```

### State Transitions

```
PENDING ──(Admin confirms)──► CONFIRMED  →  triggers ProviderSubscription activation
PENDING ──(Admin rejects)───► REJECTED
```

| From | To | Trigger | Side Effects |
|------|----|---------|--------------|
| `PENDING` | `CONFIRMED` | Admin confirms payment | Set `reviewed_by`, `reviewed_at`; activate `provider_subscriptions`; notify: `PAYMENT_REQUEST_CONFIRMED` |
| `PENDING` | `REJECTED` | Admin rejects | Set `reviewed_by`, `reviewed_at`, `admin_notes`; notify: `PAYMENT_REQUEST_REJECTED` |

### TypeORM Entity Sketch

```typescript
@Entity('payment_requests')
export class PaymentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id' })
  providerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'provider_id' })
  provider: User;

  @Column({ name: 'plan_id' })
  planId: string;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.PENDING,
  })
  status: PaymentRequestStatus;

  @Column({ name: 'transfer_reference', length: 255 })
  transferReference: string;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate: string; // stored as ISO date string

  @Column({ name: 'transfer_amount', type: 'decimal', precision: 12, scale: 2 })
  transferAmount: number;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

### Relationships

- `payment_requests.provider_id` → `users.id` (many:1)
- `payment_requests.plan_id` → `subscription_plans.id` (many:1)
- `payment_requests.reviewed_by` → `users.id` (many:1, nullable)

---

## 5. `notifications`

In-app notification records for Providers (and extensible to other roles). Delivered on relevant state transitions — displayed in a notification centre in the UI.

### Fields

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | FK → `users.id`, NOT NULL | Recipient |
| `type` | `ENUM` | NOT NULL | See enum values below |
| `title` | `VARCHAR(255)` | NOT NULL | Short heading for UI display |
| `message` | `TEXT` | NOT NULL | Full notification body |
| `read_at` | `TIMESTAMPTZ` | NULLABLE | NULL = unread |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT now() | |

> No `deleted_at`: notifications are never soft-deleted; old records may be archived by a background job.

### Enum: `NotificationType`

```typescript
enum NotificationType {
  ACCOUNT_APPROVED              = 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED              = 'ACCOUNT_REJECTED',
  ACCOUNT_SUSPENDED             = 'ACCOUNT_SUSPENDED',
  ACCOUNT_UNSUSPENDED           = 'ACCOUNT_UNSUSPENDED',
  TRIAL_EXPIRING_SOON           = 'TRIAL_EXPIRING_SOON',
  GRACE_PERIOD_STARTED          = 'GRACE_PERIOD_STARTED',
  SUBSCRIPTION_EXPIRED          = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_ACTIVATED        = 'SUBSCRIPTION_ACTIVATED',
  PAYMENT_REQUEST_CONFIRMED     = 'PAYMENT_REQUEST_CONFIRMED',
  PAYMENT_REQUEST_REJECTED      = 'PAYMENT_REQUEST_REJECTED',
}
```

### Notification Triggers

| Type | Triggered by |
|------|-------------|
| `ACCOUNT_APPROVED` | `provider_profiles.registration_status` → `ACTIVE` |
| `ACCOUNT_REJECTED` | `provider_profiles.registration_status` → `REJECTED` |
| `ACCOUNT_SUSPENDED` | `provider_profiles.registration_status` → `SUSPENDED` |
| `ACCOUNT_UNSUSPENDED` | `provider_profiles.registration_status` `SUSPENDED` → `ACTIVE` |
| `TRIAL_EXPIRING_SOON` | Cron: `expires_at - 3 days` while status = `TRIAL` |
| `GRACE_PERIOD_STARTED` | `provider_subscriptions.status` → `GRACE_PERIOD` |
| `SUBSCRIPTION_EXPIRED` | `provider_subscriptions.status` → `EXPIRED` |
| `SUBSCRIPTION_ACTIVATED` | `provider_subscriptions.status` → `ACTIVE` |
| `PAYMENT_REQUEST_CONFIRMED` | `payment_requests.status` → `CONFIRMED` |
| `PAYMENT_REQUEST_REJECTED` | `payment_requests.status` → `REJECTED` |

### Indexes

```sql
-- Fast unread count + notification list queries per user
CREATE INDEX idx_notifications_user_read_at
  ON notifications (user_id, read_at);
```

### TypeORM Entity Sketch

```typescript
@Entity('notifications')
@Index(['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

### Relationships

- `notifications.user_id` → `users.id` (many:1)

---

## 6. Relationships

### ER Summary

```
users
 ├──(1:1)── provider_profiles
 │            └── registration_status: PENDING | ACTIVE | REJECTED | SUSPENDED
 │
 ├──(1:N)── provider_subscriptions  ──(N:1)── subscription_plans
 │            └── status: TRIAL | ACTIVE | GRACE_PERIOD | EXPIRED
 │
 ├──(1:N)── payment_requests  ──(N:1)── subscription_plans
 │            └── status: PENDING | CONFIRMED | REJECTED
 │            └── reviewed_by → users.id (Admin)
 │
 └──(1:N)── notifications
              └── type: 10 values covering account + subscription events
```

### Foreign Key Map

| Table | Column | References | Cardinality |
|-------|--------|------------|-------------|
| `provider_profiles` | `user_id` | `users.id` | 1:1 (UNIQUE) |
| `provider_subscriptions` | `provider_id` | `users.id` | many:1 |
| `provider_subscriptions` | `plan_id` | `subscription_plans.id` | many:1 |
| `payment_requests` | `provider_id` | `users.id` | many:1 |
| `payment_requests` | `plan_id` | `subscription_plans.id` | many:1 |
| `payment_requests` | `reviewed_by` | `users.id` | many:1 (nullable) |
| `notifications` | `user_id` | `users.id` | many:1 |

### Cross-Entity Business Rules

| Rule | Enforcement |
|------|-------------|
| One active subscription per provider | Service layer: query for non-EXPIRED subscription before creating a new one |
| One PENDING payment request per provider | Service layer: query for PENDING request before inserting |
| Subscription activation only after payment confirmed | `payment_requests` CONFIRMED event → service updates `provider_subscriptions` |
| AI quota enforcement | Read `ai_messages_used` + `ai_quota_per_month` from active subscription + plan before each AI request |
| Branch/channel limit enforcement | Read limit from `subscription_plans` via active `provider_subscriptions` before creating branch/channel |
| Grace period duration | Always `expires_at + 7 days`; never configurable per-plan (hardcoded in service) |
