# Sequence Flow: Revenue, Commission and Provider Payout

**Last updated**: 2026-06-04  
**Status**: Draft for mentor review  
**Related rules**: `docs/spec/business-rules/BR-revenue-payment-provider.md`

---

## 1. Settlement theo session và chi nhánh

```mermaid
sequenceDiagram
    autonumber
    actor StaffUser as Staff
    participant Staff as Screen<br/>(StaffCheckoutSummaryPage)
    participant API as API<br/>(Express / SessionController)
    participant S as SessionService<br/>(checkout handlers)
    participant PE as PaymentEngine<br/>(payment.service.ts)
    participant DB as Database<br/>(PostgreSQL - payment_components, transactions)
    participant R as ProviderDashboardService<br/>(provider-dashboard.service.ts)
    participant P as Screen<br/>(ProviderRevenuePage)
    StaffUser->>Staff: Confirm checkout and settlement

    Staff->>API: Confirm checkout complete
    API->>S: completeCheckout(sessionId)
    S->>PE: settle(sessionId)
    PE->>DB: Load session, booking, cafe, provider
    PE->>DB: Load payment_components
    PE->>DB: Calculate gross by component
    PE->>DB: Calculate platform_fee
    PE->>DB: Calculate net_provider_amount
    PE->>DB: Mark eligible components settled/disbursed pending payout
    PE-->>S: settlement summary
    P->>API: GET /api/v1/provider/dashboard/revenue
    API->>R: getRevenue(providerId, filters)
    R->>DB: SELECT settled components grouped by cafe/booking/session
    R-->>P: Provider sees provider total -> cafe -> booking -> session
```

---

## 2. Provider payout profile

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant FE as Screen<br/>(ProviderRevenuePage)
    participant API as API<br/>(Express / PaymentRequestController)
    participant SVC as PaymentRequestService<br/>(payment-request.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant AFE as Screen<br/>(AdminPaymentRequestsPage)
    actor A as Admin

    P->>FE: Submit payout profile
    FE->>API: POST /api/v1/provider/payment-requests
    API->>SVC: createPaymentRequest(providerId, payload)
    SVC->>DB: Save bank/payment reference info
    SVC->>DB: status = PENDING
    A->>AFE: Review payout profile/payment request
    AFE->>API: POST /api/v1/admin/payment-requests/:id/confirm or reject
    alt Approved
        API->>SVC: confirmRequest(id)
        SVC->>DB: status = CONFIRMED
        API-->>P: Payout enabled
    else Rejected
        API->>SVC: rejectRequest(id, reason)
        SVC->>DB: status = REJECTED
        API-->>P: Request correction
    end
```

---

## 3. Manual/mock payout Phase 1

```mermaid
sequenceDiagram
    autonumber
    participant Job as Settlement Job/Admin
    participant API as API<br/>(Express / AdminPaymentRequest routes)
    participant SVC as PaymentRequestService<br/>(payment-request.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant A as Screen<br/>(AdminPaymentsPage)
    participant Bank as Bank/Mock Transfer<br/>(manual Phase 1)
    participant P as Screen<br/>(ProviderRevenuePage)

    Job->>DB: Find completed sessions not paid out
    Job->>DB: Group by provider and cafe/period
    Job->>DB: Create settlement_batch READY
    A->>API: Review gross, commission, refund, net payout
    A->>Bank: Manual/mock transfer net payout
    A->>API: Enter transfer reference
    API->>SVC: markPaid(batchId, reference)
    SVC->>DB: settlement_batch READY -> PAID
    DB-->>P: Provider sees payout paid and item breakdown
```

---

## 4. Class Diagram: Revenue and Payout

```mermaid
classDiagram
    class StaffCheckoutSummaryPage {
        +completeCheckout()
    }
    class ProviderRevenuePage {
        +loadRevenue()
        +viewBreakdown()
    }
    class AdminPaymentRequestsPage {
        +confirmRequest()
        +rejectRequest()
    }
    class SessionController {
        +checkOut()
        +confirmInspection()
    }
    class PaymentRequestController {
        +create()
        +confirm()
        +reject()
        +list()
    }
    class PaymentService {
        +settle(sessionId)
        +calculatePlatformFee()
        +markComponentsSettled()
    }
    class ProviderDashboardService {
        +getRevenue()
        +groupByCafeBookingSession()
    }
    class PaymentRequestService {
        +createPaymentRequest()
        +confirmRequest()
        +rejectRequest()
    }
    class PaymentComponent
    class PaymentTransaction
    class PaymentRequest
    class Session
    class Booking
    class Cafe
    class ProviderProfile

    StaffCheckoutSummaryPage --> SessionController
    ProviderRevenuePage --> ProviderDashboardService
    AdminPaymentRequestsPage --> PaymentRequestController
    SessionController --> PaymentService
    PaymentRequestController --> PaymentRequestService
    PaymentService --> PaymentComponent
    PaymentService --> PaymentTransaction
    PaymentRequestService --> PaymentRequest
    ProviderProfile "1" --> "*" Cafe
    Cafe "1" --> "*" Booking
    Booking "1" --> "*" Session
    Session "1" --> "*" PaymentComponent
```

---

## 5. Dispute hold không block toàn provider

```mermaid
flowchart TD
    A[Session completed] --> B{Has unresolved damage/dispute?}
    B -->|No| C[Eligible for payout]
    B -->|Yes| D[Hold affected components only]
    C --> E[Settlement batch READY]
    D --> F[Incident/dispute resolution]
    F --> G{Provider wins?}
    G -->|Yes| H[Create/confirm damage charge]
    G -->|No| I[Waive damage/release hold]
    H --> C
    I --> C
```
