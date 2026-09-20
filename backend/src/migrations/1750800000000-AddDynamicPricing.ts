import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDynamicPricing1750800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum types
    await queryRunner.query(`
      CREATE TYPE pricing_rule_type_enum AS ENUM ('WEEKEND', 'PEAK_HOURS');
    `);
    await queryRunner.query(`
      CREATE TYPE holiday_type_enum AS ENUM ('SYSTEM', 'CUSTOM');
    `);

    // 2. cafe_pricing_rules
    await queryRunner.query(`
      CREATE TABLE cafe_pricing_rules (
        id               UUID         NOT NULL DEFAULT gen_random_uuid(),
        cafe_id          UUID         NOT NULL,
        rule_type        pricing_rule_type_enum NOT NULL,
        multiplier       NUMERIC(5,2) NOT NULL CHECK (multiplier >= 1.0),
        peak_start_time  TIME,
        peak_end_time    TIME,
        is_active        BOOLEAN      NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        deleted_at       TIMESTAMPTZ,
        CONSTRAINT pk_cafe_pricing_rules PRIMARY KEY (id),
        CONSTRAINT fk_cafe_pricing_rules_cafe FOREIGN KEY (cafe_id) REFERENCES cafes(id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cafe_pricing_rules_cafe"
        ON cafe_pricing_rules (cafe_id, rule_type, is_active);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cafe_pricing_rules_cafe_deleted"
        ON cafe_pricing_rules (cafe_id, deleted_at);
    `);
    // At most 1 active WEEKEND rule per cafe
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cafe_pricing_rules_weekend_unique"
        ON cafe_pricing_rules (cafe_id)
        WHERE rule_type = 'WEEKEND' AND deleted_at IS NULL;
    `);

    // 3. holiday_dates
    await queryRunner.query(`
      CREATE TABLE holiday_dates (
        id            UUID         NOT NULL DEFAULT gen_random_uuid(),
        cafe_id       UUID,
        holiday_date  DATE         NOT NULL,
        name          VARCHAR(255) NOT NULL,
        multiplier    NUMERIC(5,2) NOT NULL CHECK (multiplier >= 1.0),
        holiday_type  holiday_type_enum NOT NULL,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT pk_holiday_dates PRIMARY KEY (id),
        CONSTRAINT fk_holiday_dates_cafe FOREIGN KEY (cafe_id) REFERENCES cafes(id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_holiday_dates_cafe_date"
        ON holiday_dates (cafe_id, holiday_date);
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_holiday_dates_system"
        ON holiday_dates (holiday_type, holiday_date)
        WHERE holiday_type = 'SYSTEM';
    `);
    // Prevent duplicate custom holidays per cafe per date
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_holiday_dates_custom_unique"
        ON holiday_dates (cafe_id, holiday_date)
        WHERE holiday_type = 'CUSTOM' AND deleted_at IS NULL;
    `);

    // 4. cafe_holiday_overrides — per-cafe multiplier override for SYSTEM holidays
    await queryRunner.query(`
      CREATE TABLE cafe_holiday_overrides (
        id               UUID         NOT NULL DEFAULT gen_random_uuid(),
        cafe_id          UUID         NOT NULL,
        holiday_date_id  UUID         NOT NULL,
        multiplier       NUMERIC(5,2) NOT NULL CHECK (multiplier >= 1.0),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_cafe_holiday_overrides PRIMARY KEY (id),
        CONSTRAINT fk_cafe_holiday_overrides_cafe    FOREIGN KEY (cafe_id)         REFERENCES cafes(id),
        CONSTRAINT fk_cafe_holiday_overrides_holiday FOREIGN KEY (holiday_date_id) REFERENCES holiday_dates(id),
        CONSTRAINT uq_cafe_holiday_overrides         UNIQUE (cafe_id, holiday_date_id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cafe_holiday_overrides_cafe"
        ON cafe_holiday_overrides (cafe_id);
    `);

    // 5. Seed Vietnamese national holidays 2026 — multiplier=1.0 (markers only)
    // Providers set their own effective multiplier via cafe_holiday_overrides.
    await queryRunner.query(`
      INSERT INTO holiday_dates (holiday_date, name, multiplier, holiday_type, cafe_id) VALUES
        ('2026-01-01', 'Tết Dương lịch',              1.0, 'SYSTEM', NULL),
        ('2026-01-28', 'Tết Nguyên Đán (28 Tết)',     1.0, 'SYSTEM', NULL),
        ('2026-01-29', 'Tết Nguyên Đán (29 Tết)',     1.0, 'SYSTEM', NULL),
        ('2026-01-30', 'Giao thừa',                   1.0, 'SYSTEM', NULL),
        ('2026-01-31', 'Mùng 1 Tết',                  1.0, 'SYSTEM', NULL),
        ('2026-02-01', 'Mùng 2 Tết',                  1.0, 'SYSTEM', NULL),
        ('2026-02-02', 'Mùng 3 Tết',                  1.0, 'SYSTEM', NULL),
        ('2026-04-07', 'Giỗ Tổ Hùng Vương',           1.0, 'SYSTEM', NULL),
        ('2026-04-30', 'Ngày Thống nhất',              1.0, 'SYSTEM', NULL),
        ('2026-05-01', 'Quốc tế Lao động',             1.0, 'SYSTEM', NULL),
        ('2026-09-02', 'Quốc khánh',                   1.0, 'SYSTEM', NULL);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cafe_holiday_overrides CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS holiday_dates CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS cafe_pricing_rules CASCADE;`);
    await queryRunner.query(`DROP TYPE IF EXISTS holiday_type_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS pricing_rule_type_enum;`);
  }
}
