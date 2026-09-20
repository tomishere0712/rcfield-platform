import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrandPrixContestType1784600000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO contest_formats (code, name, description, supports_bracket, supports_time_attack, supports_multi_round, is_active, sort_order, metadata)
      VALUES
        ('QUALIFYING_FINAL', 'Qualifying + Final', 'Vong loai tinh gio (time attack), top N vao chung ket dau loai truc tiep', TRUE, TRUE, TRUE, TRUE, 2, '{}'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO contest_types (code, name, description, is_active, sort_order, metadata)
      VALUES
        ('GRAND_PRIX', 'Grand Prix', 'Giai dau mo phong Grand Prix/F1: vong loai tinh gio roi chung ket knockout', TRUE, 1, '{}'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO contest_templates (
        contest_type_id,
        contest_format_id,
        code,
        name,
        description,
        default_config,
        vehicle_policy_options,
        feature_flags,
        is_active,
        sort_order
      )
      SELECT
        ct.id,
        cf.id,
        'grand_prix_qualifying_final',
        'Grand Prix Qualifying Final',
        'Template mac dinh cho giai Grand Prix: vong loai time attack, top finalists vao chung ket knockout',
        '{"format":"QUALIFYING_FINAL","finalists":4,"drivers_per_match":2,"seeding_mode":"CHECK_IN_ORDER","leaderboard_mode":"KNOCKOUT_WINS","auto_bye":true}'::jsonb,
        '["RENTAL_ONLY","MIXED","BYOC_ONLY"]'::jsonb,
        '{"supports_entry_fee":true,"supports_booking_link":true,"supports_manual_results":true,"supports_bracket":true}'::jsonb,
        TRUE,
        2
      FROM contest_types ct
      CROSS JOIN contest_formats cf
      WHERE ct.code = 'GRAND_PRIX'
        AND cf.code = 'QUALIFYING_FINAL'
        AND NOT EXISTS (
          SELECT 1 FROM contest_templates t WHERE t.code = 'grand_prix_qualifying_final'
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM contest_templates WHERE code = 'grand_prix_qualifying_final';
    `);
    await queryRunner.query(`
      DELETE FROM contest_types WHERE code = 'GRAND_PRIX';
    `);
    await queryRunner.query(`
      DELETE FROM contest_formats WHERE code = 'QUALIFYING_FINAL';
    `);
  }
}
