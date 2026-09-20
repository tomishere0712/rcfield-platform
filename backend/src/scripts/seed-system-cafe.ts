import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Seed "cafe hệ thống" — chi nhánh ảo dùng làm scope cho chatbot RCField trên
// landing page. Không phải chi nhánh thật, không nhận booking.
//
// Vì sao cần một row trong `cafes`: kb_documents.cafe_id, kb_chunks.cafe_id và
// cafes.widget_config đều gắn FK NOT NULL về cafes(id) — KB và widget config
// không tồn tại được nếu không có cafe.
//
// UUID cố định để khớp VITE_PLATFORM_CAFE_ID bên FE (AdminChannelSettingsPage)
// và fallback trong features/chat/api/index.ts.
//
// Chạy local:  npm run seed:system-cafe
// Chạy Coolify: node dist/scripts/seed-system-cafe.js
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_CAFE_ID = process.env.SYSTEM_CAFE_ID ?? '7a00648b-c247-47d0-8f24-799ec5e38413';
const SYSTEM_CAFE_SLUG = 'rcfield-system';

const WIDGET_CONFIG = {
  greetingMessage:
    'Xin chào! Tôi là trợ lý AI của RCField. Hỏi tôi về nền tảng, tính năng hoặc cách đăng ký nhé!',
  welcomeMessage: 'Xin chào! Tôi là trợ lý AI của RCField.',
  position: 'BOTTOM_RIGHT',
  primaryColor: '#EA580C',
  quickReplies: ['RCField là gì?', 'Cách đăng ký', 'Tính năng nổi bật', 'Chi phí sử dụng'],
  systemPrompt:
    'Bạn là trợ lý AI của nền tảng RCField — phần mềm quản lý sân xe RC tại Việt Nam. ' +
    'Chỉ trả lời về nền tảng: tính năng, gói dịch vụ, cách đăng ký làm đối tác. ' +
    'Không trả lời về slot, menu hay xe của một chi nhánh cụ thể — hãy hướng khách vào trang chi nhánh đó.',
  isEnabled: true,
  fullPageEnabled: false,
};

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  logger.database('Connected');

  // Chủ sở hữu phải là user role ADMIN — chat.service.ts:35 và :77 dựa vào đó
  // để bypass feature flag gate và AI quota cho cafe hệ thống.
  const [admin] = await AppDataSource.query<{ id: string; email: string }[]>(
    `SELECT id, email FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  );

  if (!admin) {
    logger.error('Seed', 'Không tìm thấy user role ADMIN — chạy seed-users trước', null);
    await AppDataSource.destroy();
    process.exit(1);
  }

  logger.info('Seed', `Owner = ${admin.email} (${admin.id})`);

  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM cafes WHERE id = $1 OR slug = $2 LIMIT 1`,
    [SYSTEM_CAFE_ID, SYSTEM_CAFE_SLUG],
  );

  let cafeId: string;

  if (existing) {
    cafeId = existing.id;
    // Hồi sinh nếu đã bị seed-cafes.ts suspend / soft-delete
    await AppDataSource.query(
      `UPDATE cafes
          SET provider_id   = $1,
              status        = 'ACTIVE',
              deleted_at    = NULL,
              widget_config = widget_config || $2::jsonb
        WHERE id = $3`,
      [admin.id, JSON.stringify(WIDGET_CONFIG), cafeId],
    );
    logger.warn('Seed', `Cafe hệ thống đã tồn tại — đã kích hoạt lại (${cafeId})`);
  } else {
    const [created] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO cafes (
         id, provider_id, name, slug, description, status,
         address, district, city,
         operating_hours, track_types,
         slot_duration_minutes, slot_fee_rate, max_concurrent_bookings,
         min_booking_notice_minutes, byoc_capacity, widget_config
       ) VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,'{}'::jsonb,'{}',60,0,0,0,0,$9::jsonb)
       RETURNING id`,
      [
        SYSTEM_CAFE_ID,
        admin.id,
        'RCField (Hệ thống)',
        SYSTEM_CAFE_SLUG,
        'Chi nhánh ảo dùng làm scope cho chatbot hệ thống trên landing page. Không nhận booking.',
        'N/A',
        'N/A',
        'N/A',
        JSON.stringify(WIDGET_CONFIG),
      ],
    );
    cafeId = created.id;
    logger.info('Seed', `Đã tạo cafe hệ thống (${cafeId})`);
  }

  // Feature flag AI_CHATBOT — lưới an toàn nếu owner không còn role ADMIN
  const [flag] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM feature_flags WHERE feature_key = 'AI_CHATBOT' AND entity_id = $1`,
    [cafeId],
  );

  if (flag) {
    await AppDataSource.query(`UPDATE feature_flags SET is_enabled = true WHERE id = $1`, [
      flag.id,
    ]);
    logger.warn('Seed', 'Feature flag AI_CHATBOT đã tồn tại — đã bật lại');
  } else {
    await AppDataSource.query(
      `INSERT INTO feature_flags (
         feature_key, display_name, description,
         is_enabled, entity_type, entity_id,
         config, enabled_by, enabled_at
       ) VALUES ($1,$2,$3,true,'CAFE',$4,$5,$6,now())`,
      [
        'AI_CHATBOT',
        'AI Chat — RCField (Hệ thống)',
        'Chatbot nền tảng trên landing page',
        cafeId,
        JSON.stringify({ monthly_quota: 100000, used_this_month: 0, quota_reset_day: 1 }),
        admin.id,
      ],
    );
    logger.info('Seed', 'Đã tạo feature flag AI_CHATBOT');
  }

  await AppDataSource.destroy();

  logger.info('Seed', '─────────────────────────────────────────────');
  logger.info('Seed', `Cafe hệ thống sẵn sàng: ${cafeId}`);
  logger.info('Seed', `Kiểm tra: GET /api/v1/system/widget-config`);
  if (cafeId !== SYSTEM_CAFE_ID) {
    logger.warn(
      'Seed',
      `ID khác với VITE_PLATFORM_CAFE_ID bên FE (${SYSTEM_CAFE_ID}) — cập nhật lại biến env FE`,
    );
  }
  logger.info('Seed', '─────────────────────────────────────────────');
}

seed().catch((err) => {
  logger.error('Seed', 'Failed', err);
  process.exit(1);
});
