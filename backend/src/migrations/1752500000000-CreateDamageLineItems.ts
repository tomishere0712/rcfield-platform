import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDamageLineItems1752500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE damage_part_type AS ENUM (
        'TIRE_WHEEL', 'SPOILER', 'CHASSIS', 'MOTOR',
        'SHELL', 'SERVO', 'REMOTE', 'OTHER'
      );

      CREATE TABLE damage_line_items (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        inspection_id    UUID        NOT NULL REFERENCES inspections(id),
        part_type        damage_part_type NOT NULL,
        custom_part_name VARCHAR(255),
        parts_price      NUMERIC(15,2) NOT NULL DEFAULT 0,
        labor_price      NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at       TIMESTAMPTZ
      );

      CREATE INDEX idx_damage_line_items_inspection_id ON damage_line_items(inspection_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE damage_line_items;
      DROP TYPE damage_part_type;
    `);
  }
}
