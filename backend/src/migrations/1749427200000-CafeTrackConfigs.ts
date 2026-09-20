import { MigrationInterface, QueryRunner } from 'typeorm';

export class CafeTrackConfigs1749427200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cafe_track_configs (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id         uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        track_type_id   uuid NOT NULL REFERENCES track_types(id),
        byoc_capacity   int NOT NULL CHECK (byoc_capacity >= 1),
        images          text[] NOT NULL DEFAULT '{}',
        description     text,
        sort_order      int NOT NULL DEFAULT 0,
        is_active       boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        deleted_at      timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cafe_track_configs_cafe
        ON cafe_track_configs(cafe_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_track_configs_unique_active
        ON cafe_track_configs(cafe_id, track_type_id)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS track_config_id uuid REFERENCES cafe_track_configs(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_track_config
        ON bookings(track_config_id)
        WHERE track_config_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_track_config`);
    await queryRunner.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS track_config_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cafe_track_configs_unique_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cafe_track_configs_cafe`);
    await queryRunner.query(`DROP TABLE IF EXISTS cafe_track_configs`);
  }
}
