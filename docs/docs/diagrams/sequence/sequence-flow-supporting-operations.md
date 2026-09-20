# Sequence Flow: Supporting Operations

**Last updated:** 2026-08-06

Tai lieu nay gom cac flow ho tro dang co trong `rcfield-fe/src/app/router/routes.tsx` va `rcfield-be/src/routes/index.ts` nhung khong duoc tach thanh file rieng vi chu yeu la CRUD/utility. Cac flow lon nhu Booking, Contest, Provider Subscription, RAG Chat, Redis va Revenue nam o cac file sequence rieng.

---

## 1. Auth, Profile and Password Reset

```mermaid
sequenceDiagram
    autonumber
    actor U as Customer / Provider / Staff / Admin
    participant Login as Screen<br/>(LoginPage)
    participant Register as Screen<br/>(RegisterPage / ProviderRegisterPage)
    participant Profile as Screen<br/>(ProfilePage / CustomerProfilePage)
    participant API as API<br/>(Express / AuthController)
    participant SVC as AuthService<br/>(auth.service.ts)
    participant Repo as Repository<br/>(TypeORM UserRepository)
    participant DB as Database<br/>(PostgreSQL)
    participant Redis as Redis<br/>(brute-force / refresh-token support)
    participant Mail as EmailService<br/>(email.service.ts)

    alt Register account
        U->>Register: Fill registration form
        Register->>API: POST /api/v1/auth/register or /api/v1/auth/register-provider
        API->>SVC: register(payload)
        SVC->>Repo: check duplicate email
        Repo->>DB: SELECT users WHERE email
        SVC->>DB: INSERT users + provider_profiles when provider
        API-->>Register: 201/200 registration result
    else Login
        U->>Login: Enter email/password
        Login->>API: POST /api/v1/auth/login
        API->>SVC: loginWithPassword()
        SVC->>Redis: Check lock / increment failed attempts
        SVC->>Repo: find user by email
        Repo->>DB: SELECT users
        SVC-->>API: user + accessToken + refreshToken
        API-->>Login: 200 { user, tokens }
    else Forgot/reset password
        U->>Login: Request reset code
        Login->>API: POST /api/v1/auth/forgot-password
        API->>SVC: create reset token
        SVC->>DB: INSERT password_reset_tokens
        SVC->>Mail: send reset code
        U->>Login: Submit code + new password
        Login->>API: POST /api/v1/auth/reset-password
        SVC->>DB: UPDATE users.password_hash
    else Profile update
        U->>Profile: Edit profile
        Profile->>API: PATCH /api/v1/auth/me
        API->>SVC: updateMe(userId, payload)
        SVC->>DB: UPDATE users
        API-->>Profile: updated user
    end
```

---

## 2. Cafe, Menu, Pricing, Package, Promotion and Vehicle Catalog Management

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    participant CafeScreen as Screen<br/>(ProviderCafesPage / ProviderCafeDetailPage)
    participant ConfigScreen as Screen<br/>(ProviderConfigurationPage / ProviderPricingPage)
    participant MenuScreen as Screen<br/>(ProviderMenuPage)
    participant VehicleScreen as Screen<br/>(ProviderVehiclesPage)
    participant API as API<br/>(Express / Cafe, Menu, Pricing, Package, Promotion, Vehicle controllers)
    participant Quota as SubscriptionService<br/>(quota guards)
    participant Upload as UploadController<br/>(upload.controller.ts)
    participant Store as Cloudinary
    participant DB as Database<br/>(PostgreSQL)

    alt Create or update cafe branch
        P->>CafeScreen: Create/update cafe info
        CafeScreen->>API: POST/PATCH /api/v1/cafes
        API->>Quota: checkBranchQuota(providerId)
        Quota->>DB: SELECT provider_subscriptions
        API->>DB: INSERT/UPDATE cafes
        CafeScreen->>API: POST /api/v1/cafes/:cafeId/images
        API->>Upload: upload images
        Upload->>Store: upload file bytes
        API->>DB: INSERT cafe_images
    else Configure track and pricing
        P->>ConfigScreen: Edit track configs/pricing rules/holidays
        ConfigScreen->>API: POST/PATCH /api/v1/cafes/:cafeId/track-configs
        API->>DB: INSERT/UPDATE cafe_track_configs
        ConfigScreen->>API: PUT /api/v1/provider/cafes/:cafeId/pricing/rules
        API->>DB: UPSERT cafe_pricing_rules + holiday_dates
    else Manage menu/packages/promotions
        P->>MenuScreen: Create menu item, combo, package, promotion
        MenuScreen->>API: POST/PATCH /api/v1/cafes/:cafeId/menu
        API->>DB: INSERT/UPDATE menu_categories, menu_items, variants
        MenuScreen->>API: POST/PATCH /api/v1/cafes/:cafeId/packages
        API->>DB: INSERT/UPDATE packages
        MenuScreen->>API: POST/PATCH /api/v1/cafes/:cafeId/promotions
        API->>DB: INSERT/UPDATE promotions
    else Manage vehicle catalog and units
        P->>VehicleScreen: Create catalog/unit
        VehicleScreen->>API: POST /api/v1/cafes/:cafeId/vehicle-catalogs
        API->>DB: INSERT vehicle_catalogs
        VehicleScreen->>API: POST /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units
        API->>DB: INSERT vehicles
    end
