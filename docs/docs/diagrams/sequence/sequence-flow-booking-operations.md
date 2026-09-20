# Sequence Flow: Booking Operations

**Last updated**: 2026-06-04  
**Status**: Draft for business review  
**Related rules**: `docs/spec/business-rules/BR-booking-lifecycle.md`

Tai lieu nay tap trung vao luong van hanh tai quan sau khi booking da duoc tao:
quet ma check-in, vao san, order tai quan, gia han, check-out va settlement.

---

## 1. Happy path: Dat truoc + thue xe + check-in bang QR/code

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as Screen<br/>(CreateBookingPage)
    participant Staff as Screen<br/>(StaffTodayBookingsPage)
    participant API as API<br/>(Express / BookingController + SessionController)
    participant BS as BookingService<br/>(booking.service.ts)
    participant SS as SessionService<br/>(session.controller.ts handlers)
    participant DB as Database<br/>(PostgreSQL)
    participant Pay as PaymentEngine<br/>(payment.service.ts)
    participant Store as Cloudinary<br/>(UploadController)

    C->>FE: Select cafe, track, slot, rental vehicles, and optional F&B
    FE->>API: POST /api/v1/bookings
    API->>BS: createBooking(payload, customerId)
    BS->>DB: Check cafe ACTIVE, slot, vehicle availability
    BS->>DB: INSERT Booking PENDING + participants + booking_vehicles
    BS->>Pay: Create payment intent / hold deposit
    C->>Pay: Pay within 30 minutes
    Pay-->>API: Payment confirmed
    API->>BS: confirmPayment(bookingId)
    BS->>DB: Booking PENDING -> CONFIRMED

    C->>Staff: Present QR code at the counter
    Staff->>API: POST /api/v1/sessions/check-in
    API->>SS: validate code + open session
    SS->>DB: Validate booking CONFIRMED, cafe, time window, staff assignment
    SS->>DB: INSERT Session CHECKED_IN
    SS->>DB: INSERT session_participants + session_vehicles
    SS->>DB: Vehicle AVAILABLE -> IN_USE

    Staff->>Store: Upload 4 check-in photos per vehicle
    Staff->>API: POST /api/v1/sessions/:id/inspection/check-in
    API->>SS: submit check-in checklist
    SS->>DB: INSERT CHECK_IN inspection evidence
    API-->>FE: Request baseline confirmation
    C->>FE: Confirm baseline
    FE->>API: POST /api/v1/sessions/:id/inspection/confirm
    API->>SS: confirm baseline
    SS->>DB: Session CHECKED_IN -> ACTIVE
    API-->>Staff: Allow customer to enter the track
```

---

## 2. Trong session: order F&B tai quan

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant Staff as Screen<br/>(StaffFnbOrdersPage)
    participant API as API<br/>(Express / SessionController)
    participant SS as SessionService<br/>(session flow)
    participant DB as Database<br/>(PostgreSQL)

    C->>Staff: Goi them do an/do uong
    Staff->>API: POST /api/v1/sessions/:id/fnb-orders
    API->>SS: createOnSiteFnbOrder(sessionId, items)
    SS->>DB: Validate Session ACTIVE
    SS->>DB: INSERT FnbOrder ON_SITE + items snapshot
    Staff->>C: Giao mon
    C->>Staff: Tra tien truc tiep cho quan
    Staff->>API: PATCH /api/v1/sessions/:id/fnb-orders/:orderId
    API->>SS: markDelivered(orderId)
    SS->>DB: FnbOrder status -> DELIVERED
```

Note: F&B on-site khong di qua platform payment gateway va khong tinh platform fee.

---

## 3. Trong session: gia han gio choi

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    actor Customer as Customer
    participant Staff as Screen<br/>(StaffSessionDetailPage)
    participant API as API<br/>(Express / SessionController)
    participant SS as SessionService<br/>(extension handlers)
    participant DB as Database<br/>(PostgreSQL)
    participant C as Screen<br/>(CustomerExtensionResponsePage)

    S->>Staff: Propose a session extension
    Staff->>API: POST /api/v1/sessions/:id/extensions
    API->>SS: proposeExtension(sessionId, minutes)
    SS->>DB: Validate Session ACTIVE
    SS->>DB: Check total extension fee <= 50% security deposit
    alt Allowed
        SS->>DB: Session ACTIVE -> EXTENDING
        SS->>DB: INSERT ExtensionProposal PENDING
        API-->>C: Notify extension proposal
        alt Customer approves
            Customer->>C: Accept the extension
            C->>API: POST /api/v1/sessions/extensions/:id/approve
            API->>SS: approveExtension(proposalId)
            SS->>DB: INSERT PaymentComponent EXTENSION_FEE
            SS->>DB: Update session.planned_end_at
            SS->>DB: Proposal APPROVED
            SS->>DB: Session EXTENDING -> ACTIVE
        else Customer rejects or timeout 10 minutes
            SS->>DB: Proposal REJECTED/EXPIRED
            SS->>DB: Session EXTENDING -> ACTIVE
        end
    else Not allowed
        API-->>Staff: EXTENSION_NOT_ALLOWED
    end
