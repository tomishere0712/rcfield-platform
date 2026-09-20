# Sequence Flow: Admin Operations

**Last updated:** 2026-08-06

Coverage theo controller: `admin-dashboard`, `provider-onboarding` qua admin routes, `payment-request`, `admin-subscription-plan`, `admin-amenity`, `admin-track-type`, `admin-feature-flags`, `featured-popup`, `contest-fee`, mot phan `cafe`, `chat/kb`, `notification`.

---

## 1. Admin Dashboard and System Summary

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant Screen as Screen<br/>(AdminDashboardPage)
    participant API as API<br/>(Express / AdminDashboardController)
    participant Service as AdminDashboardService<br/>(admin-dashboard.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    A->>Screen: Open dashboard
    Screen->>API: GET /api/v1/admin/dashboard/summary
    activate API
    API->>API: validate JWT + role ADMIN
    alt Not admin
        API-->>Screen: 403 FORBIDDEN
    else Admin allowed
    API->>Service: getSummary()
    activate Service
    Service->>Service: build reporting date windows
    Service->>DB: COUNT users, providers, cafes, bookings, revenue
    DB-->>Service: aggregate rows
    Service-->>API: summary cards + charts
    deactivate Service
    API-->>Screen: 200 { summary }
    end
    deactivate API
    Screen-->>A: Render KPI overview
```

---

## 2. Provider Review, Detail, Suspension and Impersonation

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant List as Screen<br/>(AdminProvidersPage)
    participant Detail as Screen<br/>(AdminProviderDetailPage)
    participant API as API<br/>(Express / ProviderOnboardingController)
    participant Service as ProviderOnboardingService<br/>(provider-onboarding.service.ts)
    participant Notify as NotificationService<br/>(notification.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    A->>List: Filter pending/active/suspended providers
    List->>API: GET /api/v1/admin/providers?status=...
    activate API
    API->>API: validate query params + ADMIN role
    API->>Service: getProviders(filters)
    activate Service
    Service->>DB: SELECT users + provider_profiles + subscriptions
    DB-->>Service: provider rows
    Service-->>API: paginated providers
    deactivate Service
    API-->>List: paginated providers

    A->>Detail: Open provider detail
    Detail->>API: GET /api/v1/admin/providers/:id
    API->>API: validate provider id UUID
    alt Provider not found
        API-->>Detail: 404 NOT_FOUND
    else Provider exists
    API->>Service: getProviderDetail(id)
    Service->>DB: SELECT provider profile, cafes, subscription, KYC docs
    API-->>Detail: provider detail
    end

    alt Approve
        A->>Detail: Approve provider
        Detail->>API: POST /api/v1/admin/providers/:id/approve
        API->>API: validate provider PENDING
        alt Already processed
            API-->>Detail: 400 ALREADY_PROCESSED
        else Can approve
        API->>Service: approveProvider(id)
        activate Service
        Service->>DB: BEGIN TRANSACTION
        Service->>DB: UPDATE provider_profiles ACTIVE
        Service->>DB: INSERT provider_subscriptions TRIAL + first cafe
        Service->>DB: COMMIT TRANSACTION
        Service->>Notify: ACCOUNT_APPROVED
        Service-->>API: approved provider
        deactivate Service
        API-->>Detail: 200 approved
        end
    else Reject
        A->>Detail: Reject with reason
        Detail->>API: POST /api/v1/admin/providers/:id/reject
        API->>API: validate reason + provider PENDING
        API->>Service: rejectProvider(id, reason)
        Service->>DB: UPDATE provider_profiles REJECTED
        Service->>Notify: ACCOUNT_REJECTED
        API-->>Detail: 200 rejected
    else Suspend or unsuspend
        A->>Detail: Suspend/unsuspend
        Detail->>API: POST /api/v1/admin/providers/:id/suspend or unsuspend
        API->>API: validate current registration_status
        API->>Service: transition registration_status
        Service->>DB: UPDATE provider_profiles
        Service->>Notify: status notification
        API-->>Detail: 200 updated
    else Impersonate
        A->>Detail: Impersonate provider
        Detail->>API: POST /api/v1/admin/providers/:id/impersonate
        API->>API: validate target provider ACTIVE
        API->>Service: issue impersonation token
        Service->>DB: INSERT audit/session record
        API-->>Detail: scoped token
    end
    deactivate API
```

---

## 3. Payment Requests, Subscription Plans and Contest Fee Orders

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant PayScreen as Screen<br/>(AdminPaymentRequestsPage / AdminPaymentsPage)
    participant PlanScreen as Screen<br/>(AdminSubscriptionPlansPage)
    participant FeeScreen as Screen<br/>(AdminContestFeeOrdersPage)
    participant PayAPI as API<br/>(Express / PaymentRequestController)
    participant PlanAPI as API<br/>(Express / AdminSubscriptionPlanController)
    participant FeeAPI as API<br/>(Express / ContestFeeController)
    participant SubSvc as SubscriptionService<br/>(subscription.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Review provider subscription payment
        A->>PayScreen: Open payment requests
        PayScreen->>PayAPI: GET /api/v1/admin/payment-requests
        activate PayAPI
        PayAPI->>PayAPI: validate ADMIN role + filters
        PayAPI->>DB: SELECT payment_requests JOIN providers/plans
        PayAPI-->>PayScreen: pending/history list
        A->>PayScreen: Confirm or reject request
        PayScreen->>PayAPI: POST /api/v1/admin/payment-requests/:id/confirm or reject
        PayAPI->>PayAPI: validate request PENDING + notes/reason
        alt Request already processed
            PayAPI-->>PayScreen: 400 ALREADY_PROCESSED
        else Valid decision
        PayAPI->>SubSvc: activateFromPayment() or reject()
        activate SubSvc
        SubSvc->>DB: BEGIN TRANSACTION
        SubSvc->>DB: UPDATE payment_requests + provider_subscriptions
        SubSvc->>DB: COMMIT TRANSACTION
        deactivate SubSvc
        PayAPI-->>PayScreen: updated request
        end
        deactivate PayAPI
    else Update subscription plan
        A->>PlanScreen: Edit plan quota/price
        PlanScreen->>PlanAPI: PATCH /api/v1/admin/subscription-plans/:id
        activate PlanAPI
        PlanAPI->>PlanAPI: validate quota and price are non-negative
        alt Invalid plan payload
            PlanAPI-->>PlanScreen: 400 VALIDATION_ERROR
        else Valid plan update
        PlanAPI->>DB: UPDATE subscription_plans
        PlanAPI-->>PlanScreen: updated plan
        end
        deactivate PlanAPI
    else Review contest fee order
        A->>FeeScreen: Open contest fee orders
        FeeScreen->>FeeAPI: GET /api/v1/admin/contest-fee-orders
        FeeAPI->>DB: SELECT contest_fee_orders JOIN contests/providers
        A->>FeeScreen: Confirm/reject transfer
        FeeScreen->>FeeAPI: POST /api/v1/admin/contest-fee-orders/:orderId/confirm or reject
        activate FeeAPI
        FeeAPI->>FeeAPI: validate order PENDING_REVIEW
        alt Order not pending
            FeeAPI-->>FeeScreen: 409 CONTEST_FEE_ORDER_INVALID
        else Valid decision
        FeeAPI->>DB: UPDATE contest_fee_orders
        FeeAPI-->>FeeScreen: updated order
        end
        deactivate FeeAPI
    end
```

---

## 4. Admin Catalogs, Feature Flags and Featured Popups

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant Catalog as Screen<br/>(AdminAmenitiesPage / AdminTrackTypesPage)
    participant Flags as Screen<br/>(AdminFeatureFlagsPage)
    participant Popups as Screen<br/>(AdminFeaturedPopupsPage)
    participant CatalogAPI as API<br/>(Express / AdminAmenityController + AdminTrackTypeController)
    participant FlagAPI as API<br/>(Express / AdminFeatureFlagsController)
    participant PopupAPI as API<br/>(Express / FeaturedPopupController)
    participant DB as Database<br/>(PostgreSQL)

    alt Amenity or track type catalog
        A->>Catalog: Create/update catalog item
        Catalog->>CatalogAPI: GET/POST/PATCH/DELETE admin catalog endpoints
        activate CatalogAPI
        CatalogAPI->>CatalogAPI: validate ADMIN role + payload uniqueness
        alt Duplicate code/title
            CatalogAPI-->>Catalog: 409 CATALOG_DUPLICATE
        else Valid catalog request
        CatalogAPI->>DB: SELECT/INSERT/UPDATE amenity_catalogs or track_types
        CatalogAPI-->>Catalog: catalog result
        end
        deactivate CatalogAPI
    else Feature flags
        A->>Flags: Toggle provider feature flag
        Flags->>FlagAPI: GET /api/v1/admin/feature-flags
        FlagAPI->>DB: SELECT feature_flags
        Flags->>FlagAPI: PATCH /api/v1/admin/feature-flags/:key
        FlagAPI->>FlagAPI: validate feature key exists
        alt Unknown key
            FlagAPI-->>Flags: 404 FEATURE_FLAG_NOT_FOUND
        else Known key
        FlagAPI->>DB: UPDATE feature_flags
        FlagAPI-->>Flags: updated flag
        end
    else Featured popup moderation
        A->>Popups: Create or review popup
        Popups->>PopupAPI: GET/POST/PATCH /api/v1/admin/featured-popups
        PopupAPI->>DB: SELECT/INSERT/UPDATE featured_popups
        A->>Popups: Approve/reject pending popup
        Popups->>PopupAPI: POST /api/v1/admin/featured-popups/:popupId/review
        PopupAPI->>PopupAPI: validate pending popup + review decision
        alt Popup already reviewed
            PopupAPI-->>Popups: 409 POPUP_ALREADY_REVIEWED
        else Valid review
        PopupAPI->>DB: UPDATE review_status
        PopupAPI-->>Popups: updated popup
        end
    end
```

---

## 5. Admin Knowledge Base, Channels and Cafe Moderation

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant KB as Screen<br/>(AdminKnowledgeBasePage / AdminSystemChatPage)
    participant Channel as Screen<br/>(AdminChannelSettingsPage)
    participant Cafe as Screen<br/>(AdminCafesPage)
    participant ChatAPI as API<br/>(Express / KbController + ChatController)
    participant SystemAPI as API<br/>(Express / system.routes)
    participant CafeAPI as API<br/>(Express / CafeController)
    participant KbSvc as KbService<br/>(kb.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Manage KB documents
        A->>KB: Upload/list/delete KB document
        KB->>ChatAPI: GET/POST/DELETE /api/v1/cafes/:cafeId/kb/documents
        ChatAPI->>KbSvc: list/create/delete document
        KbSvc->>DB: INSERT/SELECT/DELETE kb_documents and kb_chunks
    else System widget config
        A->>Channel: Edit widget defaults
        Channel->>SystemAPI: GET/PUT /api/v1/system/widget-config
        SystemAPI->>DB: SELECT/UPDATE system widget config
    else Cafe status moderation
        A->>Cafe: Review cafe status
        Cafe->>CafeAPI: PATCH /api/v1/cafes/:cafeId/status
        CafeAPI->>DB: UPDATE cafes.status
    end
```

---

## 6. Class Diagram: Admin Operations

```mermaid
classDiagram
    class AdminDashboardPage
    class AdminProvidersPage
    class AdminProviderDetailPage
    class AdminPaymentRequestsPage
    class AdminSubscriptionPlansPage
    class AdminContestFeeOrdersPage
    class AdminAmenitiesPage
    class AdminTrackTypesPage
    class AdminFeatureFlagsPage
    class AdminFeaturedPopupsPage
    class AdminKnowledgeBasePage
    class AdminDashboardController
    class ProviderOnboardingController
    class PaymentRequestController
    class AdminSubscriptionPlanController
    class AdminAmenityController
    class AdminTrackTypeController
    class AdminFeatureFlagsController
    class FeaturedPopupController
    class ContestFeeController
    class KbController
    class User
    class ProviderProfile
    class ProviderSubscription
    class PaymentRequest
    class SubscriptionPlan
    class ContestFeeOrder
    class AmenityCatalog
    class TrackType
    class FeatureFlag
    class FeaturedPopup
    class KbDocument

    AdminDashboardPage --> AdminDashboardController
    AdminProvidersPage --> ProviderOnboardingController
    AdminProviderDetailPage --> ProviderOnboardingController
    AdminPaymentRequestsPage --> PaymentRequestController
    AdminSubscriptionPlansPage --> AdminSubscriptionPlanController
    AdminContestFeeOrdersPage --> ContestFeeController
    AdminAmenitiesPage --> AdminAmenityController
    AdminTrackTypesPage --> AdminTrackTypeController
    AdminFeatureFlagsPage --> AdminFeatureFlagsController
    AdminFeaturedPopupsPage --> FeaturedPopupController
    AdminKnowledgeBasePage --> KbController
    User "1" --> "0..1" ProviderProfile
    ProviderProfile "1" --> "*" ProviderSubscription
    ProviderProfile "1" --> "*" PaymentRequest
```
