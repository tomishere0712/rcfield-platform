import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameVehicleImagesAndAddVehicleColumns1749254500000 implements MigrationInterface {
  name = 'RenameVehicleImagesAndAddVehicleColumns1749254500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename vehicle_images table to vehicle_catalog_images
    await queryRunner.query(`
      ALTER TABLE vehicle_images RENAME TO vehicle_catalog_images;
    `);

    // 2. Add columns to vehicles table
    await queryRunner.query(`
      ALTER TABLE vehicles 
      ADD COLUMN identifier VARCHAR(255),
      ADD COLUMN color VARCHAR(100),
      ADD COLUMN distinctive_image_url TEXT,
      ADD COLUMN notes TEXT,
      ADD COLUMN metadata JSONB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop columns from vehicles table
    await queryRunner.query(`
      ALTER TABLE vehicles 
      DROP COLUMN identifier,
      DROP COLUMN color,
      DROP COLUMN distinctive_image_url,
      DROP COLUMN notes,
      DROP COLUMN metadata;
    `);

    // 2. Rename vehicle_catalog_images table back to vehicle_images
    await queryRunner.query(`
      ALTER TABLE vehicle_catalog_images RENAME TO vehicle_images;
    `);
  }
}
