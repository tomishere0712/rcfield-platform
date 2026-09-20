# Sequence Flow: Customer and Public Operations

**Last updated:** 2026-08-06

Coverage theo controller: `auth`, `cafe`, `featured-popup`, `favorite`, `review`, `customer-package`, `booking`, `session`, `vnpay`, `contest`, `racing-network`, `notification`, `chat`, `vehicle`.

---

## 1. Public Home, Explore, Cafe Detail and Featured Popup

```mermaid
sequenceDiagram
    autonumber
    actor U as Visitor / Customer
    participant Home as Screen<br/>(LandingPage)
    participant Explore as Screen<br/>(ExplorePage)
    participant CafeDetail as Screen<br/>(CafeDetailPage)
    participant PopupAPI as API<br/>(Express / FeaturedPopupController)
    participant CafeAPI as API<br/>(Express / CafeController)
    participant MenuAPI as API<br/>(Express / MenuController)
    participant PriceAPI as API<br/>(Express / PricingController)
    participant ReviewAPI as API<br/>(Express / ReviewController)
    participant DB as Database<br/>(PostgreSQL)

    U->>Home: Open public site
    Home->>PopupAPI: GET /api/v1/explore/featured-popup
    activate PopupAPI
    PopupAPI->>PopupAPI: validate active window + audience
    PopupAPI->>DB: SELECT active featured popup
    alt No active popup
        PopupAPI-->>Home: 204 or empty payload
    else Popup active
        PopupAPI-->>Home: popup content
    end
    deactivate PopupAPI
    Home->>CafeAPI: GET /api/v1/cafes
    activate CafeAPI
    CafeAPI->>CafeAPI: normalize public filters
    CafeAPI->>DB: SELECT active cafes + images + ratings
    CafeAPI-->>Home: featured cafe list
    deactivate CafeAPI

    U->>Explore: Search/filter cafes
    Explore->>CafeAPI: GET /api/v1/cafes?filters
    activate CafeAPI
    CafeAPI->>CafeAPI: validate query params and optional user token
    CafeAPI->>DB: SELECT cafes by city, track type, amenities, favorite state
    CafeAPI-->>Explore: cafe cards
    deactivate CafeAPI

    U->>CafeDetail: Open cafe
    CafeDetail->>CafeAPI: GET /api/v1/cafes/:cafeId
    activate CafeAPI
    CafeAPI->>CafeAPI: validate cafeId UUID + public visibility
    alt Cafe not found or inactive
        CafeAPI-->>CafeDetail: 404 CAFE_NOT_FOUND
    else Cafe visible
    CafeAPI->>DB: SELECT cafe detail + images + track configs
    CafeAPI-->>CafeDetail: cafe detail
    end
    deactivate CafeAPI
    CafeDetail->>MenuAPI: GET /api/v1/cafes/:cafeId/menu and popular
    MenuAPI->>DB: SELECT menu categories/items
    CafeDetail->>PriceAPI: GET /api/v1/cafes/:cafeId/pricing-preview
    PriceAPI->>DB: SELECT pricing rules + holidays
    CafeDetail->>ReviewAPI: GET /api/v1/cafes/:cafeId/reviews
    ReviewAPI->>DB: SELECT visible reviews
```

---

