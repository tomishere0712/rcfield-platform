import { MigrationInterface, QueryRunner } from 'typeorm';

// Gemini text-embedding-004 (768 dims) → gemini-embedding-001 (3072 dims)
export class UpdateEmbeddingDims1747612800000 implements MigrationInterface {
  name = 'UpdateEmbeddingDims1747612800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // HNSW and IVFFlat both cap at 2000 dims — use exact cosine scan (fine for < 10k vectors)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_kb_chunks_embedding`);
    await queryRunner.query(`ALTER TABLE kb_chunks DROP COLUMN IF EXISTS embedding`);
    await queryRunner.query(`ALTER TABLE kb_chunks ADD COLUMN embedding vector(3072)`);
    // Keep the cafe_id filter index for isolation
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_kb_chunks_cafe_id ON kb_chunks(cafe_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_kb_chunks_embedding`);
    await queryRunner.query(`ALTER TABLE kb_chunks DROP COLUMN IF EXISTS embedding`);
    await queryRunner.query(`ALTER TABLE kb_chunks ADD COLUMN embedding vector(768)`);
    await queryRunner.query(`
      CREATE INDEX idx_kb_chunks_embedding ON kb_chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  }
}
