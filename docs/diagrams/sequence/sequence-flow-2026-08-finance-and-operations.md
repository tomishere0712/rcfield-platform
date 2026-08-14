# Sequence Flow: August 2026 Finance and Operations Update

**Last updated:** 2026-08-13  
**Scope:** bank-transfer booking payment, PayOS provider subscription, contest finance, itemized damage charge, and custom menu categories.

The diagrams follow the established RCField sequence layout: actor, concrete screen, Express controller, service, TypeORM repository, PostgreSQL, then third-party systems.

## 1. Booking Checkout by Bank Transfer and Webhook Reconciliation

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as Screen<br/>(BookingPaymentPage)
    participant API as API<br/>(Express / PaymentController)
    participant PS as PaymentService<br/>(payment.service.ts)
    participant GW as BankTransferGateway<br/>(bank-transfer.gateway.ts)
    participant WH as BankWebhookService<br/>(bank-webhook.service.ts)
    participant Repo as Repository<br/>(TypeORM)
    participant DB as Database<br/>(PostgreSQL)
    participant Bank as Bank / Sandbox Bank

    C->>FE: Select bank transfer and confirm checkout
    FE->>API: POST /api/v1/bookings/:id/checkout
    API->>PS: checkout(bookingId, BANK_TRANSFER)
    PS->>Repo: Load booking, cafe payment settings, payment transaction
    Repo->>DB: SELECT booking + cafe_payment_settings
    DB-->>Repo: payment configuration
    PS->>GW: createPaymentReference(amount, cafe)
    GW-->>PS: paymentRefCode + VietQR payload
    PS->>Repo: Save PENDING transaction and payment_ref_code
    Repo->>DB: INSERT/UPDATE payment_transactions
    PS-->>API: checkout response + QR data
    API-->>FE: 200 payment instructions
    FE-->>C: Display QR code and payment reference
    Bank->>WH: POST /api/v1/payments/bank-webhook
    WH->>Repo: Create bank transaction and match payment_ref_code
    Repo->>DB: INSERT bank transaction and SELECT payment transaction
    alt Exact live match and sufficient amount
        WH->>PS: confirmPayment(transaction)
        PS->>Repo: Mark payment PAID and booking CONFIRMED
        Repo->>DB: Transactional UPDATE
        WH-->>Bank: 200 matched
    else Unmatched, duplicate, expired, or ambiguous
        WH->>Repo: Keep transaction for reconciliation
        Repo->>DB: UPDATE match_status / match_reason
        WH-->>Bank: 200 recorded
    end
```

## 2. Provider Subscription Checkout through PayOS

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant FE as Screen<br/>(ProviderSubscriptionPage)
    participant API as API<br/>(Express / PaymentRequestController)
    participant PR as PaymentRequestService
    participant PayOS as PayOSService<br/>(payos.service.ts)
    participant Repo as Repository<br/>(TypeORM)
    participant DB as Database<br/>(PostgreSQL)
    participant PG as PayOS

    P->>FE: Select a plan and pay through PayOS
    FE->>API: POST /api/v1/provider/payment-requests/payos-link
    API->>PR: createPayOSPaymentLink(provider, plan)
    PR->>Repo: Validate provider, plan, trial usage, pending request
    Repo->>DB: SELECT providers + subscription_plans + payment_requests
    PR->>PayOS: createPaymentLink(orderCode, amount)
    PayOS->>PG: Create checkout link
    PG-->>PayOS: checkoutUrl + paymentLinkId
    PayOS-->>PR: PayOS order
    PR->>Repo: Save pending payment request
    Repo->>DB: INSERT payment_requests
    API-->>FE: 200 checkoutUrl
    FE-->>P: Redirect to PayOS
    PG->>API: POST /api/v1/payos/webhook
    API->>PayOS: verify webhook signature and status
    PayOS->>Repo: Find request by order code
    Repo->>DB: SELECT payment_requests
    alt Successful and not processed
        PayOS->>PR: activateSubscription(request)
    PR->>Repo: Mark paid, create or extend subscription, record trial usage
        Repo->>DB: Transactional UPDATE/INSERT
        API-->>PG: 200 acknowledged
    else Invalid or duplicate event
        API-->>PG: Reject invalid / acknowledge duplicate
    end
```

## 3. Contest Finance Ledger and Summary

```mermaid
sequenceDiagram
    autonumber
    actor U as Provider / Assigned Staff
    participant FE as Screen<br/>(ContestFinancePage)
    participant API as API<br/>(Express / ContestFinanceController)
    participant FS as ContestFinanceService<br/>(contest/finance.ts)
    participant LS as ContestLedgerService<br/>(contest/ledger.ts)
    participant Repo as Repository<br/>(TypeORM)
    participant DB as Database<br/>(PostgreSQL)

    U->>FE: Open contest finance
    FE->>API: GET /api/v1/contests/:contestId/finance
    API->>FS: getFinanceSummary(contestId, actor)
    FS->>Repo: Authorize contest branch and load registrations/ledger
    Repo->>DB: SELECT contests + registrations + contest_ledger_entries
    FS-->>API: entry fees, other income, expenses, balance
    API-->>FE: 200 finance summary
    U->>FE: Record an income or expense entry
    FE->>API: POST /api/v1/contests/:contestId/ledger-entries
    API->>LS: createManualEntry(payload, actor)
    LS->>LS: Validate role, direction, amount and immutable source fields
    LS->>Repo: Save ledger entry with audit metadata
    Repo->>DB: INSERT contest_ledger_entries
    LS-->>API: created entry
    API-->>FE: 201 and refreshed summary
    FE-->>U: Display updated balance and history
```