## 2. Auth, Profile, Favorites and Notifications

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant Auth as Screen<br/>(LoginPage / RegisterPage / ForgotPasswordPage / ResetPasswordPage)
    participant Profile as Screen<br/>(CustomerProfilePage / ProfilePage)
    participant Explore as Screen<br/>(ExplorePage / CafeDetailPage)
    participant Bell as Component<br/>(NotificationBell)
    participant AuthAPI as API<br/>(Express / AuthController)
    participant FavoriteAPI as API<br/>(Express / FavoriteController)
    participant NotifyAPI as API<br/>(Express / NotificationController)
    participant AuthSvc as AuthService<br/>(auth.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Redis as Cache<br/>(Redis)

    alt Login/register/reset password
        C->>Auth: Submit auth form
        Auth->>AuthAPI: POST /api/v1/auth/login/register/forgot-password/reset-password
        activate AuthAPI
        AuthAPI->>AuthAPI: validate body schema + rate limit
        alt Invalid payload or locked account
            AuthAPI-->>Auth: 400 VALIDATION_ERROR or 429 TOO_MANY_ATTEMPTS
        else Payload accepted
        AuthAPI->>AuthSvc: auth action
        activate AuthSvc
        AuthSvc->>AuthSvc: hash/compare password or build reset token
        AuthSvc->>Redis: brute-force or refresh-token support
        AuthSvc->>DB: SELECT/INSERT/UPDATE users and reset tokens
        AuthSvc-->>AuthAPI: auth result
        deactivate AuthSvc
        AuthAPI-->>Auth: user/tokens or reset status
        end
        deactivate AuthAPI
    else Profile
        C->>Profile: Update profile/passport settings
        Profile->>AuthAPI: GET/PATCH /api/v1/auth/me
        AuthAPI->>DB: SELECT/UPDATE users
    else Favorite cafes
        C->>Explore: Add/remove/sync favorite
        Explore->>FavoriteAPI: GET/POST/DELETE /api/v1/customer/favorites
        FavoriteAPI->>DB: SELECT/INSERT/DELETE favorites
    else Notifications
        Bell->>NotifyAPI: GET /api/v1/notifications
        NotifyAPI->>DB: SELECT notifications
        C->>Bell: Mark read
        Bell->>NotifyAPI: PUT /api/v1/notifications/:id/read or read-all
        NotifyAPI->>DB: UPDATE notifications.read_at
    end
```

---

## 3. Booking, Payment, QR and Active Session Response

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant BookCreate as Screen<br/>(CreateBookingPage)
    participant Detail as Screen<br/>(BookingDetailPage / CustomerBookingsPage)
    participant PayResult as Screen<br/>(PaymentResultPage)
    participant Session as Screen<br/>(CustomerActiveSessionPage / CustomerInspectionConfirmPage)
    participant BookingAPI as API<br/>(Express / BookingController)
    participant SessionAPI as API<br/>(Express / SessionController)
    participant VnpayAPI as API<br/>(Express / VnpayController)
    participant BookingSvc as BookingService<br/>(booking.service.ts)
    participant PaySvc as PaymentService<br/>(payment.service.ts)
    participant VNPay as Third-party<br/>(VNPay)
    participant DB as Database<br/>(PostgreSQL)

    C->>BookCreate: Select cafe, track, slot, vehicles, F&B, promo, package
    BookCreate->>BookingAPI: POST /api/v1/bookings
    activate BookingAPI
    BookingAPI->>BookingAPI: validate create booking schema + customer role
    alt Invalid request body
        BookingAPI-->>BookCreate: 400 VALIDATION_ERROR
    else Request body valid
    BookingAPI->>BookingSvc: createBooking(payload)
    activate BookingSvc
    BookingSvc->>BookingSvc: compute slot window, participant count, price snapshot
    BookingSvc->>DB: Validate cafe/slot/vehicle/package/promotion
    alt Cafe inactive, slot unavailable, vehicle locked, package invalid
        BookingSvc-->>BookingAPI: 409 BOOKING_CONSTRAINT_FAILED
        BookingAPI-->>BookCreate: 409 error
    else Availability valid
    BookingSvc->>DB: INSERT booking, participants, booking_vehicles, fnb_order
    BookingSvc-->>BookingAPI: booking PENDING
    end
    deactivate BookingSvc
    BookingAPI-->>BookCreate: booking PENDING
    end
    deactivate BookingAPI

    C->>BookCreate: Start checkout
    BookCreate->>BookingAPI: POST /api/v1/bookings/:id/checkout
    activate BookingAPI
    BookingAPI->>BookingAPI: validate booking owner + status PENDING/AWAITING_PAYMENT
    alt Checkout not allowed
        BookingAPI-->>BookCreate: 409 CHECKOUT_NOT_ALLOWED
    else Checkout allowed
    BookingAPI->>PaySvc: create checkout transaction
    activate PaySvc
    PaySvc->>PaySvc: freeze payment snapshot + compute amount
    PaySvc->>DB: INSERT payment_transaction
    PaySvc-->>BookingAPI: paymentUrl
    deactivate PaySvc
    BookingAPI-->>BookCreate: paymentUrl
    end
    deactivate BookingAPI
    BookCreate->>VNPay: Redirect customer
    VNPay->>VnpayAPI: GET /api/v1/payments/vnpay/ipn
    activate VnpayAPI
    VnpayAPI->>VnpayAPI: verify secure hash + response code
    alt Invalid signature or failed payment
        VnpayAPI-->>VNPay: 200 acknowledged, transaction failed/ignored
    else Paid successfully
    VnpayAPI->>PaySvc: confirm transaction
    PaySvc->>DB: UPDATE booking CONFIRMED + payment_transaction PAID
    VnpayAPI-->>VNPay: 200 OK
    end
    deactivate VnpayAPI
    VNPay-->>PayResult: GET /api/v1/payments/vnpay/return

    alt Booking detail/QR/cancel
        C->>Detail: View booking or QR
        Detail->>BookingAPI: GET /api/v1/bookings/:id and /:id/qr
        BookingAPI->>DB: SELECT booking detail + QR payload
        C->>Detail: Cancel booking
        Detail->>BookingAPI: POST /api/v1/bookings/:id/cancel
        activate BookingAPI
        BookingAPI->>BookingAPI: validate owner/provider role + cancellable status
        alt Cancel not allowed
            BookingAPI-->>Detail: 409 BOOKING_CANCEL_NOT_ALLOWED
        else Cancel allowed
        BookingAPI->>BookingSvc: cancelBooking()
        activate BookingSvc
        BookingSvc->>BookingSvc: compute refund policy by slot time/payment state
        BookingSvc->>DB: UPDATE booking CANCELLED + refund components when eligible
        BookingSvc-->>BookingAPI: cancelled booking
        deactivate BookingSvc
        BookingAPI-->>Detail: cancelled booking
        end
        deactivate BookingAPI
    else Active session response
        C->>Session: Confirm inspection or extension
        Session->>SessionAPI: POST /api/v1/sessions/:sessionId/inspection/confirm
        SessionAPI->>DB: UPDATE inspection/session state
        Session->>SessionAPI: POST /api/v1/sessions/:sessionId/extensions/respond
        SessionAPI->>DB: UPDATE extension_proposal and session planned_end_at
    end
```

---

## 4. Customer Packages, Reviews and Damage Review

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant Packages as Screen<br/>(CustomerPackagesPage)
    participant Reviews as Screen<br/>(CustomerReviewsPage / ReviewFormModal)
    participant Damage as Screen<br/>(CustomerDamageReviewPage)
    participant PackageAPI as API<br/>(Express / CustomerPackageController)
    participant ReviewAPI as API<br/>(Express / ReviewController)
    participant SessionAPI as API<br/>(Express / SessionController)
    participant PaySvc as PaymentService<br/>(payment.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Package purchase/list/usage/repay
        C->>Packages: Open packages
        Packages->>PackageAPI: GET /api/v1/customers/me/packages
        PackageAPI->>DB: SELECT customer_packages + usage
        C->>Packages: Purchase package
        Packages->>PackageAPI: POST /api/v1/cafes/:cafeId/packages/:packageId/purchase
        activate PackageAPI
        PackageAPI->>PackageAPI: validate customer role + package active + cafe match
        alt Package unavailable
            PackageAPI-->>Packages: 404 PACKAGE_NOT_FOUND
        else Package available
        PackageAPI->>PaySvc: create package payment when needed
        activate PaySvc
        PaySvc->>PaySvc: compute package payment amount
        PaySvc->>DB: INSERT payment transaction + customer_package
        PaySvc-->>PackageAPI: package purchase result
        deactivate PaySvc
        PackageAPI-->>Packages: customer package or payment URL
        end
        deactivate PackageAPI
        Packages->>PackageAPI: GET usage or POST repay
        PackageAPI->>DB: SELECT usage history or create repay transaction
    else Review flow
        C->>Reviews: View pending reviews
        Reviews->>ReviewAPI: GET /api/v1/customer/reviews/pending
        ReviewAPI->>DB: SELECT completed bookings without review
        C->>Reviews: Submit/dismiss review
        Reviews->>ReviewAPI: POST /api/v1/customer/reviews or /:bookingId/dismiss
        activate ReviewAPI
        ReviewAPI->>ReviewAPI: validate completed booking + no duplicate review
        alt Not eligible or duplicate
            ReviewAPI-->>Reviews: 409 REVIEW_NOT_ALLOWED
        else Review accepted
        ReviewAPI->>DB: INSERT review or dismissed reminder
        ReviewAPI-->>Reviews: updated review state
        end
        deactivate ReviewAPI
    else Damage review
        C->>Damage: Open damage evidence
        Damage->>SessionAPI: GET /api/v1/sessions/:sessionId
        SessionAPI->>DB: SELECT inspection photos + damage items
        C->>Damage: Accept/dispute damage
        Damage->>SessionAPI: POST inspection confirm
        activate SessionAPI
        SessionAPI->>SessionAPI: validate customer owns session + damage response window
        alt Response window expired
            SessionAPI-->>Damage: 409 DAMAGE_RESPONSE_EXPIRED
        else Response accepted
        SessionAPI->>DB: UPDATE damage acceptance/dispute state
        SessionAPI-->>Damage: updated session state
        end
        deactivate SessionAPI
    end
```

---

## 5. Customer Contest, Rental/BYOC Registration and Racing Network

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant ContestList as Screen<br/>(PublicContestsPage / ContestDiscoveryRail)
    participant ContestDetail as Screen<br/>(PublicContestDetailPage / ContestRegistrationPanel)
    participant MyRegs as Screen<br/>(CustomerContestRegistrationsPage)
    participant Passport as Screen<br/>(CustomerProfilePage / PublicGlobalLeaderboardPage)
    participant ContestAPI as API<br/>(Express / ContestController)
    participant RacingAPI as API<br/>(Express / RacingNetworkController)
    participant BookingAPI as API<br/>(Express / BookingController)
    participant DB as Database<br/>(PostgreSQL)

    alt Discover contest
        C->>ContestList: Browse contests
        ContestList->>ContestAPI: GET /api/v1/contests
        ContestAPI->>DB: SELECT OPEN/PUBLISHED contests
        C->>ContestDetail: Open contest detail
        ContestDetail->>ContestAPI: GET /api/v1/contests/:contestId + matches
        ContestAPI->>DB: SELECT contest, registrations, matches, leaderboard snapshot
    else Register rental/BYOC
        C->>ContestDetail: Select rental or BYOC
        ContestDetail->>ContestAPI: GET rental-options / available-rental-vehicles
        ContestAPI->>DB: SELECT eligible booking slots and vehicles
        opt Rental booking required
            ContestDetail->>BookingAPI: POST /api/v1/bookings/contest-rental
            BookingAPI->>DB: INSERT contest rental booking + booking_vehicles
        end
        ContestDetail->>ContestAPI: POST /api/v1/contests/:contestId/register
        activate ContestAPI
        ContestAPI->>ContestAPI: validate contest OPEN, capacity, vehicle policy, active ban
        alt Registration blocked
            ContestAPI-->>ContestDetail: 409 CONTEST_REGISTRATION_INVALID
        else Registration accepted
        ContestAPI->>DB: INSERT contest_registration PENDING/CONFIRMED
        ContestAPI-->>ContestDetail: registration state
        end
        ContestDetail->>ContestAPI: POST create-entry-fee-payment when fee required
        ContestAPI->>ContestAPI: validate registration requires entry fee
        ContestAPI->>DB: INSERT contest fee transaction
        deactivate ContestAPI
    else My registrations
        C->>MyRegs: View registrations
        MyRegs->>ContestAPI: GET /api/v1/me/contest-registrations
        ContestAPI->>DB: SELECT registrations + contest state
        C->>MyRegs: Cancel or update BYOC declaration
        MyRegs->>ContestAPI: POST cancel or PATCH byoc-declaration
        activate ContestAPI
        ContestAPI->>ContestAPI: validate owner + registration status
        alt Registration locked by event state
            ContestAPI-->>MyRegs: 409 REGISTRATION_NOT_EDITABLE
        else Update accepted
        ContestAPI->>DB: UPDATE contest_registrations
        ContestAPI-->>MyRegs: updated registration
        end
        deactivate ContestAPI
    else Racing network
        C->>Passport: View/update passport and leaderboard
        Passport->>RacingAPI: GET /api/v1/me/driver-passport
        RacingAPI->>DB: SELECT race_records + achievements + driver profile
        Passport->>RacingAPI: PATCH /api/v1/me/driver-passport
        RacingAPI->>DB: UPDATE public handle/avatar/bio settings
        Passport->>RacingAPI: GET /api/v1/leaderboards/global
        RacingAPI->>DB: SELECT global ranking
    end
```

---

## 6. Chat Widget and Full Page Chat

```mermaid
sequenceDiagram
    autonumber
    actor U as Visitor / Customer
    participant Widget as Component<br/>(ChatWidget)
    participant FullPage as Screen<br/>(CafeFullPageChatPage)
    participant API as API<br/>(Express / ChatController)
    participant ChatSvc as ChatService<br/>(chat.service.ts)
    participant KbSvc as KbService<br/>(kb.service.ts)
    participant NLU as Service<br/>(NLU FastAPI)
    participant Gemini as Third-party<br/>(Gemini)
    participant DB as Database<br/>(PostgreSQL)

    U->>Widget: Ask cafe question
    Widget->>API: POST /api/v1/cafes/:cafeId/chat/stream
    API->>ChatSvc: ragChatStream(cafeId, message)
    ChatSvc->>NLU: classify intent
    ChatSvc->>KbSvc: retrieve cafe KB chunks
    KbSvc->>DB: SELECT kb_chunks by embedding
    ChatSvc->>Gemini: generate response/tool call
    Gemini-->>ChatSvc: streamed tokens
    ChatSvc-->>Widget: SSE chunks

    U->>FullPage: Open full chat page
    FullPage->>API: GET /api/v1/cafes/:cafeId/chat/config
    API->>DB: SELECT cafe_widget_config
```

---

## 7. Class Diagram: Customer and Public Operations

```mermaid
classDiagram
    class LandingPage
    class ExplorePage
    class CafeDetailPage
    class LoginPage
    class CustomerProfilePage
    class CreateBookingPage
    class BookingDetailPage
    class CustomerPackagesPage
    class CustomerReviewsPage
    class PublicContestDetailPage
    class CustomerContestRegistrationsPage
    class ChatWidget
    class CafeController
    class AuthController
    class BookingController
    class SessionController
    class CustomerPackageController
    class ReviewController
    class FavoriteController
    class ContestController
    class RacingNetworkController
    class ChatController
    class User
    class Cafe
    class Booking
    class Session
    class CustomerPackage
    class Review
    class Favorite
    class ContestRegistration
    class RaceRecord

    LandingPage --> CafeController
    ExplorePage --> CafeController
    CafeDetailPage --> CafeController
    LoginPage --> AuthController
    CustomerProfilePage --> AuthController
    CreateBookingPage --> BookingController
    BookingDetailPage --> BookingController
    CustomerPackagesPage --> CustomerPackageController
    CustomerReviewsPage --> ReviewController
    PublicContestDetailPage --> ContestController
    CustomerContestRegistrationsPage --> ContestController
    ChatWidget --> ChatController
    User "1" --> "*" Booking
    User "1" --> "*" CustomerPackage
    User "1" --> "*" Review
    User "1" --> "*" Favorite
    User "1" --> "*" ContestRegistration
    User "1" --> "*" RaceRecord
    Cafe "1" --> "*" Booking
    Booking "1" --> "*" Session
```