```

---

## 4. Check-out: khong damage

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    actor Customer as Customer
    participant Staff as Screen<br/>(StaffCheckoutSummaryPage)
    participant API as API<br/>(Express / SessionController)
    participant SS as SessionService<br/>(checkout handlers)
    participant DB as Database<br/>(PostgreSQL)
    participant Store as Cloudinary<br/>(UploadController)
    participant C as Screen<br/>(CustomerInspectionConfirmPage)
    participant Pay as PaymentEngine<br/>(payment.service.ts)

    S->>Staff: Start checkout and record damage
    Staff->>API: POST /api/v1/sessions/:id/check-out
    API->>SS: beginCheckout(sessionId)
    SS->>DB: Session ACTIVE -> CHECKING_OUT
    Staff->>Store: Upload 4 check-out photos per vehicle
    Staff->>API: Submit check-out checklist, no damage
    SS->>DB: INSERT CHECK_OUT inspection evidence
    API-->>C: Request checkout confirmation
    C->>API: POST /api/v1/sessions/:id/inspection/confirm
    API->>SS: confirm checkout or 2h timeout
    SS->>Pay: settle(sessionId)
    Pay->>DB: Capture checkout amount = total charges - deposit
    Pay->>DB: Disburse eligible components
    SS->>DB: Vehicle IN_USE -> AVAILABLE
    SS->>DB: Session CHECKING_OUT -> COMPLETED
    SS->>DB: If all sessions completed, Booking -> COMPLETED
```

---

## 5. Check-out: co damage hoac customer phan doi

```mermaid
sequenceDiagram
    autonumber
    participant Staff as Screen<br/>(StaffCheckoutSummaryPage)
    participant API as API<br/>(Express / SessionController)
    participant SS as SessionService<br/>(damage checkout)
    participant DB as Database<br/>(PostgreSQL)
    participant Store as Cloudinary<br/>(UploadController)
    participant C as Screen<br/>(CustomerDamageReviewPage)
    participant Pay as PaymentEngine<br/>(payment.service.ts)
    participant Admin as Screen<br/>(AdminDisputesPage or ProviderSessionsPage)

    Staff->>API: POST /api/v1/sessions/:id/check-out
    API->>SS: beginCheckout(sessionId)
    SS->>DB: Session ACTIVE -> CHECKING_OUT
    Staff->>Store: Upload check-out photos
    Staff->>API: Submit checklist + damage estimate
    SS->>DB: INSERT CHECK_OUT inspection evidence
    SS->>DB: Calculate damage_charge = estimate * damage_multiplier
    API-->>C: Send damage evidence
    alt Customer confirms or 24h timeout
        Customer->>C: Confirm evidence and charges
        SS->>DB: INSERT PaymentComponent DAMAGE_CHARGE
        SS->>Pay: settle(sessionId)
        Pay->>DB: Capture/settle according to components
        SS->>DB: Session CHECKING_OUT -> COMPLETED
    else Customer disputes
        Customer->>C: Submit a dispute
        SS->>DB: INSERT Incident or Dispute
        Admin->>API: Resolve policy result
        API->>DB: Incident RESOLVED/WAIVED
        opt final_amount > 0
            API->>DB: INSERT PaymentComponent DAMAGE_CHARGE
        end
        API->>Pay: settle(sessionId)
        SS->>DB: Session CHECKING_OUT -> COMPLETED
    end
```

---

## 6. BYOC/MIXED check-in difference

```mermaid
sequenceDiagram
    autonumber
    participant Staff as Screen<br/>(StaffByocPage)
    participant API as API<br/>(Express / SessionController)
    participant SS as SessionService<br/>(BYOC check-in)
    participant DB as Database<br/>(PostgreSQL)
    participant Store as Cloudinary<br/>(UploadController)
    actor C as Customer

    Staff->>API: POST /api/v1/sessions/check-in
    API->>SS: scan booking code
    SS->>DB: Validate Booking CONFIRMED and BYOC/MIXED capacity
    SS->>DB: INSERT Session CHECKED_IN
    Staff->>API: Select/create CustomerVehicle
    SS->>DB: INSERT session_vehicle vehicle_source=BYOC
    opt MIXED also has rental vehicles
        SS->>DB: INSERT rental session_vehicles
        SS->>DB: Rental vehicles -> IN_USE
    end
    Staff->>Store: Upload BYOC photos and optional facility baseline
    Staff->>API: Submit BYOC safety checklist
    SS->>DB: INSERT CHECK_IN inspection evidence
    C->>API: Confirm baseline or timeout
    API->>SS: confirm baseline
    SS->>DB: Session CHECKED_IN -> ACTIVE
```

---

## 7. Class Diagram: Booking Operations

```mermaid
classDiagram
    class CreateBookingPage {
        +selectCafeSlot()
        +submitBooking()
    }
    class StaffTodayBookingsPage {
        +scanQrCode()
        +openSession()
    }
    class StaffInspectionPage {
        +uploadEvidence()
        +submitChecklist()
    }
    class CustomerInspectionConfirmPage {
        +confirmBaseline()
        +confirmCheckout()
        +disputeDamage()
    }
    class BookingController {
        +create()
        +checkout()
        +cancel()
    }
    class SessionController {
        +checkIn()
        +submitInspection()
        +confirmInspection()
        +proposeExtension()
        +checkOut()
    }
    class BookingService {
        +createBooking()
        +transition()
        +completeIfAllSessionsDone()
    }
    class PaymentService {
        +createPayment()
        +settle()
        +recordComponent()
    }
    class Booking
    class Session
    class Inspection
    class InspectionPhoto
    class SessionVehicle
    class ExtensionProposal
    class PaymentComponent
    class FnbOrder

    CreateBookingPage --> BookingController
    StaffTodayBookingsPage --> SessionController
    StaffInspectionPage --> SessionController
    CustomerInspectionConfirmPage --> SessionController
    BookingController --> BookingService
    SessionController --> BookingService
    SessionController --> PaymentService
    Booking "1" --> "*" Session
    Session "1" --> "*" SessionVehicle
    Session "1" --> "*" Inspection
    Inspection "1" --> "*" InspectionPhoto
    Session "1" --> "*" ExtensionProposal
    Session "1" --> "*" PaymentComponent
    Session "1" --> "*" FnbOrder
```