## 4. Itemized Damage Charge, Customer Confirmation, and Additional Payment

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    actor C as Customer
    participant FE as Screen<br/>(StaffInspection / CheckoutSummary)
    participant API as API<br/>(Express / SessionController)
    participant IS as InspectionService
    participant PS as PaymentService<br/>(payment.service.ts)
    participant Repo as Repository<br/>(TypeORM)
    participant DB as Database<br/>(PostgreSQL)

    S->>FE: Enter damage items and unit prices
    FE->>API: POST /api/v1/staff/sessions/:id/inspections
    API->>IS: submitCheckoutInspection(damageItems)
    IS->>IS: Validate part, description, quantity and unit price
    IS->>Repo: Save inspection and replace damage line items
    Repo->>DB: INSERT inspection_reports + damage_line_items
    IS-->>API: checkout summary and total damage charge
    API-->>FE: 200 summary awaiting customer confirmation
    C->>FE: Confirm or dispute on site
    FE->>API: POST /api/v1/sessions/:id/inspection/confirm
    alt Customer confirms and outstanding amount exists
        API->>PS: createAdditionalPayment(session, damageTotal)
        PS->>Repo: Freeze additional payment snapshot
        Repo->>DB: INSERT payment_transactions
        PS-->>API: payment instructions
        API-->>FE: 200 PAYMENT_PENDING
    else Customer confirms with no outstanding amount
        API->>IS: completeCheckoutAndSettlement(session)
        IS->>Repo: Update session and settlement state
        Repo->>DB: Transactional UPDATE
        API-->>FE: 200 COMPLETED
    else Customer disputes
        API->>IS: recordDispute(session, note)
        IS->>Repo: Preserve evidence and escalate review
        Repo->>DB: UPDATE inspection/session dispute state
        API-->>FE: 200 DISPUTED
    end
```

## 5. Provider Custom Menu Category Management

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant FE as Screen<br/>(ProviderMenuPage)
    participant API as API<br/>(Express / MenuCategoryController)
    participant SVC as MenuCategoryService<br/>(menu-category.service.ts)
    participant Repo as Repository<br/>(TypeORM)
    participant DB as Database<br/>(PostgreSQL)

    P->>FE: Create, edit, reorder, or delete a category
    FE->>API: POST/PATCH/DELETE /api/v1/cafes/:cafeId/menu-categories
    API->>SVC: validate ownership and category command
    SVC->>Repo: Load cafe categories and linked menu items
    Repo->>DB: SELECT menu_categories + menu_items
    alt Create or update
        SVC->>SVC: Normalize name and enforce per-cafe uniqueness
        SVC->>Repo: Save category / display order
        Repo->>DB: INSERT/UPDATE menu_categories
        API-->>FE: 200/201 category
    else Delete empty category
        SVC->>Repo: Delete category
        Repo->>DB: DELETE menu_categories
        API-->>FE: 204
    else Delete category still in use
        SVC-->>API: Conflict with linked item count
        API-->>FE: 409 CATEGORY_IN_USE
    end
    FE-->>P: Refresh menu grouping
```

## 6. Class Diagram: Finance and Operations Update

```mermaid
classDiagram
    Cafe "1" --> "0..1" CafePaymentSettings
    Cafe "1" --> "0..*" BankTransaction
    PaymentTransaction "1" --> "0..*" BankTransaction
    Provider "1" --> "0..*" PaymentRequest
    SubscriptionPlan "1" --> "0..*" PaymentRequest
    Contest "1" --> "0..*" ContestLedgerEntry
    Session "1" --> "0..*" DamageLineItem
    Cafe "1" --> "0..*" MenuCategory
    MenuCategory "1" --> "0..*" MenuItem

    CafePaymentSettings : bank_code
    CafePaymentSettings : account_number
    CafePaymentSettings : payment_gateway
    BankTransaction : match_status
    BankTransaction : match_reason
    PaymentTransaction : payment_ref_code
    PaymentRequest : payos_order_code
    ContestLedgerEntry : direction
    ContestLedgerEntry : source_type
    DamageLineItem : quantity
    DamageLineItem : unit_price
    MenuCategory : display_order
```

## Reference

- `docs/spec/03-payment-engine.md`
- `docs/spec/04-inspection-flow.md`
- `docs/spec/05-api-contracts.md`
- `docs/spec/06-database.md`
- `specs/016-damage-charge-redesign/`
- `specs/017-custom-menu-categories/`
- `specs/018-contest-finance/`
- `specs/019-cafe-bank-payment/`
