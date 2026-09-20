import { MigrationInterface, QueryRunner } from 'typeorm';

export class DynamicTrackTypes1749410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create track_types table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS track_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Seed default track types
    await queryRunner.query(`
      INSERT INTO track_types (code, name, sort_order) VALUES
        ('DRIFT', 'Drift', 1),
        ('OBSTACLE', 'Chướng ngại vật', 2),
        ('HILL_CLIMB', 'Leo đồi', 3),
        ('ASPHALT', 'Đường nhựa (Asphalt)', 4),
        ('CARPET', 'Đường thảm (Carpet)', 5)
      ON CONFLICT (code) DO NOTHING;
    `);

    // 3. Migrate cafes.track_types (TEXT[] -> UUID[]) — skip if already UUID[]
    await queryRunner.query(`
      DO $$
      DECLARE col_udt TEXT;
      BEGIN
        SELECT udt_name INTO col_udt
        FROM information_schema.columns
        WHERE table_name = 'cafes' AND column_name = 'track_types';

        IF col_udt IN ('_text', '_varchar') THEN
          ALTER TABLE cafes ADD COLUMN IF NOT EXISTS track_type_ids UUID[] NOT NULL DEFAULT '{}';
          UPDATE cafes c
          SET track_type_ids = ARRAY(
            SELECT t.id
            FROM unnest(c.track_types::text[]) AS val
            JOIN track_types t ON t.code = val
          );
          ALTER TABLE cafes DROP COLUMN IF EXISTS track_types;
          ALTER TABLE cafes RENAME COLUMN track_type_ids TO track_types;
        END IF;
      END $$;
    `);

    // 4. Migrate vehicle_catalogs.compatible_track_types (TEXT[] -> UUID[]) — skip if already UUID[]
    await queryRunner.query(`
      DO $$
      DECLARE col_udt TEXT;
      BEGIN
        SELECT udt_name INTO col_udt
        FROM information_schema.columns
        WHERE table_name = 'vehicle_catalogs' AND column_name = 'compatible_track_types';

        IF col_udt IN ('_text', '_varchar') THEN
          ALTER TABLE vehicle_catalogs ADD COLUMN IF NOT EXISTS compatible_track_type_ids UUID[] NOT NULL DEFAULT '{}';
          UPDATE vehicle_catalogs vc
          SET compatible_track_type_ids = ARRAY(
            SELECT t.id
            FROM unnest(vc.compatible_track_types::text[]) AS val
            JOIN track_types t ON t.code = val
          );
          ALTER TABLE vehicle_catalogs DROP COLUMN IF EXISTS compatible_track_types;
          ALTER TABLE vehicle_catalogs RENAME COLUMN compatible_track_type_ids TO compatible_track_types;
        END IF;
      END $$;
    `);

    // 5. Migrate bookings.track_type (VARCHAR(50) -> UUID track_type_id) — skip if already migrated
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_cafe_slot;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_track_type;`);

    await queryRunner.query(`
      DO $$
      DECLARE col_exists BOOLEAN;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'bookings' AND column_name = 'track_type'
        ) INTO col_exists;

        IF col_exists THEN
          ALTER TABLE bookings ADD COLUMN IF NOT EXISTS track_type_uuid UUID;
          UPDATE bookings b
          SET track_type_uuid = COALESCE(
            (SELECT id FROM track_types WHERE code = b.track_type),
            (SELECT id FROM track_types WHERE code = 'DRIFT')
          );
          ALTER TABLE bookings DROP COLUMN IF EXISTS track_type;
          ALTER TABLE bookings RENAME COLUMN track_type_uuid TO track_type_id;
          ALTER TABLE bookings ALTER COLUMN track_type_id SET NOT NULL;
        END IF;
      END $$;
    `);

    // 6. Recreate indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_cafe_slot ON bookings(cafe_id, track_type_id, slot_start, slot_end);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_track_type ON bookings(cafe_id, track_type_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Revert bookings
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_cafe_slot;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_track_type;`);

    await queryRunner.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS track_type VARCHAR(50);
    `);
    await queryRunner.query(`
      UPDATE bookings b
      SET track_type = COALESCE(
        (SELECT code FROM track_types WHERE id = b.track_type_id),
        'DRIFT'
      );
    `);
    await queryRunner.query(`
      ALTER TABLE bookings DROP COLUMN IF EXISTS track_type_id;
    `);
    await queryRunner.query(`
      ALTER TABLE bookings ALTER COLUMN track_type SET NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_bookings_cafe_slot ON bookings(cafe_id, track_type, slot_start, slot_end);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_bookings_track_type ON bookings(cafe_id, track_type);
    `);

    // 2. Revert vehicle_catalogs
    await queryRunner.query(`
      ALTER TABLE vehicle_catalogs ADD COLUMN IF NOT EXISTS compatible_track_types_old TEXT[] NOT NULL DEFAULT '{}';
    `);
    await queryRunner.query(`
      UPDATE vehicle_catalogs vc
      SET compatible_track_types_old = ARRAY(
        SELECT t.code
        FROM unnest(vc.compatible_track_types) AS val
        JOIN track_types t ON t.id = val
      );
    `);
    await queryRunner.query(`
      ALTER TABLE vehicle_catalogs DROP COLUMN IF EXISTS compatible_track_types;
    `);
    await queryRunner.query(`
      ALTER TABLE vehicle_catalogs RENAME COLUMN compatible_track_types_old TO compatible_track_types;
    `);

    // 3. Revert cafes
    await queryRunner.query(`
      ALTER TABLE cafes ADD COLUMN IF NOT EXISTS track_types_old TEXT[] NOT NULL DEFAULT '{}';
    `);
    await queryRunner.query(`
      UPDATE cafes c
      SET track_types_old = ARRAY(
        SELECT t.code
        FROM unnest(c.track_types) AS val
        JOIN track_types t ON t.id = val
      );
    `);
    await queryRunner.query(`
      ALTER TABLE cafes DROP COLUMN IF EXISTS track_types;
    `);
    await queryRunner.query(`
      ALTER TABLE cafes RENAME COLUMN track_types_old TO track_types;
    `);

    // 4. Drop track_types table
    await queryRunner.query(`DROP TABLE IF EXISTS track_types;`);
  }
}
