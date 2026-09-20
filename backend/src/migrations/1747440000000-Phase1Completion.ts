import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1Completion1747440000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── STEP 1: New enum types ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE play_mode_enum AS ENUM ('RENTAL', 'BYOC', 'MIXED');
      CREATE TYPE session_status_enum AS ENUM ('CHECKED_IN', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT', 'COMPLETED', 'CANCELLED');
      CREATE TYPE participant_type_enum AS ENUM ('BOOKER', 'REGISTERED_USER', 'WALK_IN_GUEST');
      CREATE TYPE participant_role_enum AS ENUM ('DRIVER', 'PLAYER', 'SPECTATOR', 'GUARDIAN');
      CREATE TYPE vehicle_source_enum AS ENUM ('RENTAL', 'BYOC');
      CREATE TYPE session_vehicle_status_enum AS ENUM ('ASSIGNED', 'IN_USE', 'RETURNED', 'DAMAGED');
      CREATE TYPE inspection_subject_type_enum AS ENUM ('RENTAL_VEHICLE', 'BYOC_VEHICLE');
      CREATE TYPE inspection_item_status_enum AS ENUM ('OK', 'SCRATCHED', 'BROKEN', 'MISSING', 'DIRTY', 'NEEDS_REVIEW');
      CREATE TYPE photo_angle_enum AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'DETAIL', 'OTHER');
      CREATE TYPE incident_type_enum AS ENUM ('RENTAL_DAMAGE', 'BYOC_DAMAGE', 'COLLISION', 'LOST_ACCESSORY', 'STAFF_HANDLING', 'FACILITY', 'OTHER');
      CREATE TYPE incident_status_enum AS ENUM ('RECORDED', 'REVIEWED', 'RESOLVED', 'WAIVED');
      CREATE TYPE responsible_party_enum AS ENUM ('CUSTOMER', 'PROVIDER', 'STAFF', 'SHARED', 'UNKNOWN');
      CREATE TYPE package_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
      CREATE TYPE customer_package_status_enum AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED', 'CANCELLED');
      CREATE TYPE subscription_status_enum AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');
      CREATE TYPE contest_status_enum AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED');
      CREATE TYPE contest_registration_status_enum AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN');
    `);

    // ── STEP 2: Fix existing enum types ────────────────────────────────────
    // Each DDL is a separate query() call — PostgreSQL can't ALTER column type
    // in the same batch as CREATE TYPE because it resolves types at parse time.
    // Partial indexes using the old enum must be dropped first.

    // booking_mode_enum: RENTAL/BYOC → SINGLE/PACKAGE/SUBSCRIPTION
    await queryRunner.query(
      `CREATE TYPE booking_mode_new_enum AS ENUM ('SINGLE', 'PACKAGE', 'SUBSCRIPTION');`,
    );
    await queryRunner.query(`ALTER TABLE bookings ALTER COLUMN mode DROP DEFAULT;`);
    await queryRunner.query(
      `ALTER TABLE bookings ALTER COLUMN mode TYPE booking_mode_new_enum USING 'SINGLE'::booking_mode_new_enum;`,
    );
    await queryRunner.query(`DROP TYPE booking_mode_enum;`);
    await queryRunner.query(`ALTER TYPE booking_mode_new_enum RENAME TO booking_mode_enum;`);

    // booking_status_enum: remove ACTIVE/EXTENDING/CHECKING_OUT/DISPUTED, add NO_SHOW
    // Must drop partial indexes first: idx_bookings_payment_expires (WHERE status = 'PENDING')
    // and idx_bookings_vehicle_slot (WHERE status NOT IN ('CANCELLED')) before ALTER
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_payment_expires;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_vehicle_slot;`);
    await queryRunner.query(
      `CREATE TYPE booking_status_new_enum AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');`,
    );
    await queryRunner.query(`ALTER TABLE bookings ALTER COLUMN status DROP DEFAULT;`);
    await queryRunner.query(`
      ALTER TABLE bookings ALTER COLUMN status TYPE booking_status_new_enum
      USING CASE
        WHEN status::text = 'PENDING'   THEN 'PENDING'::booking_status_new_enum
        WHEN status::text = 'COMPLETED' THEN 'COMPLETED'::booking_status_new_enum
        WHEN status::text = 'CANCELLED' THEN 'CANCELLED'::booking_status_new_enum
        ELSE 'CONFIRMED'::booking_status_new_enum
      END;
    `);
    await queryRunner.query(
      `ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'PENDING'::booking_status_new_enum;`,
    );
    await queryRunner.query(`DROP TYPE booking_status_enum;`);
    await queryRunner.query(`ALTER TYPE booking_status_new_enum RENAME TO booking_status_enum;`);
    // Recreate payment_expires partial index (vehicle_slot not recreated — vehicle_id is being dropped)
    await queryRunner.query(
      `CREATE INDEX idx_bookings_payment_expires ON bookings(payment_expires_at) WHERE status = 'PENDING';`,
    );

    // booking_source_enum: add SYSTEM_SUBSCRIPTION
    await queryRunner.query(
      `ALTER TYPE booking_source_enum ADD VALUE IF NOT EXISTS 'SYSTEM_SUBSCRIPTION';`,
    );

    // payment_component_type_enum: rename FB_PREORDER → FNB_PREORDER, add new values
    await queryRunner.query(`
      CREATE TYPE payment_component_type_new_enum AS ENUM (
        'SLOT_FEE', 'RENTAL_FEE', 'SECURITY_DEPOSIT', 'EXTENSION_FEE',
        'DAMAGE_CHARGE', 'FNB_PREORDER', 'FNB_ON_SITE', 'PACKAGE_PURCHASE', 'CONTEST_ENTRY'
      );
    `);
    await queryRunner.query(`ALTER TABLE payment_components ALTER COLUMN type DROP DEFAULT;`);
    await queryRunner.query(`
      ALTER TABLE payment_components ALTER COLUMN type TYPE payment_component_type_new_enum
      USING CASE
        WHEN type::text = 'FB_PREORDER' THEN 'FNB_PREORDER'::payment_component_type_new_enum
        ELSE type::text::payment_component_type_new_enum
      END;
    `);
    await queryRunner.query(`DROP TYPE payment_component_type_enum;`);
    await queryRunner.query(
      `ALTER TYPE payment_component_type_new_enum RENAME TO payment_component_type_enum;`,
    );

    // payment_component_status_enum: add CAPTURED
    await queryRunner.query(
      `ALTER TYPE payment_component_status_enum ADD VALUE IF NOT EXISTS 'CAPTURED';`,
    );

    // payment_transaction_type_enum: add CAPTURE, VOID
    await queryRunner.query(
      `ALTER TYPE payment_transaction_type_enum ADD VALUE IF NOT EXISTS 'CAPTURE';`,
    );
    await queryRunner.query(
      `ALTER TYPE payment_transaction_type_enum ADD VALUE IF NOT EXISTS 'VOID';`,
    );

    // inspection_type_enum: add STAFF_HANDOVER
    await queryRunner.query(
      `ALTER TYPE inspection_type_enum ADD VALUE IF NOT EXISTS 'STAFF_HANDOVER';`,
    );

    // extension_proposal_status_enum: add CANCELLED
    await queryRunner.query(
      `ALTER TYPE extension_proposal_status_enum ADD VALUE IF NOT EXISTS 'CANCELLED';`,
    );

    // fnb_order_status_enum: add PREPARING
    await queryRunner.query(
      `ALTER TYPE fnb_order_status_enum ADD VALUE IF NOT EXISTS 'PREPARING';`,
    );

    // trust_score_reason_enum: remove DISPUTE_LOST
    await queryRunner.query(
      `CREATE TYPE trust_score_reason_new_enum AS ENUM ('NO_SHOW', 'DAMAGE_CONFIRMED', 'BOOKING_STREAK', 'ADMIN_ADJUSTMENT');`,
    );
    await queryRunner.query(`ALTER TABLE trust_score_logs ALTER COLUMN reason DROP DEFAULT;`);
    await queryRunner.query(`
      ALTER TABLE trust_score_logs ALTER COLUMN reason TYPE trust_score_reason_new_enum
      USING CASE
        WHEN reason::text = 'DISPUTE_LOST' THEN 'DAMAGE_CONFIRMED'::trust_score_reason_new_enum
        ELSE reason::text::trust_score_reason_new_enum
      END;
    `);
    await queryRunner.query(`DROP TYPE trust_score_reason_enum;`);
    await queryRunner.query(
      `ALTER TYPE trust_score_reason_new_enum RENAME TO trust_score_reason_enum;`,
    );

    // promo_applicable_to_enum: add MIXED
    await queryRunner.query(`ALTER TYPE promo_applicable_to_enum ADD VALUE IF NOT EXISTS 'MIXED';`);

    // ── STEP 3: Fix bookings table ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE bookings RENAME COLUMN mode TO booking_mode;
      ALTER TABLE bookings ALTER COLUMN booking_mode SET DEFAULT 'SINGLE';

      DROP INDEX IF EXISTS idx_bookings_vehicle_id;
      DROP INDEX IF EXISTS idx_bookings_vehicle_slot;
      ALTER TABLE bookings DROP COLUMN IF EXISTS vehicle_id;

      ALTER TABLE bookings ADD COLUMN play_mode play_mode_enum NOT NULL DEFAULT 'RENTAL';
      ALTER TABLE bookings ADD COLUMN subscription_id UUID;

      CREATE INDEX idx_bookings_cafe_slot ON bookings(cafe_id, track_type, slot_start, slot_end);
    `);

    // ── STEP 4: Create subscriptions (referenced by bookings FK) ───────────
    await queryRunner.query(`
      CREATE TABLE subscriptions (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id        UUID NOT NULL REFERENCES cafes(id),
        customer_id    UUID NOT NULL REFERENCES users(id),
        play_mode      play_mode_enum NOT NULL,
        track_type     VARCHAR(50) NOT NULL,
        frequency_rule JSONB NOT NULL,
        slot_count     INTEGER NOT NULL DEFAULT 1,
        starts_at      TIMESTAMPTZ NOT NULL,
        ends_at        TIMESTAMPTZ,
        status         subscription_status_enum NOT NULL DEFAULT 'ACTIVE',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_subscriptions_cafe_id ON subscriptions(cafe_id);
      CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
      CREATE INDEX idx_subscriptions_status ON subscriptions(status);
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        ADD CONSTRAINT fk_bookings_subscription_id
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);
    `);

    // ── STEP 5: customer_vehicles ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE customer_vehicles (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id   UUID NOT NULL REFERENCES users(id),
        brand         VARCHAR(100),
        model         VARCHAR(100),
        serial_number VARCHAR(100),
        description   TEXT,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );

      CREATE INDEX idx_customer_vehicles_customer_id ON customer_vehicles(customer_id);
    `);

    // ── STEP 6: sessions ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE sessions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id          UUID NOT NULL REFERENCES bookings(id),
        cafe_id             UUID NOT NULL REFERENCES cafes(id),
        status              session_status_enum NOT NULL DEFAULT 'CHECKED_IN',
        checked_in_by       UUID NOT NULL REFERENCES users(id),
        checked_out_by      UUID REFERENCES users(id),
        actual_start_at     TIMESTAMPTZ NOT NULL,
        actual_end_at       TIMESTAMPTZ,
        planned_end_at      TIMESTAMPTZ NOT NULL,
        actual_total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_sessions_booking_id ON sessions(booking_id);
      CREATE INDEX idx_sessions_cafe_id ON sessions(cafe_id);
      CREATE INDEX idx_sessions_status ON sessions(status);
    `);

    // ── STEP 7: booking_participants ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE booking_participants (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id             UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        user_id                UUID REFERENCES users(id),
        participant_type       participant_type_enum NOT NULL,
        display_name           VARCHAR(255),
        phone                  VARCHAR(20),
        is_primary_responsible BOOLEAN NOT NULL DEFAULT FALSE,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_booking_participants_booking_id ON booking_participants(booking_id);
    `);

    // ── STEP 8: booking_vehicles ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE booking_vehicles (
        id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id                  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        vehicle_id                  UUID NOT NULL REFERENCES vehicles(id),
        assigned_to_participant_id  UUID REFERENCES booking_participants(id),
        hourly_rate_snapshot        NUMERIC(15,2) NOT NULL,
        security_deposit_snapshot   NUMERIC(15,2) NOT NULL,
        damage_multiplier_snapshot  NUMERIC(4,2)  NOT NULL,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_booking_vehicles_unique ON booking_vehicles(booking_id, vehicle_id);
      CREATE INDEX idx_booking_vehicles_booking_id ON booking_vehicles(booking_id);
    `);

    // ── STEP 9: session_participants ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE session_participants (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id             UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        booking_participant_id UUID REFERENCES booking_participants(id),
        user_id                UUID REFERENCES users(id),
        display_name           VARCHAR(255),
        phone                  VARCHAR(20),
        role                   participant_role_enum NOT NULL,
        is_primary_responsible BOOLEAN NOT NULL DEFAULT FALSE,
        checked_in_at          TIMESTAMPTZ NOT NULL,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_session_participants_session_id ON session_participants(session_id);
    `);

    // ── STEP 10: session_vehicles ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE session_vehicles (
        id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id                 UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        booking_vehicle_id         UUID REFERENCES booking_vehicles(id),
        vehicle_source             vehicle_source_enum NOT NULL,
        vehicle_id                 UUID REFERENCES vehicles(id),
        customer_vehicle_id        UUID REFERENCES customer_vehicles(id),
        assigned_to_participant_id UUID REFERENCES session_participants(id),
        status                     session_vehicle_status_enum NOT NULL DEFAULT 'ASSIGNED',
        started_at                 TIMESTAMPTZ,
        returned_at                TIMESTAMPTZ,
        notes                      TEXT,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_session_vehicles_session_id ON session_vehicles(session_id);
    `);

    // ── STEP 11: Drop inspection_records → create inspections + sub-tables ──
    await queryRunner.query(`DROP TABLE IF EXISTS inspection_records;`);

    await queryRunner.query(`
      CREATE TABLE inspections (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id            UUID NOT NULL REFERENCES sessions(id),
        session_vehicle_id    UUID REFERENCES session_vehicles(id),
        type                  inspection_type_enum NOT NULL,
        subject_type          inspection_subject_type_enum NOT NULL,
        performed_by          UUID NOT NULL REFERENCES users(id),
        pre_existing_flag     BOOLEAN NOT NULL DEFAULT FALSE,
        damage_noted          BOOLEAN NOT NULL DEFAULT FALSE,
        damage_description    TEXT,
        damage_cost_estimate  NUMERIC(15,2),
        ai_analysis_json      JSONB,
        customer_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
        customer_confirmed_at TIMESTAMPTZ,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_inspections_session_id ON inspections(session_id);
    `);

    await queryRunner.query(`
      CREATE TABLE inspection_photos (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        angle         photo_angle_enum NOT NULL,
        url           TEXT NOT NULL,
        uploaded_by   UUID NOT NULL REFERENCES users(id),
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_inspection_photos_inspection_id ON inspection_photos(inspection_id);
    `);

    await queryRunner.query(`
      CREATE TABLE inspection_checklists (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        item_key      VARCHAR(100) NOT NULL,
        item_label    VARCHAR(255) NOT NULL,
        status        inspection_item_status_enum NOT NULL,
        note          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_inspection_checklists_inspection_id ON inspection_checklists(inspection_id);
    `);

    // ── STEP 12: incidents ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE incidents (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id        UUID NOT NULL REFERENCES sessions(id),
        reported_by       UUID NOT NULL REFERENCES users(id),
        type              incident_type_enum NOT NULL,
        status            incident_status_enum NOT NULL DEFAULT 'RECORDED',
        occurred_at       TIMESTAMPTZ NOT NULL,
        description       TEXT NOT NULL,
        estimated_amount  NUMERIC(15,2),
        responsible_party responsible_party_enum NOT NULL DEFAULT 'UNKNOWN',
        final_amount      NUMERIC(15,2),
        resolution_note   TEXT,
        resolved_by       UUID REFERENCES users(id),
        resolved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_incidents_session_id ON incidents(session_id);
      CREATE INDEX idx_incidents_status ON incidents(status);
    `);

    // ── STEP 13: packages, customer_packages, package_usages ───────────────
    await queryRunner.query(`
      CREATE TABLE packages (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id               UUID NOT NULL REFERENCES cafes(id),
        name                  VARCHAR(255) NOT NULL,
        description           TEXT,
        slot_count            INTEGER NOT NULL,
        price                 NUMERIC(15,2) NOT NULL,
        valid_days            INTEGER NOT NULL,
        applicable_play_modes TEXT[] NOT NULL DEFAULT '{}',
        status                package_status_enum NOT NULL DEFAULT 'ACTIVE',
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at            TIMESTAMPTZ
      );

      CREATE INDEX idx_packages_cafe_id ON packages(cafe_id);
    `);

    await queryRunner.query(`
      CREATE TABLE customer_packages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id      UUID NOT NULL REFERENCES packages(id),
        customer_id     UUID NOT NULL REFERENCES users(id),
        remaining_slots INTEGER NOT NULL,
        purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ,
        status          customer_package_status_enum NOT NULL DEFAULT 'ACTIVE',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_customer_packages_customer_id ON customer_packages(customer_id);
      CREATE INDEX idx_customer_packages_status ON customer_packages(status);
    `);

    await queryRunner.query(`
      CREATE TABLE package_usages (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_package_id UUID NOT NULL REFERENCES customer_packages(id),
        booking_id          UUID NOT NULL REFERENCES bookings(id),
        used_slots          INTEGER NOT NULL DEFAULT 1,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_package_usages_customer_package_id ON package_usages(customer_package_id);
      CREATE INDEX idx_package_usages_booking_id ON package_usages(booking_id);
    `);

    // ── STEP 14: contests, contest_registrations ────────────────────────────
    await queryRunner.query(`
      CREATE TABLE contests (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id      UUID NOT NULL REFERENCES cafes(id),
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        track_type   VARCHAR(50) NOT NULL,
        vehicle_rule JSONB,
        starts_at    TIMESTAMPTZ NOT NULL,
        ends_at      TIMESTAMPTZ NOT NULL,
        capacity     INTEGER,
        entry_fee    NUMERIC(15,2) NOT NULL DEFAULT 0,
        status       contest_status_enum NOT NULL DEFAULT 'DRAFT',
        created_by   UUID NOT NULL REFERENCES users(id),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_contests_cafe_id ON contests(cafe_id);
      CREATE INDEX idx_contests_status ON contests(status);
    `);

    await queryRunner.query(`
      CREATE TABLE contest_registrations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id          UUID NOT NULL REFERENCES contests(id),
        user_id             UUID NOT NULL REFERENCES users(id),
        vehicle_source      vehicle_source_enum NOT NULL,
        vehicle_id          UUID REFERENCES vehicles(id),
        customer_vehicle_id UUID REFERENCES customer_vehicles(id),
        status              contest_registration_status_enum NOT NULL DEFAULT 'PENDING',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX idx_contest_registrations_unique ON contest_registrations(contest_id, user_id);
      CREATE INDEX idx_contest_registrations_contest_id ON contest_registrations(contest_id);
    `);

    // ── STEP 15: Add session_id FKs to existing tables ──────────────────────
    await queryRunner.query(`
      ALTER TABLE payment_components   ADD COLUMN session_id UUID REFERENCES sessions(id);
      ALTER TABLE payment_transactions ADD COLUMN session_id UUID REFERENCES sessions(id);
      ALTER TABLE notification_logs    ADD COLUMN session_id UUID REFERENCES sessions(id);
      ALTER TABLE trust_score_logs     ADD COLUMN session_id UUID REFERENCES sessions(id);
    `);

    // vehicle_maintenance_logs: related_booking_id → related_session_id
    await queryRunner.query(`
      ALTER TABLE vehicle_maintenance_logs DROP COLUMN IF EXISTS related_booking_id;
      ALTER TABLE vehicle_maintenance_logs ADD COLUMN related_session_id UUID REFERENCES sessions(id);
    `);

    // ── STEP 16: Fix extension_proposals (booking_id → session_id) ──────────
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_extension_proposals_booking_id;
      ALTER TABLE extension_proposals DROP CONSTRAINT IF EXISTS extension_proposals_booking_id_fkey;
      ALTER TABLE extension_proposals DROP COLUMN IF EXISTS booking_id;
      ALTER TABLE extension_proposals ADD COLUMN session_id UUID NOT NULL REFERENCES sessions(id);
      ALTER TABLE extension_proposals ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX idx_extension_proposals_session_id ON extension_proposals(session_id);
    `);

    // ── STEP 17: fnb_orders — add session_id FK ─────────────────────────────
    await queryRunner.query(`
      ALTER TABLE fnb_orders ADD COLUMN session_id UUID REFERENCES sessions(id);
      CREATE INDEX idx_fnb_orders_session_id ON fnb_orders(session_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fnb_orders DROP COLUMN IF EXISTS session_id;

      DROP INDEX IF EXISTS idx_extension_proposals_session_id;
      ALTER TABLE extension_proposals DROP COLUMN IF EXISTS session_id;
      ALTER TABLE extension_proposals DROP COLUMN IF EXISTS updated_at;
      ALTER TABLE extension_proposals ADD COLUMN booking_id UUID REFERENCES bookings(id);

      ALTER TABLE vehicle_maintenance_logs DROP COLUMN IF EXISTS related_session_id;
      ALTER TABLE vehicle_maintenance_logs ADD COLUMN related_booking_id UUID REFERENCES bookings(id);

      ALTER TABLE trust_score_logs     DROP COLUMN IF EXISTS session_id;
      ALTER TABLE notification_logs    DROP COLUMN IF EXISTS session_id;
      ALTER TABLE payment_transactions DROP COLUMN IF EXISTS session_id;
      ALTER TABLE payment_components   DROP COLUMN IF EXISTS session_id;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS contest_registrations CASCADE;
      DROP TABLE IF EXISTS contests CASCADE;
      DROP TABLE IF EXISTS package_usages CASCADE;
      DROP TABLE IF EXISTS customer_packages CASCADE;
      DROP TABLE IF EXISTS packages CASCADE;
      DROP TABLE IF EXISTS incidents CASCADE;
      DROP TABLE IF EXISTS inspection_checklists CASCADE;
      DROP TABLE IF EXISTS inspection_photos CASCADE;
      DROP TABLE IF EXISTS inspections CASCADE;
      DROP TABLE IF EXISTS session_vehicles CASCADE;
      DROP TABLE IF EXISTS session_participants CASCADE;
      DROP TABLE IF EXISTS booking_vehicles CASCADE;
      DROP TABLE IF EXISTS booking_participants CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS customer_vehicles CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE bookings DROP CONSTRAINT IF EXISTS fk_bookings_subscription_id;
      ALTER TABLE bookings DROP COLUMN IF EXISTS subscription_id;
      ALTER TABLE bookings DROP COLUMN IF EXISTS play_mode;
      DROP INDEX IF EXISTS idx_bookings_cafe_slot;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions CASCADE;`);

    // Restore bookings.mode with old enum
    await queryRunner.query(`
      CREATE TYPE booking_mode_old_enum AS ENUM ('RENTAL', 'BYOC');
      ALTER TABLE bookings ALTER COLUMN booking_mode DROP DEFAULT;
      ALTER TABLE bookings
        ALTER COLUMN booking_mode TYPE booking_mode_old_enum
        USING 'RENTAL'::booking_mode_old_enum;
      ALTER TABLE bookings RENAME COLUMN booking_mode TO mode;
      ALTER TABLE bookings ADD COLUMN vehicle_id UUID REFERENCES vehicles(id);
      DROP TYPE IF EXISTS booking_mode_enum;
      ALTER TYPE booking_mode_old_enum RENAME TO booking_mode_enum;
    `);

    // Restore booking_status_enum
    await queryRunner.query(`
      CREATE TYPE booking_status_old_enum AS ENUM (
        'PENDING', 'CONFIRMED', 'ACTIVE', 'EXTENDING',
        'CHECKING_OUT', 'DISPUTED', 'COMPLETED', 'CANCELLED'
      );
      ALTER TABLE bookings ALTER COLUMN status DROP DEFAULT;
      ALTER TABLE bookings
        ALTER COLUMN status TYPE booking_status_old_enum
        USING status::text::booking_status_old_enum;
      ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'PENDING'::booking_status_old_enum;
      DROP TYPE IF EXISTS booking_status_enum;
      ALTER TYPE booking_status_old_enum RENAME TO booking_status_enum;
    `);

    // Restore payment_component_type_enum (FB_PREORDER)
    await queryRunner.query(`
      CREATE TYPE payment_component_type_old_enum AS ENUM (
        'SLOT_FEE', 'RENTAL_FEE', 'SECURITY_DEPOSIT',
        'EXTENSION_FEE', 'DAMAGE_CHARGE', 'FB_PREORDER'
      );
      ALTER TABLE payment_components ALTER COLUMN type DROP DEFAULT;
      ALTER TABLE payment_components
        ALTER COLUMN type TYPE payment_component_type_old_enum
        USING CASE
          WHEN type::text = 'FNB_PREORDER' THEN 'FB_PREORDER'::payment_component_type_old_enum
          WHEN type::text IN ('FNB_ON_SITE','PACKAGE_PURCHASE','CONTEST_ENTRY') THEN 'SLOT_FEE'::payment_component_type_old_enum
          ELSE type::text::payment_component_type_old_enum
        END;
      DROP TYPE IF EXISTS payment_component_type_enum;
      ALTER TYPE payment_component_type_old_enum RENAME TO payment_component_type_enum;
    `);

    // Restore trust_score_reason_enum
    await queryRunner.query(`
      CREATE TYPE trust_score_reason_old_enum AS ENUM (
        'NO_SHOW', 'DAMAGE_CONFIRMED', 'DISPUTE_LOST', 'BOOKING_STREAK', 'ADMIN_ADJUSTMENT'
      );
      ALTER TABLE trust_score_logs ALTER COLUMN reason DROP DEFAULT;
      ALTER TABLE trust_score_logs
        ALTER COLUMN reason TYPE trust_score_reason_old_enum
        USING reason::text::trust_score_reason_old_enum;
      DROP TYPE IF EXISTS trust_score_reason_enum;
      ALTER TYPE trust_score_reason_old_enum RENAME TO trust_score_reason_enum;
    `);

    // Restore inspection_records
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
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS contest_registration_status_enum CASCADE;
      DROP TYPE IF EXISTS contest_status_enum CASCADE;
      DROP TYPE IF EXISTS subscription_status_enum CASCADE;
      DROP TYPE IF EXISTS customer_package_status_enum CASCADE;
      DROP TYPE IF EXISTS package_status_enum CASCADE;
      DROP TYPE IF EXISTS responsible_party_enum CASCADE;
      DROP TYPE IF EXISTS incident_status_enum CASCADE;
      DROP TYPE IF EXISTS incident_type_enum CASCADE;
      DROP TYPE IF EXISTS photo_angle_enum CASCADE;
      DROP TYPE IF EXISTS inspection_item_status_enum CASCADE;
      DROP TYPE IF EXISTS inspection_subject_type_enum CASCADE;
      DROP TYPE IF EXISTS session_vehicle_status_enum CASCADE;
      DROP TYPE IF EXISTS vehicle_source_enum CASCADE;
      DROP TYPE IF EXISTS participant_role_enum CASCADE;
      DROP TYPE IF EXISTS participant_type_enum CASCADE;
      DROP TYPE IF EXISTS session_status_enum CASCADE;
      DROP TYPE IF EXISTS play_mode_enum CASCADE;
    `);
  }
}
