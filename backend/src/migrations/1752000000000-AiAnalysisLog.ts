import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiAnalysisLog1752000000000 implements MigrationInterface {
  name = 'AiAnalysisLog1752000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ai_analysis_status_enum" AS ENUM
        ('SUCCESS', 'FAILED', 'QUOTA_EXCEEDED', 'INSUFFICIENT_DATA')
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_analysis_logs" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id"  UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "cafe_id"      UUID REFERENCES "cafes"("id") ON DELETE SET NULL,
        "period_from"  DATE NOT NULL,
        "period_to"    DATE NOT NULL,
        "status"       "ai_analysis_status_enum" NOT NULL,
        "tokens_used"  INT,
        "duration_ms"  INT,
        "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ai_analysis_logs_provider_month"
        ON "ai_analysis_logs" ("provider_id", "requested_at")
    `);

    await queryRunner.query(`
      INSERT INTO "feature_flags"
        ("feature_key", "display_name", "entity_type", "entity_id", "is_enabled", "config")
      VALUES
        ('AI_REVENUE_ANALYTICS', 'AI Revenue Analytics', 'GLOBAL', NULL, false, '{"monthly_quota": 10}')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM feature_flags WHERE feature_key = 'AI_REVENUE_ANALYTICS'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ai_analysis_logs_provider_month"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_analysis_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ai_analysis_status_enum"`);
  }
}
