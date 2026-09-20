import { MigrationInterface, QueryRunner } from 'typeorm';

export class AIChatFeature1747526400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── STEP 1: pgvector extension ─────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // ── STEP 2: New enum types ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE kb_document_status_enum AS ENUM ('PENDING', 'INDEXED', 'FAILED');
      CREATE TYPE kb_content_type_enum AS ENUM ('POLICY', 'FAQ', 'ANNOUNCEMENT', 'CUSTOM');
      CREATE TYPE widget_position_enum AS ENUM ('BOTTOM_RIGHT', 'BOTTOM_LEFT');
    `);

    // ── STEP 3: ALTER feature_flags — add entity support + config ──────────
    await queryRunner.query(`
      ALTER TABLE feature_flags ADD COLUMN entity_type VARCHAR(20) NOT NULL DEFAULT 'GLOBAL';
      ALTER TABLE feature_flags ADD COLUMN entity_id   UUID;
      ALTER TABLE feature_flags ADD COLUMN config      JSONB NOT NULL DEFAULT '{}';

      DROP INDEX IF EXISTS idx_feature_flags_key;
      CREATE UNIQUE INDEX idx_feature_flags_key_entity
        ON feature_flags(feature_key, entity_id)
        WHERE entity_id IS NOT NULL;
      CREATE UNIQUE INDEX idx_feature_flags_global_key
        ON feature_flags(feature_key)
        WHERE entity_id IS NULL;

      CREATE INDEX idx_feature_flags_entity ON feature_flags(entity_type, entity_id)
        WHERE entity_id IS NOT NULL;
    `);

    // ── STEP 4: cafe_widget_configs ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE cafe_widget_configs (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id          UUID NOT NULL UNIQUE REFERENCES cafes(id) ON DELETE CASCADE,
        primary_color    VARCHAR(20) NOT NULL DEFAULT '#1a73e8',
        position         widget_position_enum NOT NULL DEFAULT 'BOTTOM_RIGHT',
        avatar_url       TEXT,
        welcome_message  TEXT NOT NULL DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
        quick_replies    JSONB NOT NULL DEFAULT '[]',
        greeting_message TEXT,
        is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_cafe_widget_configs_cafe_id ON cafe_widget_configs(cafe_id);
    `);

    // ── STEP 5: kb_documents ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE kb_documents (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id           UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        title             VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        content_type      kb_content_type_enum NOT NULL DEFAULT 'CUSTOM',
        raw_content       TEXT,
        status            kb_document_status_enum NOT NULL DEFAULT 'PENDING',
        created_by        UUID NOT NULL REFERENCES users(id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMPTZ
      );

      CREATE INDEX idx_kb_documents_cafe_id ON kb_documents(cafe_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_kb_documents_status  ON kb_documents(cafe_id, status) WHERE deleted_at IS NULL;
    `);

    // ── STEP 6: kb_chunks (pgvector) ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE kb_chunks (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id     UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        chunk_text  TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding   vector(768),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_kb_chunks_cafe_id     ON kb_chunks(cafe_id);
      CREATE INDEX idx_kb_chunks_document_id ON kb_chunks(document_id);
      CREATE INDEX idx_kb_chunks_embedding   ON kb_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    `);

    // ── STEP 7: Seed AI_CHATBOT feature flag with config schema ────────────
    await queryRunner.query(`
      UPDATE feature_flags
      SET config = '{"monthly_quota": 0, "used_this_month": 0, "quota_reset_day": 1}'::jsonb
      WHERE feature_key = 'AI_CHATBOT' AND entity_id IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb_chunks CASCADE;
      DROP TABLE IF EXISTS kb_documents CASCADE;
      DROP TABLE IF EXISTS cafe_widget_configs CASCADE;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_feature_flags_entity;
      DROP INDEX IF EXISTS idx_feature_flags_global_key;
      DROP INDEX IF EXISTS idx_feature_flags_key_entity;

      ALTER TABLE feature_flags DROP COLUMN IF EXISTS config;
      ALTER TABLE feature_flags DROP COLUMN IF EXISTS entity_id;
      ALTER TABLE feature_flags DROP COLUMN IF EXISTS entity_type;

      CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags(feature_key);
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS widget_position_enum CASCADE;
      DROP TYPE IF EXISTS kb_content_type_enum CASCADE;
      DROP TYPE IF EXISTS kb_document_status_enum CASCADE;
    `);

    await queryRunner.query(`DROP EXTENSION IF EXISTS vector;`);
  }
}
