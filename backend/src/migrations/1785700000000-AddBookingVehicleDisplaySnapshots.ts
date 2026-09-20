import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingVehicleDisplaySnapshots1785700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking_vehicles
        ADD COLUMN IF NOT EXISTS catalog_name_snapshot varchar(255),
        ADD COLUMN IF NOT EXISTS tier_snapshot varchar(50),
        ADD COLUMN IF NOT EXISTS identifier_snapshot varchar(255),
        ADD COLUMN IF NOT EXISTS color_snapshot varchar(100),
        ADD COLUMN IF NOT EXISTS cover_image_url_snapshot text;
    `);

    // Best-effort backfill for existing history. New bookings always persist
    // these values at creation time and no longer depend on live fleet data.
    await queryRunner.query(`
      UPDATE booking_vehicles bv
      SET
        catalog_name_snapshot = COALESCE(bv.catalog_name_snapshot, vc.name),
        tier_snapshot = COALESCE(bv.tier_snapshot, vc.tier::text),
        identifier_snapshot = COALESCE(bv.identifier_snapshot, v.identifier),
        color_snapshot = COALESCE(bv.color_snapshot, v.color),
        cover_image_url_snapshot = COALESCE(
          bv.cover_image_url_snapshot,
          v.distinctive_image_url,
          vc.cover_image_url
        )
      FROM vehicles v
      LEFT JOIN vehicle_catalogs vc ON vc.id = v.catalog_id
      WHERE v.id = bv.vehicle_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking_vehicles
        DROP COLUMN IF EXISTS cover_image_url_snapshot,
        DROP COLUMN IF EXISTS color_snapshot,
        DROP COLUMN IF EXISTS identifier_snapshot,
        DROP COLUMN IF EXISTS tier_snapshot,
        DROP COLUMN IF EXISTS catalog_name_snapshot;
    `);
  }
}
