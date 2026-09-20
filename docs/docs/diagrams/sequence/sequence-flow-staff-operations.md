# Sequence Flow: Staff Operations

**Last updated:** 2026-08-06

Coverage theo controller: `staff`, `staff-invite`, `session`, `booking`, `upload`, `contest`, mot phan `vehicle`, `customer-package`, `notification`.

---

## 1. Staff Activation and Daily Workspace

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant ActScreen as Screen<br/>(StaffActivatePage)
    participant Dashboard as Screen<br/>(StaffDashboardPage / StaffTodayBookingsPage)
    participant InviteAPI as API<br/>(Express / StaffInviteController)
    participant StaffAPI as API<br/>(Express / StaffController)
    participant DB as Database<br/>(PostgreSQL)

    alt Activate account from invite
        S->>ActScreen: Open invite link
        ActScreen->>InviteAPI: GET /api/v1/auth/staff-invite/validate
        activate InviteAPI
        InviteAPI->>InviteAPI: validate token format
        InviteAPI->>DB: SELECT staff_invite_tokens
        alt Token invalid or expired
            InviteAPI-->>ActScreen: 400 TOKEN_INVALID_OR_EXPIRED
        else Token valid
        InviteAPI-->>ActScreen: token status + staff email
        end
        S->>ActScreen: Set password
        ActScreen->>InviteAPI: POST /api/v1/auth/staff-invite/activate
        InviteAPI->>InviteAPI: validate password policy + unused token
        alt Token already used
            InviteAPI-->>ActScreen: 409 TOKEN_ALREADY_USED
        else Activation allowed
        InviteAPI->>DB: UPDATE user password + activate assignment
        InviteAPI-->>ActScreen: access token + staff user
        end
        deactivate InviteAPI
    else Open daily workspace
        S->>Dashboard: Open staff dashboard
        Dashboard->>StaffAPI: GET /api/v1/staff/today-bookings
        activate StaffAPI
        StaffAPI->>StaffAPI: validate JWT + role STAFF + assigned cafe
        alt Staff disabled or unassigned
            StaffAPI-->>Dashboard: 403 STAFF_NOT_ACTIVE
        else Staff allowed
        StaffAPI->>DB: SELECT bookings for assigned cafes today
        Dashboard->>StaffAPI: GET /api/v1/staff/bookings
        StaffAPI->>StaffAPI: validate date filter
        StaffAPI->>DB: SELECT bookings by filters
        StaffAPI-->>Dashboard: booking queue
        end
        deactivate StaffAPI
    end
```

---

## 2. Walk-in Booking, Check-in and Session Detail

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant Today as Screen<br/>(StaffTodayBookingsPage)
    participant Detail as Screen<br/>(StaffSessionDetailPage)
    participant StaffAPI as API<br/>(Express / StaffController)
    participant BookingSvc as BookingService<br/>(booking.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Create walk-in booking
        S->>Today: Create walk-in booking
        Today->>StaffAPI: POST /api/v1/staff/bookings
        activate StaffAPI
        StaffAPI->>StaffAPI: validate cafe assignment, slot, play_mode, payment_method
        alt Invalid slot or payment method
            StaffAPI-->>Today: 400 WALK_IN_BOOKING_INVALID
        else Valid walk-in
        StaffAPI->>BookingSvc: createWalkInBooking()
        activate BookingSvc
        BookingSvc->>BookingSvc: compute price and immediate payment state
        BookingSvc->>DB: INSERT booking CONFIRMED + participants + optional vehicles
        BookingSvc-->>StaffAPI: booking summary
        deactivate BookingSvc
        StaffAPI-->>Today: booking ready for check-in
        end
        deactivate StaffAPI
    else Check-in booking
        S->>Today: Scan QR/code
        Today->>StaffAPI: POST /api/v1/staff/bookings/:bookingId/check-in
        activate StaffAPI
        StaffAPI->>StaffAPI: validate bookingId + staff cafe assignment
        StaffAPI->>DB: Validate staff cafe assignment + booking status/window
        alt Booking not CONFIRMED or outside check-in window
            StaffAPI-->>Today: 409 CHECK_IN_NOT_ALLOWED
        else Check-in allowed
        StaffAPI->>DB: INSERT session + session_participants + session_vehicles
        StaffAPI->>DB: UPDATE rental vehicles IN_USE
        StaffAPI-->>Today: sessionId
        end
        deactivate StaffAPI
    else Session detail
        S->>Detail: Open session
        Detail->>StaffAPI: GET /api/v1/staff/sessions/:sessionId
        StaffAPI->>DB: SELECT session, booking, vehicles, inspections, F&B, payments
        StaffAPI-->>Detail: operational session detail
    end
```

---

