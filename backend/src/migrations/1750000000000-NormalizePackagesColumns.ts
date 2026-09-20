import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizePackagesColumns1750000000000 implements MigrationInterface {
  name = 'NormalizePackagesColumns1750000000000';

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
      ALTER TABLE packages
        ADD COLUMN IF NOT EXISTS code varchar(50),
        ADD COLUMN IF NOT EXISTS billing_period package_billing_period_enum,
        ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      UPDATE packages
      SET
        code = CASE
          WHEN code IS NOT NULL THEN code
          WHEN description LIKE '{%' AND description LIKE '%"code"%' THEN description::jsonb ->> 'code'
          ELSE 'PKG-' || upper(left(id::text, 8))
        END,
        billing_period = CASE
          WHEN billing_period IS NOT NULL THEN billing_period
          WHEN valid_days <= 7 THEN 'WEEK'::package_billing_period_enum
          ELSE 'MONTH'::package_billing_period_enum
        END,
        benefits = CASE
          WHEN description LIKE '{%' AND description LIKE '%"benefits"%' THEN
            ARRAY(SELECT jsonb_array_elements_text(description::jsonb -> 'benefits'))
          ELSE benefits
        END,
        is_popular = CASE
          WHEN description LIKE '{%' AND description LIKE '%"isPopular"%' THEN
            COALESCE((description::jsonb ->> 'isPopular')::boolean, false)
          ELSE is_popular
        END,
        description = CASE
          WHEN description LIKE '{%' AND description LIKE '%"displayDescription"%' THEN
            NULLIF(description::jsonb ->> 'displayDescription', '')
          ELSE description
        END;
    `);

    await queryRunner.query(`
      ALTER TABLE packages
        ALTER COLUMN code SET NOT NULL,
        ALTER COLUMN billing_period SET NOT NULL,
        ALTER COLUMN billing_period SET DEFAULT 'MONTH';
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_cafe_code_active
      ON packages(cafe_id, code)
      WHERE deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_packages_cafe_code_active;`);
    await queryRunner.query(`
      ALTER TABLE packages
        DROP COLUMN IF EXISTS is_popular,
        DROP COLUMN IF EXISTS benefits,
        DROP COLUMN IF EXISTS billing_period,
        DROP COLUMN IF EXISTS code;
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS package_billing_period_enum;`);
  }
}
