# Feature Specification: Provider Onboarding & Subscription Management

**Feature Branch**: `004-provider-subscription`
**Created**: 2026-05-25
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Provider Registration & Admin Approval (Priority: P1)

A new RC field business owner discovers RCField and wants to try the platform. They register an account, wait for admin review, and upon approval automatically receive a 30-day trial with one branch pre-created so they can start using the system immediately.

**Why this priority**: This is the entry point for every provider. Nothing else in the system works until a provider account is approved and a trial subscription is active.

**Independent Test**: Can be tested end-to-end by registering a new provider account, having admin approve it, and verifying that the trial subscription and initial branch are created automatically.

**Acceptance Scenarios**:

1. **Given** a visitor fills in the registration form with valid business details, **When** they submit, **Then** their account is created with status PENDING and they receive a confirmation notification.
2. **Given** a provider account is PENDING, **When** Admin approves it, **Then** a 30-day trial subscription starts, one branch is automatically created for that provider, and the provider is notified.
3. **Given** a provider account is PENDING, **When** Admin rejects it, **Then** the provider is notified with a reason and the account is marked REJECTED.
4. **Given** a provider account is PENDING, **When** Admin views the pending list, **Then** Admin sees all unreviewed registrations with business details.

---

### User Story 2 — Trial Expiry & Grace Period (Priority: P2)

A provider's 30-day trial period ends. The system transitions through a grace period before ultimately soft-deleting the branch to give the provider time to subscribe without losing access abruptly.

**Why this priority**: This lifecycle management is what motivates providers to upgrade, and mishandling it (e.g., deleting data immediately) would cause serious trust issues.

**Independent Test**: Can be tested by setting a trial subscription's expiry to a past date and verifying the system correctly transitions to grace period then to locked state.

**Acceptance Scenarios**:

1. **Given** a trial subscription expires, **When** the scheduled check runs, **Then** the subscription enters GRACE_PERIOD status, the branch stops accepting new bookings, and the provider is notified.
2. **Given** a subscription has been in GRACE_PERIOD for 7 days, **When** the scheduled check runs, **Then** the branch is soft-deleted, subscription status becomes EXPIRED, and the provider is notified that they must subscribe to restore access.
3. **Given** a branch is in GRACE_PERIOD, **When** existing customers try to book, **Then** the booking is rejected with a message that the branch is temporarily unavailable.
4. **Given** a branch is soft-deleted due to expiry, **When** the provider later activates a paid plan, **Then** the branch and all its data are restored.

---

### User Story 3 — Subscription Upgrade via Payment Request (Priority: P3)

A provider wants to continue using RCField after their trial or upgrade to a higher plan. They submit a payment request indicating the desired plan and attach proof of bank transfer. Admin reviews and confirms, activating the new subscription.

**Why this priority**: This is the revenue-generating flow. It directly converts trial users to paying customers.

**Independent Test**: Can be tested by submitting a payment request for a plan upgrade and having admin confirm it, then verifying the provider's quota limits are updated.

**Acceptance Scenarios**:

1. **Given** a provider is on Trial or an existing paid plan, **When** they submit a payment request with plan selection and transfer reference, **Then** the request is queued for admin review with status PENDING.
2. **Given** a payment request is PENDING, **When** Admin confirms it, **Then** the provider's subscription is updated to the new plan, quota limits are adjusted, and the provider is notified.
3. **Given** a payment request is PENDING, **When** Admin rejects it (e.g., transfer not found), **Then** the provider is notified with a reason and can resubmit.
4. **Given** a provider submits a payment request while a previous request is still PENDING, **Then** the system rejects the duplicate and informs the provider that their existing request is under review.
5. **Given** a provider upgrades from Starter to Growth, **When** the upgrade is confirmed, **Then** their branch limit increases from 1 to 3 and they can immediately create additional branches.

---

### User Story 4 — Quota Enforcement (Priority: P4)

The system enforces per-plan limits on branches, AI message quota, and connected channels so that providers cannot exceed what their subscription allows.

**Why this priority**: Quota enforcement protects platform costs and ensures plan differentiation is real, not just cosmetic.

**Independent Test**: Can be tested by setting a provider to Starter plan and attempting to create a second branch, which should be blocked.

**Acceptance Scenarios**:

1. **Given** a provider is on Starter (1 branch limit), **When** they try to create a second branch, **Then** the action is blocked with a message indicating their plan limit and a prompt to upgrade.
2. **Given** a provider has consumed their monthly AI message quota, **When** a new customer message arrives on Messenger, **Then** the AI does not respond and a fallback message is sent instead.
3. **Given** a provider is on Starter (1 channel limit), **When** they try to connect a second messaging channel, **Then** the action is blocked with an upgrade prompt.
4. **Given** the first day of a new billing month, **When** the reset runs, **Then** each provider's AI message usage counter resets to 0.

---

### Edge Cases