## 3. Inspection, Damage, Checkout and Customer Confirmation

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant Inspect as Screen<br/>(StaffInspectionPage)
    participant Checkout as Screen<br/>(StaffCheckoutSummaryPage)
    participant Customer as Screen<br/>(CustomerInspectionConfirmPage / CustomerDamageReviewPage)
    participant StaffAPI as API<br/>(Express / StaffController)
    participant SessionAPI as API<br/>(Express / SessionController)
    participant Pay as PaymentService<br/>(payment.service.ts)
    participant Store as Cloudinary
    participant DB as Database<br/>(PostgreSQL)

    S->>Inspect: Upload inspection photos/checklist
    Inspect->>Store: Upload image files
    Inspect->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/inspections
    activate StaffAPI
    StaffAPI->>StaffAPI: validate session state, required photos, checklist shape
    alt Missing photos or invalid session state
        StaffAPI-->>Inspect: 400/409 INSPECTION_INVALID
    else Inspection accepted
    StaffAPI->>DB: INSERT inspections + inspection_photos + checklist
    StaffAPI-->>Customer: Request customer confirmation
    end
    deactivate StaffAPI

    alt Customer confirms baseline/checkout
        Customer->>SessionAPI: POST /api/v1/sessions/:sessionId/inspection/confirm
        activate SessionAPI
        SessionAPI->>SessionAPI: validate customer owns booking + inspection pending
        alt Already confirmed or wrong customer
            SessionAPI-->>Customer: 403/409 INSPECTION_CONFIRM_INVALID
        else Confirmation accepted
        SessionAPI->>DB: UPDATE inspection confirmed
        SessionAPI->>DB: Move session CHECKED_IN -> ACTIVE or CHECKING_OUT -> COMPLETED
        SessionAPI-->>Customer: updated session
        end
        deactivate SessionAPI
    else Damage dispute
        S->>Checkout: Update damage items
        Checkout->>StaffAPI: PUT /api/v1/staff/sessions/:sessionId/inspections/:inspectionId/damage-items
        activate StaffAPI
        StaffAPI->>StaffAPI: validate line item parts/labor prices
        alt Invalid damage item
            StaffAPI-->>Checkout: 400 DAMAGE_ITEM_INVALID
        else Damage item accepted
        StaffAPI->>DB: UPSERT damage_line_items
        StaffAPI-->>Checkout: recalculated damage total
        end
        deactivate StaffAPI
        Customer->>SessionAPI: POST confirm/reject damage
        SessionAPI->>DB: Mark disputed or accepted
        S->>Checkout: Escalate dispute
        Checkout->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/escalate-dispute
        StaffAPI->>DB: INSERT incident/dispute record
    else Confirm checkout settlement
        S->>Checkout: Confirm checkout
        Checkout->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/confirm-checkout
        activate StaffAPI
        StaffAPI->>StaffAPI: validate checkout inspection confirmed or timeout elapsed
        alt Checkout not ready
            StaffAPI-->>Checkout: 409 CHECKOUT_NOT_READY
        else Ready to settle
        StaffAPI->>Pay: settle(sessionId)
        activate Pay
        Pay->>Pay: compute total charges, deposit offset, provider net
        Pay->>DB: INSERT/UPDATE payment_components + payment_transactions
        Pay-->>StaffAPI: settlement result
        deactivate Pay
        StaffAPI->>DB: UPDATE vehicles AVAILABLE + session COMPLETED
        StaffAPI-->>Checkout: completed session
        end
        deactivate StaffAPI
    end
```

---

## 4. F&B, Extensions, Packages and Pending Payments

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant Fnb as Screen<br/>(StaffFnbOrdersPage)
    participant Detail as Screen<br/>(StaffSessionDetailPage)
    participant Packages as Screen<br/>(StaffPackagesPage)
    participant StaffAPI as API<br/>(Express / StaffController)
    participant Customer as Screen<br/>(CustomerExtensionResponsePage)
    participant SessionAPI as API<br/>(Express / SessionController)
    participant DB as Database<br/>(PostgreSQL)

    alt F&B order queue
        S->>Fnb: View and update F&B orders
        Fnb->>StaffAPI: GET /api/v1/staff/fnb-orders
        StaffAPI->>DB: SELECT fnb_orders by cafe/status/date
        Fnb->>StaffAPI: PATCH /api/v1/staff/fnb-orders/:orderId
        StaffAPI->>DB: UPDATE fnb_order status
    else Add on-site F&B
        S->>Detail: Add session F&B
        Detail->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/fnb-orders
        StaffAPI->>DB: INSERT fnb_order ON_SITE + items
    else Extension proposal
        S->>Detail: Propose extension
        Detail->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/extensions
        activate StaffAPI
        StaffAPI->>StaffAPI: validate ACTIVE session + fee <= deposit guard
        alt Extension not allowed
            StaffAPI-->>Detail: 409 EXTENSION_NOT_ALLOWED
        else Extension proposal created
        StaffAPI->>DB: INSERT extension_proposal PENDING
        StaffAPI-->>Customer: Notify extension request
        end
        deactivate StaffAPI
        Customer->>SessionAPI: POST /api/v1/sessions/:sessionId/extensions/respond
        activate SessionAPI
        SessionAPI->>SessionAPI: validate proposal PENDING + within response window
        alt Proposal expired
            SessionAPI-->>Customer: 409 EXTENSION_EXPIRED
        else Response accepted
        SessionAPI->>DB: APPROVE/REJECT proposal and update session planned_end_at
        SessionAPI-->>Customer: updated session
        end
        deactivate SessionAPI
    else Package lookup and pending payment settlement
        S->>Packages: Lookup customer packages
        Packages->>StaffAPI: GET lookup/search/top-customers endpoints
        StaffAPI->>DB: SELECT customer_packages + usage
        S->>Detail: Settle pending payments/refund
        Detail->>StaffAPI: POST settle-pending-payments or confirm-refund
        StaffAPI->>DB: UPDATE payment state
    end
```

