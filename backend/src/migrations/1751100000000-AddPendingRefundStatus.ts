import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingRefundStatus1751100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE payment_component_status_enum ADD VALUE IF NOT EXISTS 'PENDING_REFUND';`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // No-op: PENDING_REFUND remains in the enum on rollback.
  }
}
