import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContestEntryFeeComponentType1784800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE payment_component_type_enum ADD VALUE IF NOT EXISTS 'CONTEST_ENTRY_FEE';`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // No-op: CONTEST_ENTRY_FEE remains in the enum on rollback.
  }
}
