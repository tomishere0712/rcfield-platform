import { MigrationInterface, QueryRunner } from 'typeorm';

export class AmenityCatalogAndCafeRules1749500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS amenity_catalog (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE cafes
        ADD COLUMN IF NOT EXISTS amenity_ids UUID[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS rules TEXT[] NOT NULL DEFAULT '{}';
    `);

    await queryRunner.query(`
      INSERT INTO amenity_catalog (title, description, icon, sort_order) VALUES
        ('Hệ thống Mylaps', 'Đo thời gian chính xác', 'timer', 1),
        ('Pit Area Pro', 'Bàn thao tác, khí nén', 'tool', 2),
        ('Đường đua thảm', 'Độ bám cao, kỹ thuật', 'road', 3),
        ('Điều hòa trung tâm', 'Mát mẻ 24/7', 'snow', 4),
        ('Cafe & Lounge', 'Nước uống, thức ăn nhẹ', 'coffee', 5),
        ('Live Stream', 'Camera toàn cảnh', 'camera', 6)
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cafes
        DROP COLUMN IF EXISTS amenity_ids,
        DROP COLUMN IF EXISTS rules;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS amenity_catalog;`);
  }
}
