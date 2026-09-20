# Report 4 Database Design Diagrams

**Baseline:** `docs/spec/06-database.md` and `backend/src/models` at 2026-08-13.

These four diagrams replace Figures 15-18 in Report 4 while preserving its existing database-section grouping. The DOCX uses compact grouped renderings for print legibility; the detailed ER relationships below remain the engineering reference.

## Figure 15. RCField Core Database Design

```mermaid
flowchart LR
    Identity[Identity<br/>users · refresh_tokens<br/>password_reset_tokens · push_tokens]
    Cafe[Cafe and Fleet<br/>cafes · cafe_payment_settings<br/>vehicle_catalogs · vehicles]
    Booking[Booking and Session<br/>bookings · sessions<br/>participants · assigned vehicles]
    Payment[Payment<br/>payment_components<br/>payment_transactions · bank_transactions]
    Inspection[Inspection<br/>inspections · photos · checklists<br/>damage_line_items]
    Commerce[Commerce<br/>packages · customer_packages<br/>promotions · menu · F&B]
    Contest[Contest<br/>contests · registrations · matches<br/>ledger · fees · audit]
    SaaS[Provider SaaS<br/>provider_profiles · subscriptions<br/>plans · payment_requests]
    AI[AI and Engagement<br/>KB documents/chunks · AI logs<br/>reviews · notifications]

    Identity --> Cafe
    Identity --> Booking
    Identity --> SaaS
    Cafe --> Booking
    Cafe --> Commerce
    Cafe --> Contest
    Booking --> Payment
    Booking --> Inspection
    Booking --> Commerce
    Contest --> Payment
    SaaS --> Payment
    Cafe --> AI

    classDef core fill:#f4f0ff,stroke:#7c5ce7,color:#1f1f1f,stroke-width:1.5px;
    class Identity,Cafe,Booking,Payment,Inspection,Commerce,Contest,SaaS,AI core;
```

## Figure 16. Account, Branch, and Fleet Database Design

```mermaid
erDiagram
    users ||--o| provider_profiles : has
    users ||--o{ cafes : owns
    users ||--o{ refresh_tokens : authenticates
    users ||--o{ password_reset_tokens : resets
    users ||--o{ push_tokens : registers
    users ||--o{ staff_cafe_assignments : assigned
    cafes ||--o{ staff_cafe_assignments : employs
    cafes ||--o{ staff_invite_tokens : invites
    cafes ||--o{ cafe_images : displays
    cafes ||--o| cafe_payment_settings : receives_payment
    cafes ||--o{ cafe_track_configs : configures
    track_types ||--o{ cafe_track_configs : classifies
    cafes ||--o{ vehicle_catalogs : offers
    vehicle_catalogs ||--o{ vehicle_catalog_images : illustrates
    vehicle_catalogs ||--o{ vehicles : instantiates
    vehicles ||--o{ vehicle_maintenance_logs : maintains

    cafe_payment_settings {
        uuid cafe_id FK
        varchar bank_code
        varchar account_number
        varchar payment_gateway
    }
    provider_profiles {
        uuid user_id FK
        varchar status
        timestamptz trial_used_at
    }
    vehicles {
        uuid vehicle_catalog_id FK
        varchar status
        varchar asset_code
    }
```

## Figure 17. Booking, Session, Payment, and Subscription Database Design

```mermaid
erDiagram
    users ||--o{ bookings : creates
    cafes ||--o{ bookings : receives
    bookings ||--o{ booking_participants : plans
    bookings ||--o{ booking_vehicles : reserves
    vehicles ||--o{ booking_vehicles : assigned
    bookings ||--o{ sessions : starts
    sessions ||--o{ session_participants : records
    sessions ||--o{ session_vehicles : uses
    vehicles ||--o{ session_vehicles : driven
    sessions ||--o{ inspections : inspected
    inspections ||--o{ inspection_photos : evidences
    inspections ||--o{ inspection_checklists : checks
    inspections ||--o{ damage_line_items : itemizes
    sessions ||--o{ extension_proposals : extends
    bookings ||--o{ payment_components : prices
    bookings ||--o{ payment_transactions : pays
    payment_transactions ||--o{ bank_transactions : reconciles
    cafes ||--o{ bank_transactions : receives
    packages ||--o{ customer_packages : purchased
    users ||--o{ customer_packages : owns
    users ||--o{ provider_subscriptions : subscribes
    subscription_plans ||--o{ provider_subscriptions : defines
    users ||--o{ payment_requests : submits
    subscription_plans ||--o{ payment_requests : requested_plan

    payment_transactions {
        uuid booking_id FK
        varchar gateway
        varchar payment_ref_code
        varchar status
        numeric amount
    }
    bank_transactions {
        uuid cafe_id FK
        uuid payment_transaction_id FK
        varchar match_status
        varchar match_reason
    }
    damage_line_items {
        uuid inspection_id FK
        int quantity
        numeric unit_price
        numeric labor_cost
    }
```

## Figure 18. Contest, AI, F&B, Review, and Notification Database Design

```mermaid
erDiagram
    cafes ||--o{ contests : organizes
    contests ||--o{ contest_cafes : hosted_at
    cafes ||--o{ contest_cafes : participates
    contest_formats ||--o{ contest_templates : configures
    contest_types ||--o{ contest_templates : classifies
    contest_templates ||--o{ contests : instantiates
    contests ||--o{ contest_registrations : registers
    contests ||--o{ contest_matches : schedules
    contest_matches ||--o{ contest_match_participants : contains
    contest_registrations ||--o{ contest_match_participants : competes
    contests ||--o{ contest_staff_assignments : staffed
    contests ||--o{ contest_bans : restricts
    contests ||--o{ contest_audit_logs : audits
    contests ||--o{ contest_ledger_entries : accounts
    contest_fee_plans ||--o{ contest_fee_orders : prices
    contests ||--o| contest_fee_orders : billed
    cafes ||--o{ menu_categories : groups
    menu_categories ||--o{ menu_items : contains
    menu_items ||--o{ menu_item_variants : varies
    menu_items ||--o{ menu_item_components : composes
    bookings ||--o{ fnb_orders : orders
    fnb_orders ||--o{ fnb_order_items : contains
    menu_items ||--o{ fnb_order_items : selected
    cafes ||--o{ kb_documents : owns
    kb_documents ||--o{ kb_chunks : splits
    cafes ||--o{ ai_analysis_logs : analyzes
    bookings ||--o{ reviews : reviewed
    users ||--o{ reviews : writes
    users ||--o{ notifications : receives
    cafes ||--o{ featured_popups : promotes

    contest_ledger_entries {
        uuid contest_id FK
        varchar direction
        varchar source_type
        numeric amount
    }
    menu_categories {
        uuid cafe_id FK
        varchar name
        int display_order
    }
```
