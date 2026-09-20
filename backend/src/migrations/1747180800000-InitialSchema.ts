import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1747180800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUM TYPES ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE auth_provider_enum AS ENUM ('LOCAL', 'GOOGLE');
      CREATE TYPE user_role_enum AS ENUM ('CUSTOMER', 'PROVIDER', 'STAFF', 'ADMIN');
      CREATE TYPE cafe_status_enum AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
      CREATE TYPE vehicle_tier_enum AS ENUM ('STANDARD', 'PREMIUM', 'RESTRICTED');
      CREATE TYPE vehicle_status_enum AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED');
      CREATE TYPE booking_mode_enum AS ENUM ('RENTAL', 'BYOC');
      CREATE TYPE booking_source_enum AS ENUM ('APP', 'STAFF_MANUAL');
      CREATE TYPE booking_status_enum AS ENUM (
        'PENDING', 'CONFIRMED', 'ACTIVE', 'EXTENDING',
        'CHECKING_OUT', 'DISPUTED', 'COMPLETED', 'CANCELLED'
      );
      CREATE TYPE payment_component_type_enum AS ENUM (
        'SLOT_FEE', 'RENTAL_FEE', 'SECURITY_DEPOSIT',
        'EXTENSION_FEE', 'DAMAGE_CHARGE', 'FB_PREORDER'
      );
      CREATE TYPE payment_component_status_enum AS ENUM (
        'PENDING', 'HELD', 'DISBURSED', 'REFUNDED', 'PARTIALLY_REFUNDED'
      );
      CREATE TYPE payment_transaction_type_enum AS ENUM ('PAYMENT', 'REFUND');
      CREATE TYPE inspection_type_enum AS ENUM ('CHECK_IN', 'CHECK_OUT');
      CREATE TYPE extension_proposal_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
      CREATE TYPE dispute_status_enum AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');
      CREATE TYPE dispute_favor_enum AS ENUM ('CUSTOMER', 'PROVIDER');
      CREATE TYPE fnb_order_type_enum AS ENUM ('PRE_ORDER', 'ON_SITE');
      CREATE TYPE fnb_order_status_enum AS ENUM ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED');
      CREATE TYPE notification_channel_enum AS ENUM ('PUSH', 'SMS', 'EMAIL');
      CREATE TYPE notification_status_enum AS ENUM ('SENT', 'FAILED', 'PENDING');
      CREATE TYPE trust_score_reason_enum AS ENUM (
        'NO_SHOW', 'DAMAGE_CONFIRMED', 'DISPUTE_LOST', 'BOOKING_STREAK', 'ADMIN_ADJUSTMENT'
      );
      CREATE TYPE discount_type_enum AS ENUM ('PERCENT', 'FIXED');
      CREATE TYPE promo_applicable_to_enum AS ENUM ('ALL', 'RENTAL', 'BYOC');
      CREATE TYPE maintenance_type_enum AS ENUM ('SCHEDULED', 'REPAIR', 'INSPECTION');
    `);

    // ── TABLE 1: users ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) NOT NULL,
        phone           VARCHAR(20),
        full_name       VARCHAR(255) NOT NULL,
        password_hash   TEXT,
        auth_provider   auth_provider_enum NOT NULL DEFAULT 'LOCAL',
        role            user_role_enum NOT NULL,
        trust_score     NUMERIC(5,2) NOT NULL DEFAULT 100.00,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
      CREATE INDEX idx_users_role ON users(role);
    `);

    // ── TABLE 2: refresh_tokens ──────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
      CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);

    // ── TABLE 3: password_reset_tokens ───────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── TABLE 4: cafes ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cafes (
        id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id                 UUID NOT NULL REFERENCES users(id),
        name                        VARCHAR(255) NOT NULL,
        slug                        VARCHAR(100) NOT NULL,
        description                 TEXT,
        phone                       VARCHAR(20),
        status                      cafe_status_enum NOT NULL DEFAULT 'PENDING',
        cover_image_url             TEXT,
        address                     TEXT NOT NULL,
        district                    VARCHAR(100) NOT NULL,
        city                        VARCHAR(100) NOT NULL,
        latitude                    NUMERIC(10,7),
        longitude                   NUMERIC(10,7),
        operating_hours             JSONB NOT NULL DEFAULT '{}',
        track_types                 TEXT[] NOT NULL DEFAULT '{}',
        slot_duration_minutes       INTEGER NOT NULL DEFAULT 60,
        slot_fee_rate               NUMERIC(15,2) NOT NULL,
        max_concurrent_bookings     INTEGER NOT NULL DEFAULT 10,
        min_booking_notice_minutes  INTEGER NOT NULL DEFAULT 60,
        byoc_capacity               INTEGER NOT NULL DEFAULT 5,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_cafes_slug ON cafes(slug);
      CREATE INDEX idx_cafes_provider_id ON cafes(provider_id);
      CREATE INDEX idx_cafes_status ON cafes(status);
      CREATE INDEX idx_cafes_city_district ON cafes(city, district);
      CREATE INDEX idx_cafes_location ON cafes(latitude, longitude);
    `);

    // ── TABLE 5: cafe_images ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cafe_images (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id     UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_cafe_images_cafe_id ON cafe_images(cafe_id);
    `);

    // ── TABLE 6: cafe_closures ───────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cafe_closures (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id      UUID NOT NULL REFERENCES cafes(id),
        closed_date  DATE NOT NULL,
        reason       VARCHAR(255),
        created_by   UUID NOT NULL REFERENCES users(id),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_cafe_closures_date ON cafe_closures(cafe_id, closed_date);
      CREATE INDEX idx_cafe_closures_cafe_id ON cafe_closures(cafe_id);
    `);

    // ── TABLE 7: cafe_announcements ──────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cafe_announcements (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id     UUID NOT NULL REFERENCES cafes(id),
        title       VARCHAR(255) NOT NULL,
        content     TEXT,
        image_url   TEXT,
        starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at     TIMESTAMPTZ,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_by  UUID NOT NULL REFERENCES users(id),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_cafe_announcements_cafe_id ON cafe_announcements(cafe_id, is_active, starts_at DESC);
    `);

    // ── TABLE 8: staff_cafe_assignments ─────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE staff_cafe_assignments (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id     UUID NOT NULL UNIQUE REFERENCES users(id),
        cafe_id      UUID NOT NULL REFERENCES cafes(id),
        assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by  UUID NOT NULL REFERENCES users(id)
      );

      CREATE UNIQUE INDEX idx_staff_cafe_staff_id ON staff_cafe_assignments(staff_id);
      CREATE INDEX idx_staff_cafe_cafe_id ON staff_cafe_assignments(cafe_id);
    `);

    // ── TABLE 9: vehicles ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE vehicles (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id                 UUID NOT NULL REFERENCES cafes(id),
        name                    VARCHAR(255) NOT NULL,
        description             TEXT,
        tier                    vehicle_tier_enum NOT NULL,
        status                  vehicle_status_enum NOT NULL DEFAULT 'AVAILABLE',
        hourly_rate             NUMERIC(15,2) NOT NULL,
        security_deposit        NUMERIC(15,2) NOT NULL,
        damage_multiplier       NUMERIC(4,2) NOT NULL DEFAULT 1.00,
        compatible_track_types  TEXT[] NOT NULL DEFAULT '{}',
        cover_image_url         TEXT,
        last_maintenance_at     TIMESTAMPTZ,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at              TIMESTAMPTZ
      );

      CREATE INDEX idx_vehicles_cafe_id ON vehicles(cafe_id);
      CREATE INDEX idx_vehicles_status ON vehicles(status);
      CREATE INDEX idx_vehicles_tier ON vehicles(tier);
    `);

    // ── TABLE 10: vehicle_images ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE vehicle_images (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_vehicle_images_vehicle_id ON vehicle_images(vehicle_id);
    `);

    // ── TABLE 11: feature_flags ──────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE feature_flags (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feature_key   VARCHAR(100) NOT NULL,
        display_name  VARCHAR(255) NOT NULL,
        description   TEXT,
        is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
        is_trial      BOOLEAN NOT NULL DEFAULT FALSE,
        trial_ends_at TIMESTAMPTZ,
        enabled_by    UUID REFERENCES users(id),
        enabled_at    TIMESTAMPTZ,
        note          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags(feature_key);
      CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled);
    `);

    // ── TABLE 12: promotions ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE promotions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code                VARCHAR(50) NOT NULL,
        description         TEXT,
        discount_type       discount_type_enum NOT NULL,
        discount_value      NUMERIC(15,2) NOT NULL,
        max_discount_amount NUMERIC(15,2),
        min_order_amount    NUMERIC(15,2),
        max_uses            INTEGER,
        max_uses_per_user   INTEGER NOT NULL DEFAULT 1,
        uses_count          INTEGER NOT NULL DEFAULT 0,
        applicable_to       promo_applicable_to_enum NOT NULL DEFAULT 'ALL',
        cafe_id             UUID REFERENCES cafes(id),
        starts_at           TIMESTAMPTZ NOT NULL,
        expires_at          TIMESTAMPTZ,
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_by          UUID NOT NULL REFERENCES users(id),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_promotions_code ON promotions(code) WHERE is_active = TRUE;
      CREATE INDEX idx_promotions_cafe_id ON promotions(cafe_id);
      CREATE INDEX idx_promotions_expires_at ON promotions(expires_at) WHERE is_active = TRUE;
    `);

    // ── TABLE 13: menu_items ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE menu_items (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id       UUID NOT NULL REFERENCES cafes(id),
        name          VARCHAR(255) NOT NULL,
        description   TEXT,
        price         NUMERIC(15,2) NOT NULL,
        category      VARCHAR(100),
        image_url     TEXT,
        is_available  BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );

      CREATE INDEX idx_menu_items_cafe_id ON menu_items(cafe_id);
      CREATE INDEX idx_menu_items_available ON menu_items(cafe_id, is_available) WHERE deleted_at IS NULL;
    `);

    // ── TABLE 14: bookings ───────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE bookings (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id         UUID NOT NULL REFERENCES users(id),
        cafe_id             UUID NOT NULL REFERENCES cafes(id),
        vehicle_id          UUID REFERENCES vehicles(id),
        mode                booking_mode_enum NOT NULL,
        source              booking_source_enum NOT NULL DEFAULT 'APP',
        track_type          VARCHAR(50) NOT NULL,
        status              booking_status_enum NOT NULL DEFAULT 'PENDING',
        slot_start          TIMESTAMPTZ NOT NULL,
        slot_end            TIMESTAMPTZ NOT NULL,
        slot_count          INTEGER NOT NULL DEFAULT 1,
        payment_expires_at  TIMESTAMPTZ NOT NULL,
        snapshot            JSONB NOT NULL,
        promotion_id        UUID REFERENCES promotions(id),
        discount_amount     NUMERIC(15,2),
        notes               TEXT,
        cancelled_by        UUID REFERENCES users(id),
        cancelled_at        TIMESTAMPTZ,
        cancellation_reason TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
      CREATE INDEX idx_bookings_cafe_id ON bookings(cafe_id);
      CREATE INDEX idx_bookings_vehicle_id ON bookings(vehicle_id);
      CREATE INDEX idx_bookings_status ON bookings(status);
      CREATE INDEX idx_bookings_slot_start ON bookings(slot_start);
      CREATE INDEX idx_bookings_track_type ON bookings(cafe_id, track_type);
      CREATE INDEX idx_bookings_payment_expires ON bookings(payment_expires_at) WHERE status = 'PENDING';
      CREATE INDEX idx_bookings_vehicle_slot ON bookings(vehicle_id, slot_start, slot_end)
        WHERE status NOT IN ('CANCELLED');
    `);

    // ── TABLE 15: promotion_usages ───────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE promotion_usages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id    UUID NOT NULL REFERENCES promotions(id),
        booking_id      UUID NOT NULL UNIQUE REFERENCES bookings(id),
        user_id         UUID NOT NULL REFERENCES users(id),
        discount_amount NUMERIC(15,2) NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_promotion_usages_booking ON promotion_usages(booking_id);
      CREATE INDEX idx_promotion_usages_promotion_id ON promotion_usages(promotion_id);
      CREATE INDEX idx_promotion_usages_user_id ON promotion_usages(user_id);
    `);

    // ── TABLE 16: payment_components ─────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE payment_components (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id       UUID NOT NULL REFERENCES bookings(id),
        type             payment_component_type_enum NOT NULL,
        amount           NUMERIC(15,2) NOT NULL,
        status           payment_component_status_enum NOT NULL DEFAULT 'PENDING',
        disbursed_to     UUID REFERENCES users(id),
        disbursed_at     TIMESTAMPTZ,
        refunded_at      TIMESTAMPTZ,
        refunded_amount  NUMERIC(15,2),
        note             TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_payment_components_booking_id ON payment_components(booking_id);
      CREATE INDEX idx_payment_components_status ON payment_components(status);
    `);

    // ── TABLE 17: payment_transactions ───────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE payment_transactions (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id             UUID NOT NULL REFERENCES bookings(id),
        gateway                VARCHAR(50) NOT NULL,
        gateway_transaction_id VARCHAR(255),
        type                   payment_transaction_type_enum NOT NULL,
        amount                 NUMERIC(15,2) NOT NULL,
        status                 VARCHAR(50) NOT NULL,
        raw_request            JSONB,
        raw_response           JSONB,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_payment_transactions_booking_id ON payment_transactions(booking_id);
      CREATE INDEX idx_payment_transactions_gateway_txn ON payment_transactions(gateway_transaction_id);
    `);

    // ── TABLE 18: inspection_records ─────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE inspection_records (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id            UUID NOT NULL REFERENCES bookings(id),
        type                  inspection_type_enum NOT NULL,
        performed_by          UUID NOT NULL REFERENCES users(id),
        photos                JSONB NOT NULL,
        checklist             JSONB NOT NULL,
        pre_existing_flag     BOOLEAN NOT NULL DEFAULT FALSE,
        damage_noted          BOOLEAN NOT NULL DEFAULT FALSE,
        damage_description    TEXT,
        damage_cost_estimate  NUMERIC(15,2),
        customer_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
        customer_confirmed_at TIMESTAMPTZ,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_inspection_records_booking_id ON inspection_records(booking_id);
      CREATE UNIQUE INDEX idx_inspection_booking_type ON inspection_records(booking_id, type);
    `);

    // ── TABLE 19: extension_proposals ────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE extension_proposals (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id       UUID NOT NULL REFERENCES bookings(id),
        proposed_by      UUID NOT NULL REFERENCES users(id),
        duration_minutes INTEGER NOT NULL,
        fee_amount       NUMERIC(15,2) NOT NULL,
        status           extension_proposal_status_enum NOT NULL DEFAULT 'PENDING',
        responded_by     UUID REFERENCES users(id),
        responded_at     TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_extension_proposals_booking_id ON extension_proposals(booking_id);
    `);

    // ── TABLE 20: disputes ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE disputes (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id       UUID NOT NULL UNIQUE REFERENCES bookings(id),
        opened_by        UUID NOT NULL REFERENCES users(id),
        reason           TEXT NOT NULL,
        evidence_photos  TEXT[] NOT NULL DEFAULT '{}',
        status           dispute_status_enum NOT NULL DEFAULT 'OPEN',
        resolution       TEXT,
        resolution_favor dispute_favor_enum,
        resolved_by      UUID REFERENCES users(id),
        resolved_at      TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_disputes_booking_id ON disputes(booking_id);
      CREATE INDEX idx_disputes_status ON disputes(status);
    `);

    // ── TABLE 21: fnb_orders ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE fnb_orders (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id    UUID NOT NULL REFERENCES bookings(id),
        type          fnb_order_type_enum NOT NULL,
        status        fnb_order_status_enum NOT NULL DEFAULT 'PENDING',
        total_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_by    UUID NOT NULL REFERENCES users(id),
        confirmed_by  UUID REFERENCES users(id),
        confirmed_at  TIMESTAMPTZ,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_fnb_orders_booking_id ON fnb_orders(booking_id);
      CREATE UNIQUE INDEX idx_fnb_orders_preorder ON fnb_orders(booking_id)
        WHERE type = 'PRE_ORDER' AND status != 'CANCELLED';
    `);

    // ── TABLE 22: fnb_order_items ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE fnb_order_items (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id           UUID NOT NULL REFERENCES fnb_orders(id),
        menu_item_id       UUID NOT NULL REFERENCES menu_items(id),
        quantity           INTEGER NOT NULL CHECK (quantity > 0),
        unit_price         NUMERIC(15,2) NOT NULL,
        item_name_snapshot VARCHAR(255) NOT NULL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_fnb_order_items_order_id ON fnb_order_items(order_id);
    `);

    // ── TABLE 23: trust_score_logs ────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE trust_score_logs (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES users(id),
        booking_id   UUID REFERENCES bookings(id),
        delta        NUMERIC(5,2) NOT NULL,
        score_before NUMERIC(5,2) NOT NULL,
        score_after  NUMERIC(5,2) NOT NULL,
        reason       trust_score_reason_enum NOT NULL,
        note         TEXT,
        created_by   UUID REFERENCES users(id),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_trust_score_logs_user_id ON trust_score_logs(user_id);
      CREATE INDEX idx_trust_score_logs_booking_id ON trust_score_logs(booking_id);
    `);

    // ── TABLE 24: notification_logs ───────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE notification_logs (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id),
        booking_id UUID REFERENCES bookings(id),
        type       VARCHAR(100) NOT NULL,
        channel    notification_channel_enum NOT NULL,
        title      VARCHAR(255) NOT NULL,
        body       TEXT NOT NULL,
        status     notification_status_enum NOT NULL DEFAULT 'PENDING',
        error      TEXT,
        sent_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_notification_logs_user_id ON notification_logs(user_id);
      CREATE INDEX idx_notification_logs_booking_id ON notification_logs(booking_id);
    `);

    // ── TABLE 25: vehicle_maintenance_logs ────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE vehicle_maintenance_logs (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id          UUID NOT NULL REFERENCES vehicles(id),
        type                maintenance_type_enum NOT NULL,
        description         TEXT NOT NULL,
        cost                NUMERIC(15,2),
        performed_by        UUID REFERENCES users(id),
        performed_at        TIMESTAMPTZ NOT NULL,
        next_scheduled_at   TIMESTAMPTZ,
        related_booking_id  UUID REFERENCES bookings(id),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_vehicle_maintenance_vehicle_id ON vehicle_maintenance_logs(vehicle_id);
      CREATE INDEX idx_vehicle_maintenance_performed_at ON vehicle_maintenance_logs(vehicle_id, performed_at DESC);
    `);

    // ── TABLE 26: reviews ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE reviews (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id  UUID NOT NULL UNIQUE REFERENCES bookings(id),
        cafe_id     UUID NOT NULL REFERENCES cafes(id),
        customer_id UUID NOT NULL REFERENCES users(id),
        rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT,
        is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_reviews_booking_id ON reviews(booking_id);
      CREATE INDEX idx_reviews_cafe_id ON reviews(cafe_id, is_visible, created_at DESC);
    `);

    // ── SEED: feature_flags ────────────────────────────────────────────────────

    await queryRunner.query(`
      INSERT INTO feature_flags (feature_key, display_name, is_enabled) VALUES
        ('FNB',                 'Quản lý F&B',                   TRUE),
        ('DISPUTE',             'Xử lý tranh chấp',               TRUE),
        ('EXTENSION',           'Gia hạn slot',                   TRUE),
        ('ANALYTICS',           'Báo cáo & Analytics',            TRUE),
        ('AI_DAMAGE_DETECTION', 'Phát hiện hư hỏng bằng AI',      FALSE),
        ('AI_CHATBOT',          'Chatbot hỗ trợ khách hàng (AI)', FALSE),
        ('AI_ANALYTICS',        'Phân tích dữ liệu bằng AI',      FALSE);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables theo thứ tự ngược (dependency cuối drop trước)
    await queryRunner.query(`
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS vehicle_maintenance_logs CASCADE;
      DROP TABLE IF EXISTS notification_logs CASCADE;
      DROP TABLE IF EXISTS trust_score_logs CASCADE;
      DROP TABLE IF EXISTS fnb_order_items CASCADE;
      DROP TABLE IF EXISTS fnb_orders CASCADE;
      DROP TABLE IF EXISTS disputes CASCADE;
      DROP TABLE IF EXISTS extension_proposals CASCADE;
      DROP TABLE IF EXISTS inspection_records CASCADE;
      DROP TABLE IF EXISTS payment_transactions CASCADE;
      DROP TABLE IF EXISTS payment_components CASCADE;
      DROP TABLE IF EXISTS promotion_usages CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS menu_items CASCADE;
      DROP TABLE IF EXISTS promotions CASCADE;
      DROP TABLE IF EXISTS feature_flags CASCADE;
      DROP TABLE IF EXISTS vehicle_images CASCADE;
      DROP TABLE IF EXISTS vehicles CASCADE;
      DROP TABLE IF EXISTS staff_cafe_assignments CASCADE;
      DROP TABLE IF EXISTS cafe_announcements CASCADE;
      DROP TABLE IF EXISTS cafe_closures CASCADE;
      DROP TABLE IF EXISTS cafe_images CASCADE;
      DROP TABLE IF EXISTS cafes CASCADE;
      DROP TABLE IF EXISTS password_reset_tokens CASCADE;
      DROP TABLE IF EXISTS refresh_tokens CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS maintenance_type_enum CASCADE;
      DROP TYPE IF EXISTS promo_applicable_to_enum CASCADE;
      DROP TYPE IF EXISTS discount_type_enum CASCADE;
      DROP TYPE IF EXISTS trust_score_reason_enum CASCADE;
      DROP TYPE IF EXISTS notification_status_enum CASCADE;
      DROP TYPE IF EXISTS notification_channel_enum CASCADE;
      DROP TYPE IF EXISTS fnb_order_status_enum CASCADE;
      DROP TYPE IF EXISTS fnb_order_type_enum CASCADE;
      DROP TYPE IF EXISTS dispute_favor_enum CASCADE;
      DROP TYPE IF EXISTS dispute_status_enum CASCADE;
      DROP TYPE IF EXISTS extension_proposal_status_enum CASCADE;
      DROP TYPE IF EXISTS inspection_type_enum CASCADE;
      DROP TYPE IF EXISTS payment_transaction_type_enum CASCADE;
      DROP TYPE IF EXISTS payment_component_status_enum CASCADE;
      DROP TYPE IF EXISTS payment_component_type_enum CASCADE;
      DROP TYPE IF EXISTS booking_status_enum CASCADE;
      DROP TYPE IF EXISTS booking_source_enum CASCADE;
      DROP TYPE IF EXISTS booking_mode_enum CASCADE;
      DROP TYPE IF EXISTS vehicle_status_enum CASCADE;
      DROP TYPE IF EXISTS vehicle_tier_enum CASCADE;
      DROP TYPE IF EXISTS cafe_status_enum CASCADE;
      DROP TYPE IF EXISTS user_role_enum CASCADE;
      DROP TYPE IF EXISTS auth_provider_enum CASCADE;
    `);
  }
}
