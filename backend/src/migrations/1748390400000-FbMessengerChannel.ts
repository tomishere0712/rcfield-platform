import { MigrationInterface, QueryRunner } from 'typeorm';

export class FbMessengerChannel1748390400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cafe_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id VARCHAR NOT NULL,
        channel_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
        page_id VARCHAR(100) NOT NULL,
        page_name VARCHAR(255) NOT NULL,
        encrypted_page_token TEXT NOT NULL,
        connected_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        deleted_at TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cafe_channels_cafe_type
        ON cafe_channels(cafe_id, channel_type)
        WHERE deleted_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cafe_channels_page_id
        ON cafe_channels(page_id)
        WHERE deleted_at IS NULL AND status = 'CONNECTED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cafe_channels_page_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_cafe_channels_cafe_type;`);
    await queryRunner.query(`DROP TABLE IF EXISTS cafe_channels;`);
  }
}
