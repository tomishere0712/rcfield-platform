import { MigrationInterface, QueryRunner } from 'typeorm';

export class VehicleCatalog1749254400000 implements MigrationInterface {
  name = 'VehicleCatalog1749254400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create vehicle_catalogs table
    await queryRunner.query(`
      CREATE TABLE vehicle_catalogs (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id                 UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        name                    VARCHAR(255) NOT NULL,
        description             TEXT,
        tier                    vehicle_tier_enum NOT NULL,
        hourly_rate             NUMERIC(15,2) NOT NULL,
        security_deposit        NUMERIC(15,2) NOT NULL,
        damage_multiplier       NUMERIC(4,2) NOT NULL DEFAULT 1.00,
        compatible_track_types  TEXT[] NOT NULL DEFAULT '{}',
        cover_image_url         TEXT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at              TIMESTAMPTZ
      );
      CREATE INDEX idx_vehicle_catalogs_cafe_id ON vehicle_catalogs(cafe_id);
    `);

    // 2. Populate vehicle_catalogs with existing vehicle data
    await queryRunner.query(`
      INSERT INTO vehicle_catalogs (
        id, cafe_id, name, description, tier, hourly_rate, 
        security_deposit, damage_multiplier, compatible_track_types, 
        cover_image_url, created_at, updated_at, deleted_at
      )
      SELECT 
        id, cafe_id, name, description, tier, hourly_rate, 
        security_deposit, damage_multiplier, compatible_track_types, 
        cover_image_url, created_at, updated_at, deleted_at 
      FROM vehicles;
    `);

    // 3. Add catalog_id to vehicles table
    await queryRunner.query(`
      ALTER TABLE vehicles ADD COLUMN catalog_id UUID REFERENCES vehicle_catalogs(id) ON DELETE CASCADE;
    `);

    // 4. Update vehicles catalog_id to point to the newly inserted catalogs
    await queryRunner.query(`
      UPDATE vehicles SET catalog_id = id;
    `);

    // 5. Make catalog_id NOT NULL
    await queryRunner.query(`
      ALTER TABLE vehicles ALTER COLUMN catalog_id SET NOT NULL;
    `);

    // 6. Update vehicle_images reference
    await queryRunner.query(`
      ALTER TABLE vehicle_images RENAME COLUMN vehicle_id TO catalog_id;
      ALTER TABLE vehicle_images DROP CONSTRAINT IF EXISTS fk_vehicle_images_vehicle_id;
      ALTER TABLE vehicle_images DROP CONSTRAINT IF EXISTS fk_vehicle_images_vehicle;
      ALTER TABLE vehicle_images DROP CONSTRAINT IF EXISTS vehicle_images_vehicle_id_fkey;
      -- Let's query dynamic constraints just in case, but standard CASCADE drops the FK if we rename/alter.
      -- To be safe, we attempt to drop constraints by both common names.
      ALTER TABLE vehicle_images ADD CONSTRAINT vehicle_images_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES vehicle_catalogs(id) ON DELETE CASCADE;
    `);

    // 7. Drop redundant fields from vehicles table
    await queryRunner.query(`
      ALTER TABLE vehicles DROP COLUMN name;
      ALTER TABLE vehicles DROP COLUMN description;
      ALTER TABLE vehicles DROP COLUMN tier;
      ALTER TABLE vehicles DROP COLUMN hourly_rate;
      ALTER TABLE vehicles DROP COLUMN security_deposit;
      ALTER TABLE vehicles DROP COLUMN damage_multiplier;
      ALTER TABLE vehicles DROP COLUMN compatible_track_types;
      ALTER TABLE vehicles DROP COLUMN cover_image_url;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Add fields back to vehicles
    await queryRunner.query(`
      ALTER TABLE vehicles ADD COLUMN name VARCHAR(255);
      ALTER TABLE vehicles ADD COLUMN description TEXT;
      ALTER TABLE vehicles ADD COLUMN tier vehicle_tier_enum;
      ALTER TABLE vehicles ADD COLUMN hourly_rate NUMERIC(15,2);
      ALTER TABLE vehicles ADD COLUMN security_deposit NUMERIC(15,2);
      ALTER TABLE vehicles ADD COLUMN damage_multiplier NUMERIC(4,2) DEFAULT 1.00;
      ALTER TABLE vehicles ADD COLUMN compatible_track_types TEXT[] DEFAULT '{}';
      ALTER TABLE vehicles ADD COLUMN cover_image_url TEXT;
    `);

    // 2. Populate fields from vehicle_catalogs
    await queryRunner.query(`
      UPDATE vehicles v
      SET name = vc.name,
          description = vc.description,
          tier = vc.tier,
          hourly_rate = vc.hourly_rate,
          security_deposit = vc.security_deposit,
          damage_multiplier = vc.damage_multiplier,
          compatible_track_types = vc.compatible_track_types,
          cover_image_url = vc.cover_image_url
      FROM vehicle_catalogs vc
      WHERE v.catalog_id = vc.id;
    `);

    // 3. Make columns NOT NULL where required
    await queryRunner.query(`
      ALTER TABLE vehicles ALTER COLUMN name SET NOT NULL;
      ALTER TABLE vehicles ALTER COLUMN tier SET NOT NULL;
      ALTER TABLE vehicles ALTER COLUMN hourly_rate SET NOT NULL;
      ALTER TABLE vehicles ALTER COLUMN security_deposit SET NOT NULL;
      ALTER TABLE vehicles ALTER COLUMN compatible_track_types SET NOT NULL;
    `);

    // 4. Revert vehicle_images reference
    await queryRunner.query(`
      ALTER TABLE vehicle_images DROP CONSTRAINT IF EXISTS vehicle_images_catalog_id_fkey;
      ALTER TABLE vehicle_images RENAME COLUMN catalog_id TO vehicle_id;
      ALTER TABLE vehicle_images ADD CONSTRAINT fk_vehicle_images_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
    `);

    // 5. Drop catalog_id from vehicles
    await queryRunner.query(`
      ALTER TABLE vehicles DROP COLUMN catalog_id;
    `);

    // 6. Drop vehicle_catalogs table
    await queryRunner.query(`
      DROP TABLE vehicle_catalogs;
    `);
  }
}
