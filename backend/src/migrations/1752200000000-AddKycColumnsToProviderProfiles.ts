import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycColumnsToProviderProfiles1752200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        ADD COLUMN IF NOT EXISTS business_type    varchar(20),
        ADD COLUMN IF NOT EXISTS kyc_documents    jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider_profiles
        DROP COLUMN IF EXISTS business_type,
        DROP COLUMN IF EXISTS kyc_documents,
        DROP COLUMN IF EXISTS kyc_submitted_at
    `);
  }
}
