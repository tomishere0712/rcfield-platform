import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAwaitingPaymentStatus1752300000000 implements MigrationInterface {
  name = 'AddAwaitingPaymentStatus1752300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE booking_status_enum ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values — manual intervention required
  }
}
