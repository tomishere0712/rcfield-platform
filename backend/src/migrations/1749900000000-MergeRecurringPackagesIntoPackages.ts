import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeRecurringPackagesIntoPackages1749900000000 implements MigrationInterface {
  name = 'MergeRecurringPackagesIntoPackages1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO packages (
        cafe_id,
        name,
        description,
        slot_count,
        price,
        valid_days,
        applicable_play_modes,
        status,
        created_at,
        updated_at
      )
      SELECT
        cafe_id,
        name,
        jsonb_build_object(
          'code', code,
          'displayDescription', description,
          'benefits', benefits,
          'isPopular', is_popular
        )::text,
        slot_count,
        price,
        CASE WHEN billing_period = 'WEEK' THEN 7 ELSE 30 END,
        '{}',
        CASE WHEN is_active THEN 'ACTIVE'::package_status_enum ELSE 'INACTIVE'::package_status_enum END,
        created_at,
        updated_at
      FROM recurring_packages rp
      WHERE NOT EXISTS (
        SELECT 1
        FROM packages p
        WHERE p.cafe_id = rp.cafe_id
          AND p.deleted_at IS NULL
          AND p.description LIKE '%"code": "' || rp.code || '"%'
      );
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS recurring_packages;`);
    await queryRunner.query(`DROP TYPE IF EXISTS package_billing_period_enum;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
