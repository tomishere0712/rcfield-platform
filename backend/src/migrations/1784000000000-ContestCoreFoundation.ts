import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContestCoreFoundation1784000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contest_formats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        supports_bracket BOOLEAN NOT NULL DEFAULT FALSE,
        supports_time_attack BOOLEAN NOT NULL DEFAULT FALSE,
        supports_multi_round BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contest_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_type_id UUID NOT NULL REFERENCES contest_types(id),
        contest_format_id UUID NOT NULL REFERENCES contest_formats(id),
        code VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        vehicle_policy_options JSONB NOT NULL DEFAULT '[]'::jsonb,
        feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_templates_unique_mapping
        ON contest_templates(contest_type_id, contest_format_id, code);
    `);

    await queryRunner.query(`
      ALTER TABLE contests
        ADD COLUMN IF NOT EXISTS provider_id UUID,
        ADD COLUMN IF NOT EXISTS track_type_id UUID,
        ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS banner_image_url TEXT,
        ADD COLUMN IF NOT EXISTS contest_type_id UUID,
        ADD COLUMN IF NOT EXISTS contest_format_id UUID,
        ADD COLUMN IF NOT EXISTS contest_template_id UUID,
        ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await queryRunner.query(`
      UPDATE contests c
      SET provider_id = cafes.provider_id
      FROM cafes
      WHERE c.cafe_id = cafes.id
        AND c.provider_id IS NULL;
    `);

    await queryRunner.query(`
      UPDATE contests c
      SET track_type_id = tt.id
      FROM track_types tt
      WHERE c.track_type_id IS NULL
        AND UPPER(TRIM(COALESCE(c.track_type, ''))) = UPPER(TRIM(tt.code));
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_cafes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        cafe_id UUID NOT NULL REFERENCES cafes(id),
        role VARCHAR(30) NOT NULL DEFAULT 'HOST',
        capacity_override INTEGER,
        check_in_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_cafes_unique
        ON contest_cafes(contest_id, cafe_id);
      CREATE INDEX IF NOT EXISTS idx_contest_cafes_cafe_id
        ON contest_cafes(cafe_id);
    `);

    await queryRunner.query(`
      INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order)
      SELECT c.id, c.cafe_id, 'HOST', 0
      FROM contests c
      WHERE c.cafe_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM contest_cafes cc
          WHERE cc.contest_id = c.id
            AND cc.cafe_id = c.cafe_id
        );
    `);

    await queryRunner.query(`
      ALTER TABLE contest_registrations
        ADD COLUMN IF NOT EXISTS participant_role_snapshot VARCHAR(30) NOT NULL DEFAULT 'CUSTOMER',
        ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id),
        ADD COLUMN IF NOT EXISTS check_in_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS checked_in_cafe_id UUID REFERENCES cafes(id),
        ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
        ADD COLUMN IF NOT EXISTS entry_fee_amount NUMERIC(15,2),
        ADD COLUMN IF NOT EXISTS entry_fee_due_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS entry_fee_marked_paid_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS entry_fee_marked_paid_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await queryRunner.query(`
      UPDATE contest_registrations
      SET check_in_code = COALESCE(check_in_code, SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12))
      WHERE check_in_code IS NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_registrations_check_in_code
        ON contest_registrations(check_in_code);
      CREATE INDEX IF NOT EXISTS idx_contest_registrations_contest_status
        ON contest_registrations(contest_id, status);
      CREATE INDEX IF NOT EXISTS idx_contest_registrations_user_id
        ON contest_registrations(user_id);
      CREATE INDEX IF NOT EXISTS idx_contest_registrations_booking_id
        ON contest_registrations(booking_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        cafe_id UUID NOT NULL REFERENCES cafes(id),
        track_config_id UUID REFERENCES cafe_track_configs(id),
        round_no INTEGER NOT NULL,
        match_no INTEGER NOT NULL,
        name VARCHAR(120),
        match_type VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        next_match_id UUID REFERENCES contest_matches(id),
        advancement_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
        result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by UUID REFERENCES users(id),
        decided_by UUID REFERENCES users(id),
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_contest_matches_unique
        ON contest_matches(contest_id, round_no, match_no);
      CREATE INDEX IF NOT EXISTS idx_contest_matches_contest_status
        ON contest_matches(contest_id, status);
      CREATE INDEX IF NOT EXISTS idx_contest_matches_next_match
        ON contest_matches(next_match_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_match_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES contest_matches(id) ON DELETE CASCADE,
        registration_id UUID NOT NULL REFERENCES contest_registrations(id),
        slot_no INTEGER NOT NULL,
        lane VARCHAR(20),
        grid_position INTEGER,
        seed_no INTEGER,
        status VARCHAR(30) NOT NULL DEFAULT 'READY',
        score NUMERIC(10,2),
        finish_position INTEGER,
        best_lap_ms INTEGER,
        total_time_ms INTEGER,
        is_winner BOOLEAN NOT NULL DEFAULT FALSE,
        result_note TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participants_registration
        ON contest_match_participants(match_id, registration_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participants_slot
        ON contest_match_participants(match_id, slot_no);
      CREATE INDEX IF NOT EXISTS idx_match_participants_registration_id
        ON contest_match_participants(registration_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contest_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        registration_id UUID REFERENCES contest_registrations(id),
        match_id UUID REFERENCES contest_matches(id),
        actor_id UUID REFERENCES users(id),
        actor_role VARCHAR(30),
        event_type VARCHAR(80) NOT NULL,
        before_json JSONB,
        after_json JSONB,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_contest_created
        ON contest_audit_logs(contest_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_event_type
        ON contest_audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_registration
        ON contest_audit_logs(registration_id);
      CREATE INDEX IF NOT EXISTS idx_contest_audit_logs_match
        ON contest_audit_logs(match_id);
    `);

    await queryRunner
      .query(
        `
      ALTER TABLE contests
        ADD CONSTRAINT fk_contests_provider_id
        FOREIGN KEY (provider_id) REFERENCES users(id);
    `,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `
      ALTER TABLE contests
        ADD CONSTRAINT fk_contests_track_type_id
        FOREIGN KEY (track_type_id) REFERENCES track_types(id);
    `,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `
      ALTER TABLE contests
        ADD CONSTRAINT fk_contests_contest_type_id
        FOREIGN KEY (contest_type_id) REFERENCES contest_types(id);
    `,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `
      ALTER TABLE contests
        ADD CONSTRAINT fk_contests_contest_format_id
        FOREIGN KEY (contest_format_id) REFERENCES contest_formats(id);
    `,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `
      ALTER TABLE contests
        ADD CONSTRAINT fk_contests_contest_template_id
        FOREIGN KEY (contest_template_id) REFERENCES contest_templates(id);
    `,
      )
      .catch(() => undefined);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contests_provider_status
        ON contests(provider_id, status);
      CREATE INDEX IF NOT EXISTS idx_contests_status_starts
        ON contests(status, starts_at);
      CREATE INDEX IF NOT EXISTS idx_contests_registration_window
        ON contests(registration_opens_at, registration_closes_at);
      CREATE INDEX IF NOT EXISTS idx_contests_type_format
        ON contests(contest_type_id, contest_format_id);
    `);

    await queryRunner.query(`
      INSERT INTO contest_types (code, name, description, is_active, sort_order, metadata)
      VALUES
        ('PROVIDER_STANDARD', 'Provider Standard', 'Contest do provider van hanh trong he thong cafe cua minh', TRUE, 0, '{}'::jsonb)
      ON CONFLICT (code) DO NOTHING;

      INSERT INTO contest_formats (code, name, description, supports_bracket, supports_time_attack, supports_multi_round, is_active, sort_order, metadata)
      VALUES
        ('TIME_TRIAL', 'Time Trial', 'Xep hang dua tren best lap hoac tong thoi gian', FALSE, TRUE, FALSE, TRUE, 0, '{}'::jsonb),
        ('KNOCKOUT', 'Knockout', 'Dau loai truc tiep theo nhanh dau', TRUE, FALSE, TRUE, TRUE, 1, '{}'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO contest_templates (
        contest_type_id,
        contest_format_id,
        code,
        name,
        description,
        default_config,
        vehicle_policy_options,
        feature_flags,
        is_active,
        sort_order
      )
      SELECT
        ct.id,
        cf.id,
        'provider_standard_time_trial',
        'Provider Standard Time Trial',
        'Template mac dinh cho giai provider format time trial',
        '{"format":"TIME_TRIAL","drivers_per_match":1,"seeding_mode":"CHECK_IN_ORDER","leaderboard_mode":"BEST_LAP"}'::jsonb,
        '["RENTAL_ONLY","MIXED","BYOC_ONLY"]'::jsonb,
        '{"supports_entry_fee":true,"supports_booking_link":true,"supports_manual_results":true}'::jsonb,
        TRUE,
        0
      FROM contest_types ct
      CROSS JOIN contest_formats cf
      WHERE ct.code = 'PROVIDER_STANDARD'
        AND cf.code = 'TIME_TRIAL'
        AND NOT EXISTS (
          SELECT 1 FROM contest_templates t WHERE t.code = 'provider_standard_time_trial'
        );
    `);

    await queryRunner.query(`
      INSERT INTO contest_templates (
        contest_type_id,
        contest_format_id,
        code,
        name,
        description,
        default_config,
        vehicle_policy_options,
        feature_flags,
        is_active,
        sort_order
      )
      SELECT
        ct.id,
        cf.id,
        'provider_standard_knockout',
        'Provider Standard Knockout',
        'Template mac dinh cho giai provider format knockout',
        '{"format":"KNOCKOUT","drivers_per_match":2,"seeding_mode":"MANUAL","auto_bye":true}'::jsonb,
        '["RENTAL_ONLY","MIXED","BYOC_ONLY"]'::jsonb,
        '{"supports_entry_fee":true,"supports_booking_link":true,"supports_manual_results":true,"supports_bracket":true}'::jsonb,
        TRUE,
        1
      FROM contest_types ct
      CROSS JOIN contest_formats cf
      WHERE ct.code = 'PROVIDER_STANDARD'
        AND cf.code = 'KNOCKOUT'
        AND NOT EXISTS (
          SELECT 1 FROM contest_templates t WHERE t.code = 'provider_standard_knockout'
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contest_audit_logs CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_match_participants CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_matches CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_cafes CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_templates CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_formats CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS contest_types CASCADE;`);

    await queryRunner.query(`
      ALTER TABLE contest_registrations
        DROP COLUMN IF EXISTS participant_role_snapshot,
        DROP COLUMN IF EXISTS booking_id,
        DROP COLUMN IF EXISTS check_in_code,
        DROP COLUMN IF EXISTS checked_in_cafe_id,
        DROP COLUMN IF EXISTS checked_in_by,
        DROP COLUMN IF EXISTS checked_in_at,
        DROP COLUMN IF EXISTS cancelled_by,
        DROP COLUMN IF EXISTS cancelled_at,
        DROP COLUMN IF EXISTS cancellation_reason,
        DROP COLUMN IF EXISTS payment_status,
        DROP COLUMN IF EXISTS entry_fee_amount,
        DROP COLUMN IF EXISTS entry_fee_due_at,
        DROP COLUMN IF EXISTS entry_fee_marked_paid_by,
        DROP COLUMN IF EXISTS entry_fee_marked_paid_at,
        DROP COLUMN IF EXISTS metadata;
    `);

    await queryRunner.query(`
      ALTER TABLE contests
        DROP COLUMN IF EXISTS provider_id,
        DROP COLUMN IF EXISTS track_type_id,
        DROP COLUMN IF EXISTS registration_opens_at,
        DROP COLUMN IF EXISTS registration_closes_at,
        DROP COLUMN IF EXISTS banner_image_url,
        DROP COLUMN IF EXISTS contest_type_id,
        DROP COLUMN IF EXISTS contest_format_id,
        DROP COLUMN IF EXISTS contest_template_id,
        DROP COLUMN IF EXISTS config,
        DROP COLUMN IF EXISTS deleted_at;
    `);
  }
}
