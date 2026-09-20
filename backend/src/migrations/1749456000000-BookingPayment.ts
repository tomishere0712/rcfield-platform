import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 Booking & Payment migration.
 *
 * Earlier migrations (InitialSchema + Phase1Completion) already built the core
 * tables using PostgreSQL enum columns. This migration only adds the columns
 * that our new entities need but were not present in those earlier migrations.
 * Enum columns are left as-is: PostgreSQL implicitly casts varchar literals
 * to enum types in parameterized queries, so TypeORM entities (which declare
 * varchar) work correctly at runtime.
 *
 * All statements are idempotent (IF NOT EXISTS / DO $$ guards).
 */
export class BookingPayment1749456000000 implements MigrationInterface {
  name = 'BookingPayment1749456000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. bookings ──────────────────────────────────────────────────────────
    // Make snapshot nullable (entity has nullable: true)
    await queryRunner.query(`
      ALTER TABLE bookings ALTER COLUMN snapshot DROP NOT NULL;
    `);
    // Add deleted_at for TypeORM soft-delete (@DeleteDateColumn)
    await queryRunner.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_status_expires"         ON "bookings" ("status", "payment_expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_cafe_status_slot_start" ON "bookings" ("cafe_id", "status", "slot_start")`,
    );

    // ── 2. booking_participants ───────────────────────────────────────────────
    // Phase1Completion used display_name/phone; our entity uses guest_name/guest_phone
    await queryRunner.query(`
      ALTER TABLE booking_participants
        ADD COLUMN IF NOT EXISTS guest_name  varchar(255),
        ADD COLUMN IF NOT EXISTS guest_phone varchar(20);
    `);
    // Backfill from old column names
    await queryRunner.query(`
      UPDATE booking_participants
        SET guest_name  = display_name,
            guest_phone = phone
      WHERE guest_name IS NULL AND display_name IS NOT NULL;
    `);

    // ── 3. booking_vehicles ───────────────────────────────────────────────────
    // Phase1Completion used hourly_rate_snapshot; our entity uses rental_fee_snapshot
    await queryRunner.query(`
      ALTER TABLE booking_vehicles
        ADD COLUMN IF NOT EXISTS rental_fee_snapshot numeric(15,2),
        ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();
    `);
    // Backfill rental_fee_snapshot
    await queryRunner.query(`
      UPDATE booking_vehicles
        SET rental_fee_snapshot = hourly_rate_snapshot
      WHERE rental_fee_snapshot IS NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_booking_vehicles_vehicle_booking_id" ON "booking_vehicles" ("vehicle_id", "booking_id")`,
    );

    // ── 4. payment_components ─────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE payment_components
        ADD COLUMN IF NOT EXISTS booking_vehicle_id uuid;
    `);
    // Ensure refunded_amount is NOT NULL with default 0 (initial schema had it nullable)
    await queryRunner.query(`
      UPDATE payment_components SET refunded_amount = 0 WHERE refunded_amount IS NULL;
    `);
    await queryRunner
      .query(
        `
      ALTER TABLE payment_components
        ALTER COLUMN refunded_amount SET NOT NULL,
        ALTER COLUMN refunded_amount SET DEFAULT 0;
    `,
      )
      .catch(() => {
        /* already constrained */
      });
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_components_booking_id_type" ON "payment_components" ("booking_id", "type")`,
    );

    // ── 5. payment_transactions ───────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD COLUMN IF NOT EXISTS txn_ref    varchar(100),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    `);
    // Backfill txn_ref with id text for existing rows
    await queryRunner.query(`
      UPDATE payment_transactions SET txn_ref = id::text WHERE txn_ref IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE payment_transactions ALTER COLUMN txn_ref SET NOT NULL;
    `);
    // Add unique constraint idempotently
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_payment_transactions_txn_ref'
        ) THEN
          ALTER TABLE payment_transactions
            ADD CONSTRAINT "UQ_payment_transactions_txn_ref" UNIQUE (txn_ref);
        END IF;
      END $$;
    `);

    // ── 6. fnb_orders ─────────────────────────────────────────────────────────
    // Entity uses column name order_type; initial schema uses column name type
    await queryRunner.query(`
      ALTER TABLE fnb_orders ADD COLUMN IF NOT EXISTS order_type varchar(20);
    `);
    // Backfill order_type from type column (cast enum → text)
    await queryRunner.query(`
      UPDATE fnb_orders SET order_type = type::text WHERE order_type IS NULL;
    `);
    // created_by is NOT NULL in initial schema but entity doesn't use it
    await queryRunner.query(`
      ALTER TABLE fnb_orders ALTER COLUMN created_by DROP NOT NULL;
    `);

    // ── 7. fnb_order_items ────────────────────────────────────────────────────
    // Entity uses fnb_order_id; initial schema uses order_id
    await queryRunner.query(`
      ALTER TABLE fnb_order_items
        ADD COLUMN IF NOT EXISTS fnb_order_id uuid,
        ADD COLUMN IF NOT EXISTS subtotal     numeric(15,2),
        ADD COLUMN IF NOT EXISTS notes        text;
    `);
    // Backfill fnb_order_id and subtotal
    await queryRunner.query(`
      UPDATE fnb_order_items
        SET fnb_order_id = order_id,
            subtotal     = unit_price * quantity
      WHERE fnb_order_id IS NULL;
    `);
    // Make item_name_snapshot nullable (entity doesn't use it)
    await queryRunner.query(`
      ALTER TABLE fnb_order_items ALTER COLUMN item_name_snapshot DROP NOT NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fnb_order_items_fnb_order_id" ON "fnb_order_items" ("fnb_order_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fnb_order_items_fnb_order_id"`);
    await queryRunner.query(`ALTER TABLE fnb_order_items DROP COLUMN IF EXISTS fnb_order_id`);
    await queryRunner.query(`ALTER TABLE fnb_order_items DROP COLUMN IF EXISTS subtotal`);
    await queryRunner.query(`ALTER TABLE fnb_order_items DROP COLUMN IF EXISTS notes`);

    await queryRunner.query(`ALTER TABLE fnb_orders DROP COLUMN IF EXISTS order_type`);

    await queryRunner.query(
      `ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS "UQ_payment_transactions_txn_ref"`,
    );
    await queryRunner.query(`ALTER TABLE payment_transactions DROP COLUMN IF EXISTS txn_ref`);
    await queryRunner.query(`ALTER TABLE payment_transactions DROP COLUMN IF EXISTS updated_at`);

    await queryRunner.query(
      `ALTER TABLE payment_components DROP COLUMN IF EXISTS booking_vehicle_id`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_booking_vehicles_vehicle_booking_id"`);
    await queryRunner.query(
      `ALTER TABLE booking_vehicles DROP COLUMN IF EXISTS rental_fee_snapshot`,
    );
    await queryRunner.query(`ALTER TABLE booking_vehicles DROP COLUMN IF EXISTS updated_at`);

    await queryRunner.query(`ALTER TABLE booking_participants DROP COLUMN IF EXISTS guest_name`);
    await queryRunner.query(`ALTER TABLE booking_participants DROP COLUMN IF EXISTS guest_phone`);

    await queryRunner.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS deleted_at`);
  }
}