---

## 5. Maintenance, BYOC and Vehicle Swap

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant Maint as Screen<br/>(StaffMaintenancePage)
    participant Byoc as Screen<br/>(StaffByocPage)
    participant Detail as Screen<br/>(StaffSessionDetailPage)
    participant StaffAPI as API<br/>(Express / StaffController)
    participant VehicleAPI as API<br/>(Express / VehicleController)
    participant DB as Database<br/>(PostgreSQL)

    alt Maintenance logs
        S->>Maint: Create/update maintenance log
        Maint->>StaffAPI: GET/POST/PATCH /api/v1/staff/maintenance-logs
        StaffAPI->>DB: SELECT/INSERT/UPDATE maintenance logs
        StaffAPI->>DB: Optional update vehicle status MAINTENANCE/AVAILABLE
    else BYOC check-in support
        S->>Byoc: Record BYOC vehicle/facility baseline
        Byoc->>StaffAPI: POST check-in or inspections endpoints
        StaffAPI->>DB: INSERT session_vehicle vehicle_source BYOC
        StaffAPI->>DB: INSERT inspection baseline
    else Swap rental vehicle
        S->>Detail: Swap damaged/unavailable vehicle
        Detail->>StaffAPI: POST /api/v1/staff/sessions/:sessionId/swap-vehicle
        StaffAPI->>VehicleAPI: Validate replacement unit
        VehicleAPI->>DB: SELECT vehicle availability
        StaffAPI->>DB: UPDATE old vehicle status + session_vehicle replacement
    end
```

---

## 6. Staff Contest Event Day

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff
    participant ContestList as Screen<br/>(StaffContestsPage)
    participant CheckIn as Screen<br/>(StaffContestCheckInPage)
    participant Runtime as Screen<br/>(StaffContestRuntimePage)
    participant API as API<br/>(Express / ContestController)
    participant RuntimeSvc as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    S->>ContestList: Open assigned contests
    ContestList->>API: GET /api/v1/contests?assigned=true
    API->>DB: SELECT contests + staff assignments
    API-->>ContestList: assigned contest list

    S->>CheckIn: Lookup check-in code
    CheckIn->>API: GET /api/v1/contests/:contestId/registrations/lookup
    API->>DB: SELECT contest_registration
    S->>CheckIn: Confirm check-in
    CheckIn->>API: POST /api/v1/contest-registrations/:registrationId/check-in
    API->>DB: UPDATE registration CHECKED_IN

    S->>Runtime: Submit result/walkover/correction
    Runtime->>API: POST /api/v1/contest-matches/:matchId/results or walkover
    API->>RuntimeSvc: validate staff cafe assignment + result transition
    RuntimeSvc->>DB: UPDATE contest_match_participants + contest_matches
```

---

## 7. Class Diagram: Staff Operations

```mermaid
classDiagram
    class StaffActivatePage
    class StaffDashboardPage
    class StaffTodayBookingsPage
    class StaffSessionDetailPage
    class StaffInspectionPage
    class StaffCheckoutSummaryPage
    class StaffFnbOrdersPage
    class StaffPackagesPage
    class StaffMaintenancePage
    class StaffContestRuntimePage
    class StaffInviteController
    class StaffController
    class SessionController
    class ContestController
    class Booking
    class Session
    class Inspection
    class FnbOrder
    class ExtensionProposal
    class Vehicle
    class ContestRegistration
    class ContestMatch

    StaffActivatePage --> StaffInviteController
    StaffDashboardPage --> StaffController
    StaffTodayBookingsPage --> StaffController
    StaffSessionDetailPage --> StaffController
    StaffInspectionPage --> StaffController
    StaffCheckoutSummaryPage --> StaffController
    StaffFnbOrdersPage --> StaffController
    StaffPackagesPage --> StaffController
    StaffMaintenancePage --> StaffController
    StaffContestRuntimePage --> ContestController
    StaffController --> Booking
    Booking "1" --> "*" Session
    Session "1" --> "*" Inspection
    Session "1" --> "*" FnbOrder
    Session "1" --> "*" ExtensionProposal
    Session "1" --> "*" Vehicle
    ContestRegistration "*" --> "1" ContestMatch
```
