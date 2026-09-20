# Sequence Flow: Provider Operations

**Last updated:** 2026-08-06

Coverage theo controller: `provider-onboarding`, `provider-dashboard`, `ai-revenue-analytics`, `cafe`, `cafe-image`, `cafe-track-config`, `pricing`, `menu`, `menu-category`, `package`, `promotion`, `vehicle-catalog`, `vehicle`, `staff`, `fb-channel`, `chat/kb`, `review`, `contest`, `contest-fee`, `payment-request`.

---

## 1. Provider Workspace Load, KYC and Dashboard Analytics

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant Home as Screen<br/>(ProviderDashboardPage)
    participant Kyc as Screen<br/>(PendingReviewPage / RejectedPage)
    participant API as API<br/>(Express / ProviderOnboardingController + ProviderDashboardController)
    participant AISvc as AIRevenueAnalyticsController<br/>(ai-revenue-analytics.controller.ts)
    participant Service as ProviderDashboardService<br/>(provider-dashboard.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Store as Storage<br/>(KYC uploads)

    alt Load provider workspace
        P->>Home: Open provider dashboard
        Home->>API: GET /api/v1/provider/me
        activate API
        API->>API: validate JWT + role PROVIDER + provider status
        API->>DB: SELECT provider profile + registration_status
        alt Provider is PENDING/REJECTED/SUSPENDED
            API-->>Home: 403 or status payload for guard redirect
        else Provider ACTIVE
            API-->>Home: provider profile
        end
        deactivate API
        Home->>API: GET /api/v1/provider/dashboard/kpi
        activate API
        API->>Service: getKpi(providerId)
        activate Service
        Service->>Service: normalize date/cafe filters
        Service->>DB: Aggregate bookings, sessions, revenue, branches
        DB-->>Service: KPI rows
        Service-->>API: KPI cards
        deactivate Service
        Home->>API: GET revenue trend/breakdown/booking channels/branch performance
        API->>API: validate filters + provider cafe ownership
        Service->>DB: SELECT grouped operational metrics
        API-->>Home: dashboard datasets
        deactivate API
    else Resubmit KYC
        P->>Kyc: Upload KYC documents
        Kyc->>API: POST /api/v1/provider/kyc/resubmit
        activate API
        API->>API: validate multipart files + required text fields
        alt Missing required KYC file or invalid mime
            API-->>Kyc: 400 VALIDATION_ERROR
        else Valid KYC payload
        API->>Store: Store cccd_front, cccd_back, gpkd, venue_photo
        API->>DB: UPDATE provider_profiles KYC fields + registration_status PENDING
        API-->>Kyc: resubmission accepted
        end
        deactivate API
    else AI insights
        P->>Home: Generate insights
        Home->>AISvc: POST /api/v1/provider/dashboard/ai-insights
        activate AISvc
        AISvc->>AISvc: validate feature flag + date range
        alt Feature disabled or quota exceeded
            AISvc-->>Home: 403 FEATURE_DISABLED or 429 QUOTA_EXCEEDED
        else Allowed
        AISvc->>DB: Load recent revenue and operation metrics
        AISvc-->>Home: AI insight cards
        end
        deactivate AISvc
    end
```

---

## 2. Cafe Branch, Images, Track Configuration and Pricing

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant CafeList as Screen<br/>(ProviderCafesPage)
    participant CafeForm as Screen<br/>(ProviderCafeCreatePage / ProviderCafeDetailPage)
    participant Config as Screen<br/>(ProviderConfigurationPage / ProviderPricingPage)
    participant CafeAPI as API<br/>(Express / CafeController + CafeImageController)
    participant TrackAPI as API<br/>(Express / CafeTrackConfigController)
    participant PriceAPI as API<br/>(Express / PricingController)
    participant Quota as SubscriptionService<br/>(checkBranchQuota)
    participant Store as Cloudinary
    participant DB as Database<br/>(PostgreSQL)

    alt Branch CRUD
        P->>CafeList: Create or edit branch
        CafeForm->>CafeAPI: POST/PATCH /api/v1/cafes
        activate CafeAPI
        CafeAPI->>CafeAPI: validate payload + provider ownership
        CafeAPI->>Quota: checkBranchQuota(providerId)
        activate Quota
        Quota->>DB: SELECT active subscription branch_limit
        Quota-->>CafeAPI: quota result
        deactivate Quota
        alt Quota exceeded or inactive provider
            CafeAPI-->>CafeForm: 403 BRANCH_QUOTA_EXCEEDED or PROVIDER_INACTIVE
        else Valid branch request
        CafeAPI->>DB: INSERT/UPDATE cafes
        CafeAPI-->>CafeForm: cafe detail
        end
        deactivate CafeAPI
    else Images
        P->>CafeForm: Upload gallery images
        CafeForm->>CafeAPI: POST /api/v1/cafes/:cafeId/images
        activate CafeAPI
        CafeAPI->>CafeAPI: validate cafe ownership + file count/size
        alt Invalid files
            CafeAPI-->>CafeForm: 400 FILE_VALIDATION_ERROR
        else Files accepted
        CafeAPI->>Store: upload files
        CafeAPI->>DB: INSERT cafe_images
        CafeAPI-->>CafeForm: image list
        end
        deactivate CafeAPI
    else Track configuration
        P->>Config: Configure track lanes/capacity/images
        Config->>TrackAPI: POST/PATCH /api/v1/cafes/:cafeId/track-configs
        activate TrackAPI
        TrackAPI->>TrackAPI: validate track_type_id + cafe ownership
        alt Duplicate/inactive track type
            TrackAPI-->>Config: 400 TRACK_CONFIG_INVALID
        else Valid config
        TrackAPI->>DB: INSERT/UPDATE cafe_track_configs
        TrackAPI-->>Config: track config
        end
        Config->>TrackAPI: POST /api/v1/cafes/:cafeId/track-configs/:configId/images
        TrackAPI->>TrackAPI: validate config belongs to cafe
        TrackAPI->>Store: upload track images
        TrackAPI->>DB: INSERT track config image refs
        deactivate TrackAPI
    else Pricing and holidays
        P->>Config: Edit pricing rules and holidays
        Config->>PriceAPI: GET /api/v1/provider/cafes/:cafeId/pricing
        activate PriceAPI
        PriceAPI->>PriceAPI: validate cafe ownership
        PriceAPI->>DB: SELECT cafe_pricing_rules + holiday_dates
        Config->>PriceAPI: PUT /api/v1/provider/cafes/:cafeId/pricing/rules
        PriceAPI->>PriceAPI: validate rule ranges, positive prices, no overlap
        alt Invalid pricing rule
            PriceAPI-->>Config: 400 PRICING_RULE_INVALID
        else Valid rules
        PriceAPI->>DB: UPSERT pricing rules
        end
        Config->>PriceAPI: POST/PUT/DELETE holidays
        PriceAPI->>PriceAPI: validate holiday date + override target
        PriceAPI->>DB: INSERT/UPDATE/DELETE holiday_dates
        PriceAPI-->>Config: pricing snapshot
        deactivate PriceAPI
    end
```

---

## 3. Menu, Packages, Promotions and Public Preview

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant Menu as Screen<br/>(ProviderMenuPage)
    participant Package as Screen<br/>(ProviderPackagesPage)
    participant Promo as Screen<br/>(ProviderPromotionsPage)
    participant MenuAPI as API<br/>(Express / MenuController + MenuCategoryController)
    participant PackageAPI as API<br/>(Express / PackageController)
    participant PromoAPI as API<br/>(Express / PromotionController)
    participant DB as Database<br/>(PostgreSQL)

    alt Menu categories/items/combos
        P->>Menu: Manage categories, menu items, combos
        Menu->>MenuAPI: POST/PATCH/DELETE /api/v1/cafes/:cafeId/menu/categories
        activate MenuAPI
        MenuAPI->>MenuAPI: validate cafe ownership + category order/name
        alt Invalid category or duplicate order
            MenuAPI-->>Menu: 400 MENU_CATEGORY_INVALID
        else Valid category request
        MenuAPI->>DB: INSERT/UPDATE/DELETE menu_categories
        end
        Menu->>MenuAPI: POST/PATCH/DELETE /api/v1/cafes/:cafeId/menu or combos
        MenuAPI->>MenuAPI: validate item, variants, combo components
        alt Invalid item payload
            MenuAPI-->>Menu: 400 MENU_ITEM_INVALID
        else Valid item request
        MenuAPI->>DB: INSERT/UPDATE/DELETE menu_items, variants, components
        end
        deactivate MenuAPI
    else Packages
        P->>Package: Create/edit play packages
        Package->>PackageAPI: GET/POST/PATCH/DELETE /api/v1/cafes/:cafeId/packages
        PackageAPI->>DB: SELECT/INSERT/UPDATE/DELETE packages
    else Promotions
        P->>Promo: Create/edit promotion and preview discount
        Promo->>PromoAPI: GET/POST/PATCH/DELETE /api/v1/cafes/:cafeId/promotions
        activate PromoAPI
        PromoAPI->>PromoAPI: validate ownership + time window + discount bounds
        alt Invalid promotion
            PromoAPI-->>Promo: 400 PROMOTION_INVALID
        else Valid promotion
        PromoAPI->>DB: SELECT/INSERT/UPDATE promotions
        end
        Promo->>PromoAPI: POST /api/v1/cafes/:cafeId/promotions/preview
        PromoAPI->>PromoAPI: validate draft booking amount and promotion code
        PromoAPI->>DB: Validate promotion rules against booking draft
        PromoAPI-->>Promo: discount preview
        deactivate PromoAPI
    end
```

---

## 4. Vehicle Catalog, Units and Maintenance Visibility

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant Vehicles as Screen<br/>(ProviderVehiclesPage)
    participant Catalog as Screen<br/>(ProviderVehicleCatalogFormPage / ProviderVehicleCatalogDetailPage)
    participant Unit as Screen<br/>(ProviderVehicleUnitFormPage / ProviderVehicleDetailPage)
    participant CatalogAPI as API<br/>(Express / VehicleCatalogController)
    participant VehicleAPI as API<br/>(Express / VehicleController)
    participant DB as Database<br/>(PostgreSQL)

    P->>Vehicles: Open vehicles workspace
    Vehicles->>CatalogAPI: GET /api/v1/cafes/:cafeId/vehicle-catalogs
    CatalogAPI->>DB: SELECT vehicle_catalogs + images
    CatalogAPI-->>Vehicles: catalog list

    alt Catalog CRUD
        P->>Catalog: Create/update/delete catalog
        Catalog->>CatalogAPI: POST/PATCH/DELETE /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId
        CatalogAPI->>DB: INSERT/UPDATE/DELETE vehicle_catalogs
    else Unit CRUD
        P->>Unit: Create/update physical unit
        Unit->>VehicleAPI: POST/PATCH/DELETE /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units
        VehicleAPI->>DB: INSERT/UPDATE/DELETE vehicles
        VehicleAPI->>DB: Enforce unit status and branch ownership
    end
```

---

## 5. Provider Staff, Reviews and Impersonation

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant StaffList as Screen<br/>(ProviderStaffPage)
    participant StaffDetail as Screen<br/>(ProviderStaffDetailPage)
    participant Reviews as Component<br/>(ProviderReviewsTab)
    participant API as API<br/>(Express / StaffController + ReviewController)
    participant StaffSvc as StaffService<br/>(staff.service.ts)
    participant Mail as EmailService<br/>(email.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Staff lifecycle
        P->>StaffList: Create staff account
        StaffList->>API: POST /api/v1/provider/staff
        activate API
        API->>API: validate payload + provider active + cafe ownership
        alt Email exists or cafe not owned
            API-->>StaffList: 400/403 STAFF_INVITE_INVALID
        else Valid staff invite
        API->>StaffSvc: createStaff(providerId, payload)
        activate StaffSvc
        StaffSvc->>DB: INSERT user STAFF + staff invite token
        StaffSvc->>Mail: send activation email
        StaffSvc-->>API: staff profile + emailSent
        deactivate StaffSvc
        API-->>StaffList: invited staff
        end
        P->>StaffDetail: View KPI/activity/detail
        StaffDetail->>API: GET /api/v1/provider/staff/:staffId/kpi and activity
        API->>API: validate provider owns staff assignment
        API->>DB: SELECT staff bookings, sessions, inspections
        P->>StaffDetail: Deactivate/reactivate/transfer/impersonate
        StaffDetail->>API: PATCH/POST staff action endpoints
        API->>API: validate allowed transition and target cafe
        alt Invalid staff status transition
            API-->>StaffDetail: 409 STAFF_STATUS_INVALID
        else Valid action
        API->>DB: UPDATE staff assignment or issue impersonation token
        API-->>StaffDetail: updated staff
        end
        deactivate API
    else Review moderation
        P->>Reviews: View cafe reviews
        Reviews->>API: GET /api/v1/provider/reviews
        activate API
        API->>API: validate provider owns cafe reviews
        API->>DB: SELECT reviews by provider cafes
        P->>Reviews: Hide/show review
        Reviews->>API: PATCH /api/v1/provider/reviews/:id/visibility
        API->>API: validate review belongs to provider cafe
        API->>DB: UPDATE review visibility
        API-->>Reviews: updated visibility
        deactivate API
    end
```

---

## 6. Channels, Chat Widget and Knowledge Base

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant Channel as Screen<br/>(ChannelSettingsPage / FacebookOAuthCallbackPage)
    participant Widget as Component<br/>(WidgetConfigForm)
    participant KB as Component<br/>(KbDocumentsSection)
    participant ChannelAPI as API<br/>(Express / FbChannelController)
    participant CafeAPI as API<br/>(Express / CafeController)
    participant KbAPI as API<br/>(Express / KbController)
    participant Quota as SubscriptionService<br/>(checkChannelQuota)
    participant FB as Third-party<br/>(Facebook OAuth)
    participant DB as Database<br/>(PostgreSQL)

    alt Connect Facebook page
        P->>Channel: Click connect
        Channel->>ChannelAPI: GET /api/v1/channels/facebook/auth-url
        activate ChannelAPI
        ChannelAPI->>ChannelAPI: validate cafeId + provider owns cafe
        ChannelAPI->>Quota: checkChannelQuota(providerId)
        activate Quota
        Quota->>DB: SELECT subscription channel_limit
        Quota-->>ChannelAPI: quota result
        deactivate Quota
        alt Quota exceeded
            ChannelAPI-->>Channel: 403 CHANNEL_QUOTA_EXCEEDED
        else Allowed
        ChannelAPI-->>Channel: Facebook OAuth URL
        end
        Channel->>FB: Redirect provider
        FB-->>Channel: callback code/state
        Channel->>ChannelAPI: GET /api/v1/channels/facebook/callback
        ChannelAPI->>ChannelAPI: verify OAuth state/nonce
        alt Invalid state or token exchange fails
            ChannelAPI-->>Channel: redirect with error
        else Page connected
        ChannelAPI->>DB: INSERT cafe_channels with page token
        ChannelAPI-->>Channel: redirect success
        end
        deactivate ChannelAPI
    else Widget config
        P->>Widget: Edit widget color/greeting/behavior
        Widget->>CafeAPI: PUT /api/v1/cafes/:cafeId/widget-config
        CafeAPI->>DB: UPSERT cafe_widget_config
    else Knowledge base
        P->>KB: Upload or delete KB docs
        KB->>KbAPI: GET/POST/DELETE /api/v1/cafes/:cafeId/kb/documents
        KbAPI->>DB: INSERT kb_documents + kb_chunks
    end
```

---

## 7. Provider Contest Management and Contest Fee

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant Form as Screen<br/>(ProviderContestFormPage)
    participant Workspace as Screen<br/>(ProviderContestWorkspacePage)
    participant FeePanel as Component<br/>(ContestFeePanel)
    participant ContestAPI as API<br/>(Express / ContestController)
    participant FeeAPI as API<br/>(Express / ContestFeeController)
    participant Runtime as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant DB as Database<br/>(PostgreSQL)

    alt Create/update/open contest
        P->>Form: Configure contest
        Form->>ContestAPI: POST/PATCH /api/v1/contests
        activate ContestAPI
        ContestAPI->>ContestAPI: validate schema, cafe ownership, time window, format
        alt Invalid contest payload
            ContestAPI-->>Form: 400 CONTEST_VALIDATION_ERROR
        else Valid contest draft
        ContestAPI->>DB: INSERT/UPDATE contests, contest_cafes, config
        ContestAPI-->>Form: contest draft
        end
        Form->>ContestAPI: POST /api/v1/contests/:contestId/banner
        ContestAPI->>ContestAPI: validate image file + contest ownership
        ContestAPI->>DB: UPDATE contest banner URL
        P->>Workspace: Open/close/cancel contest
        Workspace->>ContestAPI: POST open/close/cancel
        ContestAPI->>ContestAPI: validate status transition
        alt Transition not allowed
            ContestAPI-->>Workspace: 409 CONTEST_STATE_INVALID
        else Transition allowed
        ContestAPI->>DB: UPDATE contest status + audit log
        ContestAPI-->>Workspace: updated contest
        end
        deactivate ContestAPI
    else Registration and event operations
        P->>Workspace: Review registrations, assign staff, bans
        Workspace->>ContestAPI: GET registrations/staff-assignments/bans
        activate ContestAPI
        ContestAPI->>ContestAPI: validate provider/staff access
        ContestAPI->>DB: SELECT operational data
        Workspace->>ContestAPI: approve/reject/disqualify/assign/bans
        ContestAPI->>ContestAPI: validate registration status, staff assignment, ban scope
        alt Invalid operator action
            ContestAPI-->>Workspace: 403/409 CONTEST_OPERATOR_ACTION_INVALID
        else Action accepted
        ContestAPI->>DB: UPDATE registrations, assignments, bans
        ContestAPI-->>Workspace: updated operational state
        end
        deactivate ContestAPI
    else Runtime and leaderboard
        P->>Workspace: Generate bracket or submit results
        Workspace->>ContestAPI: POST matches/generate, results, advance, publish
        activate ContestAPI
        ContestAPI->>ContestAPI: validate contest OPEN/CLOSED and operator permission
        ContestAPI->>Runtime: execute runtime transition
        activate Runtime
        Runtime->>Runtime: validate match status, participants, cascade guards
        alt Runtime guard fails
            Runtime-->>ContestAPI: 409 MATCH_OR_LEADERBOARD_INVALID
            ContestAPI-->>Workspace: 409 error
        else Runtime transition valid
        Runtime->>DB: INSERT/UPDATE contest_matches + participants + leaderboard snapshot
        Runtime-->>ContestAPI: updated runtime graph
        ContestAPI-->>Workspace: updated matches/leaderboard
        end
        deactivate Runtime
        deactivate ContestAPI
    else Contest fee
        P->>FeePanel: Submit contest fee bank transfer
        FeePanel->>FeeAPI: GET/POST/DELETE/transfer /api/v1/contests/:contestId/fee
        activate FeeAPI
        FeeAPI->>FeeAPI: validate contest ownership + order status
        alt Already has pending order or amount invalid
            FeeAPI-->>FeePanel: 409/400 CONTEST_FEE_ORDER_INVALID
        else Valid fee action
        FeeAPI->>DB: INSERT/UPDATE contest_fee_orders
        FeeAPI-->>FeePanel: fee order status
        end
        deactivate FeeAPI
    end
```

---

## 8. Class Diagram: Provider Operations

```mermaid
classDiagram
    class ProviderDashboardPage
    class ProviderCafesPage
    class ProviderConfigurationPage
    class ProviderMenuPage
    class ProviderPackagesPage
    class ProviderPromotionsPage
    class ProviderVehiclesPage
    class ProviderStaffPage
    class ChannelSettingsPage
    class ProviderContestWorkspacePage
    class ProviderOnboardingController
    class ProviderDashboardController
    class CafeController
    class PricingController
    class MenuController
    class PackageController
    class PromotionController
    class VehicleCatalogController
    class StaffController
    class FbChannelController
    class ContestController
    class ContestFeeController
    class ProviderProfile
    class Cafe
    class CafeTrackConfig
    class MenuItem
    class Package
    class Promotion
    class VehicleCatalog
    class Vehicle
    class StaffAssignment
    class CafeChannel
    class Contest

    ProviderDashboardPage --> ProviderDashboardController
    ProviderCafesPage --> CafeController
    ProviderConfigurationPage --> PricingController
    ProviderMenuPage --> MenuController
    ProviderPackagesPage --> PackageController
    ProviderPromotionsPage --> PromotionController
    ProviderVehiclesPage --> VehicleCatalogController
    ProviderStaffPage --> StaffController
    ChannelSettingsPage --> FbChannelController
    ProviderContestWorkspacePage --> ContestController
    ProviderProfile "1" --> "*" Cafe
    Cafe "1" --> "*" CafeTrackConfig
    Cafe "1" --> "*" MenuItem
    Cafe "1" --> "*" Package
    Cafe "1" --> "*" Promotion
    Cafe "1" --> "*" VehicleCatalog
    VehicleCatalog "1" --> "*" Vehicle
    ProviderProfile "1" --> "*" StaffAssignment
    Cafe "1" --> "*" CafeChannel
    ProviderProfile "1" --> "*" Contest
```
