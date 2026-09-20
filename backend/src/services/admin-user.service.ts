import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { User } from '../models/user.entity';
import { UserModerationLog } from '../models/user-moderation-log.entity';
import { AppError, UserModerationAction, UserRole } from '../types';

/**
 * Quản lý người dùng cho admin — xem hành vi rồi quyết định khoá hay không.
 *
 * Trọng tâm là ĐỦ CĂN CỨ trước khi chặn ai đó dùng dịch vụ. Con số duy nhất
 * đáng tin ở đây là số lần khách TỰ huỷ; huỷ do quán hay do hệ thống không phải
 * lỗi của khách, gộp chung vào là khoá nhầm người.
 */

export interface UserBehaviour {
  total_bookings: number;
  /** Khách tự bấm huỷ — chỉ số này mới quy được trách nhiệm. */
  self_cancelled: number;
  /** Huỷ bởi quán, nhân viên, hoặc hệ thống hết hạn giữ chỗ. */
  cancelled_by_others: number;
  no_show: number;
  completed: number;
  /** Tỉ lệ hỏng hẹn = (tự huỷ + vắng mặt) / tổng, làm tròn 2 chữ số. */
  broken_rate: number;
  last_booking_at: Date | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  trust_score: number;
  created_at: Date;
  behaviour: UserBehaviour;
}

/**
 * Thống kê đặt lịch theo từng khách.
 *
 * `cancelled_by = customer_id` là dấu hiệu khách TỰ huỷ. Đếm hết mọi booking
 * CANCELLED mà không phân biệt người huỷ thì một khách bị quán huỷ năm lần vì
 * quán sửa sân sẽ hiện lên như kẻ chuyên bỏ hẹn — và admin khoá đúng người
 * đang bị thiệt.
 */
const BEHAVIOUR_SQL = `
  SELECT b.customer_id AS user_id,
         COUNT(*)::int AS total_bookings,
         COUNT(*) FILTER (
           WHERE b.status = 'CANCELLED' AND b.cancelled_by = b.customer_id
         )::int AS self_cancelled,
         COUNT(*) FILTER (
           WHERE b.status = 'CANCELLED' AND (b.cancelled_by IS NULL OR b.cancelled_by <> b.customer_id)
         )::int AS cancelled_by_others,
         COUNT(*) FILTER (WHERE b.status = 'NO_SHOW')::int AS no_show,
         COUNT(*) FILTER (WHERE b.status = 'COMPLETED')::int AS completed,
         MAX(b.slot_start) AS last_booking_at
    FROM bookings b
   WHERE b.customer_id = ANY($1::uuid[])
   GROUP BY b.customer_id
`;

type BehaviourRow = Omit<UserBehaviour, 'broken_rate'> & { user_id: string };

function emptyBehaviour(): UserBehaviour {
  return {
    total_bookings: 0,
    self_cancelled: 0,
    cancelled_by_others: 0,
    no_show: 0,
    completed: 0,
    broken_rate: 0,
    last_booking_at: null,
  };
}

function withRate(row: BehaviourRow): UserBehaviour {
  const broken = row.self_cancelled + row.no_show;
  return {
    total_bookings: row.total_bookings,
    self_cancelled: row.self_cancelled,
    cancelled_by_others: row.cancelled_by_others,
    no_show: row.no_show,
    completed: row.completed,
    // Chia cho 0 ra NaN, và NaN đi thẳng vào JSON thành null — giao diện hiện
    // ô trống thay vì "0%". Người chưa đặt lần nào thì tỉ lệ hỏng hẹn là 0.
    broken_rate:
      row.total_bookings > 0 ? Math.round((broken / row.total_bookings) * 10000) / 100 : 0,
    last_booking_at: row.last_booking_at,
  };
}

async function behaviourFor(userIds: string[]): Promise<Map<string, UserBehaviour>> {
  const map = new Map<string, UserBehaviour>();
  if (!userIds.length) return map;
  const rows = await AppDataSource.query<BehaviourRow[]>(BEHAVIOUR_SQL, [userIds]);
  rows.forEach((r) => map.set(r.user_id, withRate(r)));
  return map;
}

export interface ListUsersQuery {
  page: number;
  limit: number;
  q?: string;
  /** `locked` = đang bị khoá, `active` = đang dùng được. */
  status?: 'active' | 'locked';
  /** `risk` xếp người hỏng hẹn nhiều lên đầu; mặc định người mới nhất trước. */
  sort?: 'newest' | 'risk';
}

/**
 * Danh sách CHỈ gồm tài khoản khách.
 *
 * Toàn bộ màn hình này xoay quanh hành vi đặt lịch, mà chủ sân, nhân viên và
 * quản trị viên không đặt lịch — họ luôn hiện ra với mọi con số bằng 0. Trộn
 * vào chỉ làm loãng danh sách và đẩy người thật sự cần chú ý xuống dưới.
 */
