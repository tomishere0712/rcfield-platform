import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentTransactionContestConstraint1784201000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        DROP CONSTRAINT IF EXISTS chk_payment_tx_source;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD CONSTRAINT chk_payment_tx_source
          CHECK (
            (booking_id IS NOT NULL)::int +
            (customer_package_id IS NOT NULL)::int +
            (contest_registration_id IS NOT NULL)::int = 1
          );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
        DROP CONSTRAINT IF EXISTS chk_payment_tx_source;
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions
        ADD CONSTRAINT chk_payment_tx_source
          CHECK (
            (booking_id IS NOT NULL)::int +
            (customer_package_id IS NOT NULL)::int = 1
          );
    `);
  }
}