- What happens if Admin approves a provider but the system fails to create the initial branch? The trial must not activate until the branch is successfully created; rollback both actions atomically.
- What if a provider submits a payment request while their subscription is still active? Allow it — this is an early renewal or upgrade scenario.
- What if a provider's trial is in GRACE_PERIOD and they submit a payment to reactivate? Confirm payment → restore branch → set new subscription start date.
- What if a provider has active bookings scheduled after their grace period ends? Those bookings are preserved in the database (soft delete does not destroy data); they become visible again when the subscription is restored.
- What if admin confirms a payment request but the provider's account has been deleted? Reject silently and flag for admin review.
- What if a provider is SUSPENDED while they have a pending payment request? The payment request remains pending; admin can still confirm it, but the subscription only activates when the provider is unsuspended.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow new providers to register with: business name, contact email, phone number, and a brief description of their RC field operation.
- **FR-002**: System MUST place new provider registrations in PENDING status until Admin explicitly approves or rejects them.
- **FR-003**: Upon Admin approval, System MUST automatically create a Trial subscription (30-day duration) and provision one branch for the provider.
- **FR-004**: System MUST notify providers via in-app notification (visible in their dashboard) when their account is approved, rejected, or when their subscription status changes.
- **FR-005**: System MUST run a daily scheduled check that transitions subscriptions from ACTIVE to GRACE_PERIOD when they expire.
- **FR-006**: System MUST run a daily scheduled check that soft-deletes branches and marks subscriptions EXPIRED when the grace period (7 days) ends.
- **FR-007**: Branches in GRACE_PERIOD MUST reject new booking requests while allowing existing bookings to proceed normally.
- **FR-008**: System MUST allow providers to submit a subscription payment request specifying: desired plan, bank transfer reference number, and transfer date.
- **FR-009**: Admin MUST be able to view all pending payment requests with provider details and confirm or reject each one.
- **FR-010**: Upon Admin confirmation of a payment request, System MUST update the provider's subscription plan and adjust all quota limits immediately.
- **FR-011**: System MUST enforce branch creation limits per subscription plan and block providers from exceeding their plan's branch quota.
- **FR-012**: System MUST enforce the monthly AI message quota per subscription plan; when exhausted, the AI channel must fall back gracefully.
- **FR-013**: System MUST enforce the channel connection limit per subscription plan.
- **FR-014**: System MUST reset each provider's AI message usage counter at the start of each calendar month.
- **FR-015**: When a provider activates a paid subscription after expiry, System MUST restore all soft-deleted branches and their data.

### Key Entities

- **SubscriptionPlan**: Defines a plan tier with its limits (branch_limit, ai_quota_per_month, channel_limit, price, duration_days). Seeded data — not user-editable.
- **ProviderSubscription**: Tracks a provider's current subscription (plan, status, start date, end date, grace period end date, AI messages used this month).
- **PaymentRequest**: A provider's request to activate or upgrade a plan (desired plan, transfer reference, transfer date, status, admin notes).
- **Provider (User with PROVIDER role)**: Business owner account with registration status (PENDING, ACTIVE, REJECTED, SUSPENDED). Admin can transition ACTIVE → SUSPENDED at any time; all branches are hidden while suspended.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A provider can complete the registration form and submit it in under 3 minutes.
- **SC-002**: Admin can review and approve or reject a pending registration in under 1 minute per request.
- **SC-003**: Trial subscription and initial branch are created within 5 seconds of Admin approval.
- **SC-004**: Providers receive status change notifications within 1 minute of the triggering action.
- **SC-005**: Quota enforcement blocks over-limit actions 100% of the time — no bypass possible through any interface.
- **SC-006**: Branch data is fully restored within 10 seconds of a payment confirmation activating a new subscription after expiry.
- **SC-007**: The scheduled expiry check processes all due subscriptions within 5 minutes of running.

## Clarifications

### Session 2026-05-25

- Q: Khi admin xác nhận thanh toán cho provider đang còn hạn (gia hạn sớm), ngày hết hạn mới tính thế nào? → A: Luôn cộng thêm 1 tháng từ ngày hết hạn hiện tại — gia hạn sớm thì cộng dồn, không mất ngày còn lại.
- Q: Hệ thống thông báo cho provider qua kênh nào? → A: Chỉ in-app notification trong dashboard. Email qua Firebase là roadmap tương lai, ngoài scope hiện tại.
- Q: Admin có thể khoá tài khoản Provider đang ACTIVE không? → A: Có — Admin có thể SUSPEND bất kỳ lúc nào; provider bị khoá không đăng nhập được và tất cả branch bị ẩn khỏi hệ thống.

## Assumptions

- In-app notification (dashboard) is the sole notification channel in this version. Email notification via Firebase is deferred to a future release.
- Payment is entirely manual (bank transfer + admin confirmation); no payment gateway integration required.
- Subscription plans (Starter, Growth, Pro) are seeded as fixed data; Admin cannot create custom plans through the UI.
- A provider can only have one active subscription at a time; plan changes replace the current subscription.
- The billing cycle for paid plans is monthly from the activation date, not calendar-month aligned.
- AI quota resets on the 1st of each calendar month regardless of when the subscription was activated.
- Admin confirmation of payment always extends the subscription by exactly one month stacked on top of the current expiry date, regardless of whether the subscription is still active or already expired. Early renewal is additive — providers never lose remaining days.
- Branch soft-delete preserves all associated data: bookings, vehicles, staff assignments, inspection records.
- There is no self-service plan downgrade; providers contact Admin to downgrade.
