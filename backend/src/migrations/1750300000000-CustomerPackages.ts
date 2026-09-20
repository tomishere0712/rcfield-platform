import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerPackages1750300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop legacy customer_packages table if it exists with the old schema
    await queryRunner.query(`
      DROP TABLE IF EXISTS customer_packages CASCADE;
    `);

    // 2. Create customer_packages table
    await queryRunner.query(`
      CREATE TABLE customer_packages (
        id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
        customer_id          UUID        NOT NULL,
        package_id           UUID        NOT NULL,
        cafe_id              UUID        NOT NULL,
        slots_total          INT         NOT NULL,
        slots_remaining      INT         NOT NULL CHECK (slots_remaining >= 0),
        expires_at           TIMESTAMPTZ NOT NULL,
        status               VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
        purchased_price      NUMERIC(15,2) NOT NULL,
        package_name_snapshot VARCHAR(255) NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_customer_packages PRIMARY KEY (id),
        CONSTRAINT fk_customer_packages_customer FOREIGN KEY (customer_id) REFERENCES users(id),
        CONSTRAINT fk_customer_packages_package  FOREIGN KEY (package_id)  REFERENCES packages(id),
        CONSTRAINT fk_customer_packages_cafe     FOREIGN KEY (cafe_id)     REFERENCES cafes(id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_packages_customer_id"
        ON customer_packages (customer_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_packages_cafe_id_status"
        ON customer_packages (cafe_id, "status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_packages_status_expires_at"
        ON customer_packages ("status", expires_at);
    `);

    // 2. Add customer_package_id nullable FK to bookings
    await queryRunner.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS customer_package_id UUID
          REFERENCES customer_packages(id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_customer_package_id"
        ON bookings (customer_package_id);
    `);

    // 3. Make payment_transactions.booking_id nullable
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ALTER COLUMN booking_id DROP NOT NULL;
    `);

    // 4. Add customer_package_id nullable FK to payment_transactions
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD COLUMN IF NOT EXISTS customer_package_id UUID
          REFERENCES customer_packages(id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_customer_package_id"
        ON payment_transactions (customer_package_id);
    `);

    // 5. Enforce exactly one of booking_id / customer_package_id is non-null
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD CONSTRAINT chk_payment_tx_source
          CHECK (
            (booking_id IS NOT NULL)::int + (customer_package_id IS NOT NULL)::int = 1
          );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        DROP CONSTRAINT IF EXISTS chk_payment_tx_source;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_payment_transactions_customer_package_id";
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        DROP COLUMN IF EXISTS customer_package_id;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ALTER COLUMN booking_id SET NOT NULL;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_bookings_customer_package_id";
    `);

    await queryRunner.query(`
      ALTER TABLE bookings
        DROP COLUMN IF EXISTS customer_package_id;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_customer_packages_status_expires_at";
      DROP INDEX IF EXISTS "IDX_customer_packages_cafe_id_status";
      DROP INDEX IF EXISTS "IDX_customer_packages_customer_id";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS customer_packages;
    `);
  }
}