export async function listUsers(query: ListUsersQuery) {
  const { page, limit, q, status, sort } = query;
  const params: unknown[] = [UserRole.CUSTOMER];
  const where: string[] = ['u.deleted_at IS NULL', 'u.role = $1'];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status === 'active');
    where.push(`u.is_active = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const [{ count }] = await AppDataSource.query<[{ count: string }]>(
    `SELECT COUNT(*)::text AS count FROM users u WHERE ${whereSql}`,
    params,
  );

  // Sắp theo rủi ro phải làm NGAY TRONG SQL, không phải sắp lại trang hiện tại
  // sau khi lấy về: sắp ở tầng ứng dụng thì người hỏng hẹn nhiều nhất nằm ở
  // trang 7 vẫn không bao giờ nổi lên trang 1 — đúng người cần thấy thì không thấy.
  const orderSql =
    sort === 'risk'
      ? `(COALESCE(s.self_cancelled, 0) + COALESCE(s.no_show, 0)) DESC, u.created_at DESC`
      : `u.created_at DESC`;

  params.push(limit, (page - 1) * limit);
  const rows = await AppDataSource.query<
    Array<Omit<AdminUserRow, 'behaviour'> & { trust_score: string }>
  >(
    `SELECT u.id, u.email, u.full_name, u.phone, u.is_active,
            u.trust_score, u.created_at
       FROM users u
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (
                  WHERE b.status = 'CANCELLED' AND b.cancelled_by = b.customer_id
                )::int AS self_cancelled,
                COUNT(*) FILTER (WHERE b.status = 'NO_SHOW')::int AS no_show
           FROM bookings b
          WHERE b.customer_id = u.id
       ) s ON TRUE
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const behaviour = await behaviourFor(rows.map((r) => r.id));
  return {
    data: rows.map((r) => ({
      ...r,
      trust_score: Number(r.trust_score),
      behaviour: behaviour.get(r.id) ?? emptyBehaviour(),
    })),
    meta: { total: Number(count), page, limit },
  };
}

export async function getUserDetail(userId: string) {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');

  const behaviour = (await behaviourFor([userId])).get(userId) ?? emptyBehaviour();

  const recentBookings = await AppDataSource.query<
    Array<{
      id: string;
      cafe_name: string;
      slot_start: Date;
      status: string;
      cancelled_at: Date | null;
      cancellation_reason: string | null;
      cancelled_by_self: boolean;
    }>
  >(
    `SELECT b.id, c.name AS cafe_name, b.slot_start, b.status,
            b.cancelled_at, b.cancellation_reason,
            (b.cancelled_by = b.customer_id) AS cancelled_by_self
       FROM bookings b
       JOIN cafes c ON c.id = b.cafe_id
      WHERE b.customer_id = $1
      ORDER BY b.slot_start DESC
      LIMIT 20`,
    [userId],
  );

  const history = await AppDataSource.query<
    Array<{
      id: string;
      action: string;
      reason: string;
      created_at: Date;
      actor_email: string;
      metadata: Record<string, unknown>;
    }>
  >(
    `SELECT l.id, l.action, l.reason, l.created_at, l.metadata, a.email AS actor_email
       FROM user_moderation_logs l
       JOIN users a ON a.id = l.actor_id
      WHERE l.user_id = $1
      ORDER BY l.created_at DESC`,
    [userId],
  );

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    is_active: user.is_active,
    trust_score: Number(user.trust_score),
    created_at: user.created_at,
    behaviour,
    recent_bookings: recentBookings,
    moderation_history: history,
  };
}

/**
 * Khoá hoặc mở khoá một tài khoản.
 *
 * Ba điều khoá chặt ở đây:
 *
 *  1. KHÔNG đụng được tài khoản ADMIN. Admin khoá lẫn nhau — hoặc khoá chính
 *     mình — là cách nhanh nhất để không còn ai vào được trang quản trị, và
 *     không có đường tự mở lại từ trong ứng dụng.
 *  2. Lý do BẮT BUỘC, và được ghi lại cùng số liệu hành vi tại thời điểm đó.
 *     Không có căn cứ kèm theo thì tháng sau không ai dựng lại được quyết định.
 *  3. Đang khoá mà khoá tiếp thì từ chối, thay vì lặng lẽ ghi thêm một dòng
 *     nhật ký cho một thay đổi không xảy ra.
 */
async function moderate(
  userId: string,
  actorId: string,
  action: UserModerationAction,
  reason: string,
): Promise<{ id: string; is_active: boolean }> {
  const repo = AppDataSource.getRepository(User);
  const user = await repo.findOne({ where: { id: userId } });
  if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');

  if (user.role === UserRole.ADMIN) {
    throw new AppError('Không thể khoá tài khoản quản trị viên', 403, 'CANNOT_MODERATE_ADMIN');
  }

  const wantActive = action === UserModerationAction.UNLOCK;
  if (user.is_active === wantActive) {
    throw new AppError(
      wantActive ? 'Tài khoản đang hoạt động bình thường' : 'Tài khoản đã bị khoá từ trước',
      400,
      'ALREADY_IN_STATE',
    );
  }

  const behaviour = (await behaviourFor([userId])).get(userId) ?? emptyBehaviour();

  user.is_active = wantActive;
  await repo.save(user);

  const logRepo = AppDataSource.getRepository(UserModerationLog);
  await logRepo.save(
    logRepo.create({
      userId,
      actorId,
      action,
      reason,
      // Chụp lại số liệu tại thời điểm quyết định. Đọc lại từ bookings về sau
      // sẽ ra con số KHÁC, vì khách vẫn tiếp tục đặt lịch — và khi đó nhật ký
      // không còn giải thích được vì sao lúc ấy lại khoá.
      metadata: { behaviour_at_decision: behaviour },
    }),
  );

  logger.info('AdminUser', action === UserModerationAction.LOCK ? 'locked' : 'unlocked', {
    userId,
    actorId,
  });
  return { id: user.id, is_active: user.is_active };
}

export function lockUser(userId: string, actorId: string, reason: string) {
  return moderate(userId, actorId, UserModerationAction.LOCK, reason);
}

export function unlockUser(userId: string, actorId: string, reason: string) {
  return moderate(userId, actorId, UserModerationAction.UNLOCK, reason);
}
