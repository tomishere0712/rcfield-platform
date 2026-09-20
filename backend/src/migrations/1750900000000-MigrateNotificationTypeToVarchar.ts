import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateNotificationTypeToVarchar1750900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Alter column type to VARCHAR(255)
    await queryRunner.query(`
      ALTER TABLE "notifications" ALTER COLUMN "type" TYPE VARCHAR(255)
    `);

    // 2. Drop the old enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "notification_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create type enum if rolling back
    await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM (
        'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED',
        'TRIAL_EXPIRING_SOON', 'GRACE_PERIOD_STARTED', 'SUBSCRIPTION_EXPIRED',
        'SUBSCRIPTION_ACTIVATED', 'PAYMENT_REQUEST_CONFIRMED', 'PAYMENT_REQUEST_REJECTED',
        'SESSION_CHECKIN_INSPECTION', 'SESSION_CHECKOUT_INSPECTION', 'SESSION_EXTENSION_PROPOSED'
      )
    `);

    // Restore column type
    await queryRunner.query(`
      ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notification_type_enum"
      USING type::notification_type_enum
    `);
  }
}
