import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniversalRacingNetworkMinimal1784100000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS racing_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await queryRunner.query(`
      UPDATE users
      SET racing_profile = COALESCE(racing_profile, '{}'::jsonb)
      WHERE racing_profile IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS achievement_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        description TEXT,
        badge_icon_url TEXT,
        title_label VARCHAR(120),
        rule_code VARCHAR(80) NOT NULL,
        rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS race_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id UUID NOT NULL REFERENCES users(id),
        cafe_id UUID NOT NULL REFERENCES cafes(id),
        track_config_id UUID REFERENCES cafe_track_configs(id),
        contest_id UUID REFERENCES contests(id) ON DELETE SET NULL,
        match_id UUID REFERENCES contest_matches(id) ON DELETE SET NULL,
        contest_match_participant_id UUID REFERENCES contest_match_participants(id) ON DELETE SET NULL,
        session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
        vehicle_source VARCHAR(20) NOT NULL,
        source_type VARCHAR(30) NOT NULL,
        verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        best_lap_ms INTEGER,
        total_time_ms INTEGER,
        score NUMERIC(10,2),
        finish_position INTEGER,
        recorded_at TIMESTAMPTZ NOT NULL,
        verified_at TIMESTAMPTZ,
        verified_by UUID REFERENCES users(id),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_racing_profile_handle
        ON users ((lower(racing_profile->>'driver_handle')))
        WHERE deleted_at IS NULL AND COALESCE(racing_profile->>'driver_handle', '') <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_racing_profile_handle_unique
        ON users ((lower(racing_profile->>'driver_handle')))
        WHERE deleted_at IS NULL AND COALESCE(racing_profile->>'driver_handle', '') <> '';
      CREATE INDEX IF NOT EXISTS idx_race_records_leaderboard
        ON race_records(verification_status, cafe_id, track_config_id, vehicle_source, best_lap_ms);
      CREATE INDEX IF NOT EXISTS idx_race_records_driver_time
        ON race_records(user_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_race_records_contest_source
        ON race_records(contest_id, match_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_race_records_contest_participant_active
        ON race_records(contest_match_participant_id)
        WHERE contest_match_participant_id IS NOT NULL AND verification_status <> 'SUPERSEDED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_race_records_contest_participant_active;
      DROP INDEX IF EXISTS idx_race_records_contest_source;
      DROP INDEX IF EXISTS idx_race_records_driver_time;
      DROP INDEX IF EXISTS idx_race_records_leaderboard;
      DROP INDEX IF EXISTS idx_users_racing_profile_handle_unique;
      DROP INDEX IF EXISTS idx_users_racing_profile_handle;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS race_records;`);
    await queryRunner.query(`DROP TABLE IF EXISTS achievement_definitions;`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS racing_profile;
    `);
  }
}
