import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecurringPackages1749800000000 implements MigrationInterface {
  name = 'RecurringPackages1749800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_billing_period_enum') THEN
          CREATE TYPE package_billing_period_enum AS ENUM ('WEEK', 'MONTH');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recurring_packages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id uuid NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        code varchar(50) NOT NULL,
        name varchar(255) NOT NULL,
        description text,
        slot_count int NOT NULL,
        billing_period package_billing_period_enum NOT NULL,
        price numeric(15, 2) NOT NULL,
        benefits text[] NOT NULL DEFAULT '{}',
        is_popular boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT recurring_packages_slot_count_positive CHECK (slot_count > 0),
        CONSTRAINT recurring_packages_price_positive CHECK (price > 0),
        CONSTRAINT recurring_packages_cafe_code_unique UNIQUE (cafe_id, code)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_recurring_packages_cafe_id ON recurring_packages(cafe_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_recurring_packages_cafe_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS recurring_packages;`);
    await queryRunner.query(`DROP TYPE IF EXISTS package_billing_period_enum;`);
  }
}
