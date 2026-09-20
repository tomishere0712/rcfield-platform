import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContestBookingSource1784700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE booking_source_enum ADD VALUE IF NOT EXISTS 'CONTEST';`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values without recreating the type.
    // No-op: CONTEST remains in the enum on rollback.
  }
}
