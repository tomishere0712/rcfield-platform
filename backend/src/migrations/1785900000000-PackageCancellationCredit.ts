import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Package credits must support half-slot cancellation refunds in the 12–24h
 * window. Existing integer balances are preserved exactly as x.00 values.
 */
export class PackageCancellationCredit1785900000000 implements MigrationInterface {
  name = 'PackageCancellationCredit1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_packages
      ALTER COLUMN slots_remaining TYPE NUMERIC(10, 2)
      USING slots_remaining::NUMERIC(10, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_packages
      ALTER COLUMN slots_remaining TYPE INTEGER
      USING FLOOR(slots_remaining)::INTEGER
    `);
  }
}
