import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewTables1752100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL,
        cafe_id UUID NOT NULL,
        customer_id UUID NOT NULL,
        overall_score SMALLINT NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
        vehicle_score SMALLINT NULL CHECK (vehicle_score BETWEEN 1 AND 5),
        staff_score SMALLINT NULL CHECK (staff_score BETWEEN 1 AND 5),
        facility_score SMALLINT NULL CHECK (facility_score BETWEEN 1 AND 5),
        note TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT PK_reviews PRIMARY KEY (id),
        CONSTRAINT UQ_reviews_booking_id UNIQUE (booking_id),
        CONSTRAINT FK_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
        CONSTRAINT FK_reviews_cafe FOREIGN KEY (cafe_id) REFERENCES cafes(id),
        CONSTRAINT FK_reviews_customer FOREIGN KEY (customer_id) REFERENCES users(id)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE'
    `);

    await queryRunner.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS vehicle_score SMALLINT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS staff_score SMALLINT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS facility_score SMALLINT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note TEXT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_cafe_status ON reviews(cafe_id, status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id)
    `);

    await queryRunner.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_dismissed_at TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_completed_at ON bookings(completed_at) WHERE completed_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bookings_completed_at`);
    await queryRunner.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS review_dismissed_at`);
    await queryRunner.query(`ALTER TABLE bookings DROP COLUMN IF EXISTS completed_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reviews_customer_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reviews_cafe_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS reviews`);
  }
}
