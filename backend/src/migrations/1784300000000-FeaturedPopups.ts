import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeaturedPopups1784300000000 implements MigrationInterface {
  name = 'FeaturedPopups1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS featured_popups (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        cta_label VARCHAR(80) NOT NULL,
        cta_url TEXT,
        contest_id UUID REFERENCES contests(id) ON DELETE SET NULL,
        placement VARCHAR(40) NOT NULL DEFAULT 'EXPLORE',
        audience_scope VARCHAR(40) NOT NULL DEFAULT 'ALL',
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        priority INTEGER NOT NULL DEFAULT 100,
        created_by UUID NOT NULL REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_featured_popups_active_window
        ON featured_popups(placement, is_active, starts_at, ends_at, priority DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_featured_popups_active_window;`);
    await queryRunner.query(`DROP TABLE IF EXISTS featured_popups;`);
  }
}