```

---

## 3. Customer Discovery, Favorites, Reviews and Packages

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant Explore as Screen<br/>(ExplorePage / CafeDetailPage)
    participant PackageScreen as Screen<br/>(CustomerPackagesPage)
    participant ReviewScreen as Screen<br/>(CustomerReviewsPage / ReviewFormModal)
    participant API as API<br/>(Express / CafeController + FavoriteController + ReviewController + CustomerPackageController)
    participant Pricing as PricingService<br/>(pricing.service.ts)
    participant DB as Database<br/>(PostgreSQL)
    participant Pay as PaymentGateway<br/>(VNPay / mock gateway)

    alt Explore cafes and details
        C->>Explore: Search/filter cafe
        Explore->>API: GET /api/v1/cafes + /api/v1/cafes/:cafeId
        API->>DB: SELECT cafes, images, amenities, track configs
        API->>Pricing: calculate public pricing preview
        Pricing->>DB: SELECT pricing rules + holidays
        API-->>Explore: cafe cards/detail/pricing/availability
    else Favorite cafe
        C->>Explore: Toggle favorite
        Explore->>API: POST/DELETE /api/v1/customer/favorites/:cafeId
        API->>DB: INSERT/DELETE favorite row
    else Purchase customer package
        C->>PackageScreen: Buy package
        PackageScreen->>API: POST /api/v1/cafes/:cafeId/packages/:packageId/purchase
        API->>DB: INSERT customer_packages + payment transaction
        API->>Pay: create payment URL when paid package
        Pay-->>API: payment result / IPN
        API->>DB: mark package ACTIVE
    else Review completed booking
        C->>ReviewScreen: Submit rating/comment
        ReviewScreen->>API: POST /api/v1/customer/reviews
        API->>DB: Validate completed booking and no duplicate review
        API->>DB: INSERT reviews
        API-->>ReviewScreen: updated review list
    end
```

---

## 4. Staff Invitation, Operations Utilities, Notifications and Uploads

```mermaid
sequenceDiagram
    autonumber
    actor P as Provider
    actor S as Staff
    participant StaffMgmt as Screen<br/>(ProviderStaffPage / ProviderStaffDetailPage)
    participant ActScreen as Screen<br/>(StaffActivatePage)
    participant StaffOps as Screen<br/>(StaffMaintenancePage / StaffFnbOrdersPage / StaffPackagesPage)
    participant Bell as Component<br/>(NotificationBell)
    participant API as API<br/>(Express / StaffInviteController + StaffController + NotificationController + UploadController)
    participant StaffSvc as StaffService<br/>(staff.service.ts)
    participant Notify as NotificationService<br/>(notification.service.ts)
    participant Store as Cloudinary
    participant DB as Database<br/>(PostgreSQL)

    alt Invite and activate staff
        P->>StaffMgmt: Invite staff to cafe
        StaffMgmt->>API: POST /api/v1/provider/staff/invites
        API->>StaffSvc: create invite token
        StaffSvc->>DB: INSERT staff_invite_tokens
        S->>ActScreen: Open invite link
        ActScreen->>API: GET /api/v1/auth/staff-invite/validate
        API->>DB: SELECT valid token
        ActScreen->>API: POST /api/v1/auth/staff-invite/activate
        API->>DB: INSERT/UPDATE staff user assignment
    else Staff utility operations
        S->>StaffOps: Search customer package / update F&B / maintenance
        StaffOps->>API: GET /api/v1/staff/packages/search-customers
        API->>DB: SELECT customer_packages + users
        StaffOps->>API: PATCH /api/v1/staff/fnb-orders/:orderId
        API->>DB: UPDATE fnb_orders
        StaffOps->>API: POST/PATCH /api/v1/staff/maintenance-logs
        API->>DB: INSERT/UPDATE maintenance log
    else Notifications
        Bell->>API: GET /api/v1/notifications
        API->>Notify: list for current user
        Notify->>DB: SELECT notifications
        Bell->>API: PUT /api/v1/notifications/:id/read
        Notify->>DB: UPDATE notifications.read_at
    else Generic image upload
        StaffOps->>API: POST /api/v1/uploads/images
        API->>Store: upload image
        API->>DB: optional feature-specific image reference
    end
```

---

## 5. Class Diagram: Supporting Operations

```mermaid
classDiagram
    class LoginPage
    class ProfilePage
    class ProviderCafesPage
    class ProviderMenuPage
    class ProviderVehiclesPage
    class ExplorePage
    class CustomerPackagesPage
    class ProviderStaffPage
    class StaffActivatePage
    class NotificationBell
    class AuthController
    class CafeController
    class MenuController
    class PricingController
    class VehicleCatalogController
    class FavoriteController
    class ReviewController
    class CustomerPackageController
    class StaffInviteController
    class StaffController
    class NotificationController
    class AuthService
    class SubscriptionService
    class PricingService
    class StaffService
    class NotificationService
    class User
    class Cafe
    class MenuItem
    class Package
    class Promotion
    class VehicleCatalog
    class Vehicle
    class CustomerPackage
    class Review
    class Favorite
    class Notification

    LoginPage --> AuthController
    ProfilePage --> AuthController
    ProviderCafesPage --> CafeController
    ProviderMenuPage --> MenuController
    ProviderVehiclesPage --> VehicleCatalogController
    ExplorePage --> CafeController
    CustomerPackagesPage --> CustomerPackageController
    ProviderStaffPage --> StaffInviteController
    StaffActivatePage --> StaffInviteController
    NotificationBell --> NotificationController
    AuthController --> AuthService
    CafeController --> SubscriptionService
    PricingController --> PricingService
    StaffInviteController --> StaffService
    NotificationController --> NotificationService
    Cafe "1" --> "*" MenuItem
    Cafe "1" --> "*" Package
    Cafe "1" --> "*" Promotion
    Cafe "1" --> "*" VehicleCatalog
    VehicleCatalog "1" --> "*" Vehicle
    User "1" --> "*" CustomerPackage
    User "1" --> "*" Review
    User "1" --> "*" Favorite
    User "1" --> "*" Notification
```
