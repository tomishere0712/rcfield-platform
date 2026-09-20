import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeWidgetConfigIntoCafes1751400000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE cafes
      ADD COLUMN widget_config JSONB NOT NULL DEFAULT '{
        "greetingMessage": "Xin chào! Tôi có thể giúp gì cho bạn?",
        "welcomeMessage":  "Xin chào! Tôi có thể giúp gì cho bạn?",
        "position":        "BOTTOM_RIGHT",
        "primaryColor":    "#2563EB",
        "avatarUrl":       null,
        "quickReplies":    [],
        "systemPrompt":    null,
        "isEnabled":       false,
        "fullPageEnabled": false
      }'::jsonb
    `);

    await qr.query(`
      UPDATE cafes c
      SET widget_config = jsonb_build_object(
        'greetingMessage', COALESCE(w.greeting_message, 'Xin chào! Tôi có thể giúp gì cho bạn?'),
        'welcomeMessage',  COALESCE(w.welcome_message,  'Xin chào! Tôi có thể giúp gì cho bạn?'),
        'position',        COALESCE(w.position,        'BOTTOM_RIGHT'),
        'primaryColor',    COALESCE(w.primary_color,   '#2563EB'),
        'avatarUrl',       w.avatar_url,
        'quickReplies',    COALESCE(w.quick_replies,   '[]'::jsonb),
        'systemPrompt',    w.system_prompt,
        'isEnabled',       COALESCE(w.is_enabled,      false),
        'fullPageEnabled', COALESCE(w.full_page_enabled, false)
      )
      FROM cafe_widget_configs w
      WHERE w.cafe_id = c.id
    `);

    await qr.query(`DROP TABLE cafe_widget_configs`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE cafe_widget_configs (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id          UUID        NOT NULL UNIQUE,
        greeting_message TEXT        NOT NULL DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
        welcome_message  TEXT        NOT NULL DEFAULT 'Xin chào! Tôi có thể giúp gì cho bạn?',
        position         VARCHAR(20) NOT NULL DEFAULT 'BOTTOM_RIGHT',
        primary_color    VARCHAR(7)  NOT NULL DEFAULT '#2563EB',
        avatar_url       TEXT,
        quick_replies    JSONB       NOT NULL DEFAULT '[]',
        system_prompt    TEXT,
        is_enabled       BOOLEAN     NOT NULL DEFAULT false,
        full_page_enabled BOOLEAN    NOT NULL DEFAULT false,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await qr.query(`
      INSERT INTO cafe_widget_configs
        (cafe_id, greeting_message, welcome_message, position, primary_color,
         avatar_url, quick_replies, system_prompt, is_enabled, full_page_enabled)
      SELECT
        id,
        COALESCE(widget_config->>'greetingMessage', 'Xin chào! Tôi có thể giúp gì cho bạn?'),
        COALESCE(widget_config->>'welcomeMessage',  'Xin chào! Tôi có thể giúp gì cho bạn?'),
        COALESCE(widget_config->>'position',        'BOTTOM_RIGHT'),
        COALESCE(widget_config->>'primaryColor',    '#2563EB'),
        widget_config->>'avatarUrl',
        COALESCE(widget_config->'quickReplies',     '[]'::jsonb),
        widget_config->>'systemPrompt',
        COALESCE((widget_config->>'isEnabled')::boolean,       false),
        COALESCE((widget_config->>'fullPageEnabled')::boolean, false)
      FROM cafes
    `);

    await qr.query(`ALTER TABLE cafes DROP COLUMN widget_config`);
  }
}
