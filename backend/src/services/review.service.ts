import { AppDataSource } from '../config/database';
import { Review } from '../models/review.entity';
import { Booking } from '../models/booking.entity';
import { Session } from '../models/session.entity';
import { PaymentComponent } from '../models/payment-component.entity';
import {
  AppError,
  BookingMode,
  BookingStatus,
  PaymentComponentStatus,
  ReviewStatus,
  SessionStatus,
  UserRole,
} from '../types';

const REVIEW_WINDOW_DAYS = 5;
const REVIEW_REMINDER_SNOOZE_HOURS = 24;

// ── US1: Submit review ────────────────────────────────────────────────────────

export interface CreateReviewBody {
  booking_id: string;
  overall_score: number;
  vehicle_score?: number | null;
  staff_score?: number | null;
  facility_score?: number | null;
  note?: string | null;
}

export async function createReview(customerId: string, body: CreateReviewBody): Promise<Review> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const reviewRepo = AppDataSource.getRepository(Review);
  const sessionRepo = AppDataSource.getRepository(Session);
  const paymentCompRepo = AppDataSource.getRepository(PaymentComponent);

  const booking = await bookingRepo.findOne({ where: { id: body.booking_id } });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Booking không tồn tại hoặc bạn không có quyền', 404, 'BOOKING_NOT_FOUND');
  }

  const existing = await reviewRepo.findOne({ where: { bookingId: body.booking_id } });
  if (existing) {
    throw new AppError('Booking này đã được đánh giá', 409, 'ALREADY_REVIEWED');
  }

  // Check completion: either booking is COMPLETED or its associated session is COMPLETED
  const session = await sessionRepo.findOne({ where: { bookingId: booking.id } });
  const isSessionCompleted = session?.status === SessionStatus.COMPLETED;

  if (booking.status !== BookingStatus.COMPLETED && !isSessionCompleted) {
    throw new AppError('Booking chưa hoàn thành ca chơi', 400, 'BOOKING_NOT_COMPLETED');
  }

  // Auto-heal booking completion if session is completed and no pending payment components
  if (booking.status !== BookingStatus.COMPLETED && isSessionCompleted) {
    const pendingPayments = await paymentCompRepo.count({
      where: { bookingId: booking.id, status: PaymentComponentStatus.PENDING },
    });
    if (pendingPayments === 0) {
      booking.status = BookingStatus.COMPLETED;
      booking.completedAt = booking.completedAt || session?.actualEndAt || new Date();
      await bookingRepo.save(booking);
    }
  }

  if (!booking.completedAt) {
    booking.completedAt = session?.actualEndAt || booking.slotEnd || new Date();
    await bookingRepo.save(booking);
  }

  const deadline = new Date(
    new Date(booking.completedAt).getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  if (new Date() > deadline) {
    throw new AppError(
      'Thời hạn đánh giá đã hết (5 ngày sau khi kết thúc phiên)',
      400,
      'REVIEW_PERIOD_EXPIRED',
    );
  }

  const vehicleScore = booking.playMode === BookingMode.BYOC ? null : (body.vehicle_score ?? null);

  const review = reviewRepo.create({
    bookingId: body.booking_id,
    cafeId: booking.cafeId,
    customerId,
    overallScore: body.overall_score,
    vehicleScore,
    staffScore: body.staff_score ?? null,
    facilityScore: body.facility_score ?? null,
    note: body.note ?? null,
    status: ReviewStatus.VISIBLE,
  });

  return reviewRepo.save(review);
}

// ── US1: Dismiss review reminder ──────────────────────────────────────────────

export async function dismissReview(customerId: string, bookingId: string): Promise<void> {
  const bookingRepo = AppDataSource.getRepository(Booking);

  const booking = await bookingRepo.findOne({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Booking không tồn tại hoặc bạn không có quyền', 404, 'BOOKING_NOT_FOUND');
  }

  booking.reviewDismissedAt = new Date();
  await bookingRepo.save(booking);
}

/**
 * Keeps a review eligible, but delays the reminder. This is intentionally
 * separate from dismissReview so existing, permanently dismissed reminders
 * remain backward compatible while the current UX can offer “Để sau”.
 */
export async function snoozeReviewReminder(customerId: string, bookingId: string): Promise<void> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const reviewRepo = AppDataSource.getRepository(Review);

  const booking = await bookingRepo.findOne({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Booking không tồn tại hoặc bạn không có quyền', 404, 'BOOKING_NOT_FOUND');
  }

  if (
    booking.status !== BookingStatus.COMPLETED ||
    !booking.completedAt ||
    booking.reviewDismissedAt
  ) {
    throw new AppError('Đơn đặt này không còn đủ điều kiện đánh giá', 400, 'REVIEW_NOT_AVAILABLE');
  }

  const deadline = new Date(booking.completedAt);
  deadline.setDate(deadline.getDate() + REVIEW_WINDOW_DAYS);
  if (new Date() > deadline) {
    throw new AppError('Thời hạn đánh giá đã hết (5 ngày)', 400, 'REVIEW_PERIOD_EXPIRED');
  }

  const existingReview = await reviewRepo.findOne({ where: { bookingId } });
  if (existingReview) {
    throw new AppError('Booking này đã được đánh giá', 409, 'ALREADY_REVIEWED');
  }

  booking.reviewSnoozedUntil = new Date(Date.now() + REVIEW_REMINDER_SNOOZE_HOURS * 60 * 60 * 1000);
  await bookingRepo.save(booking);
}

// ── US1: Get pending reviews ──────────────────────────────────────────────────

export interface PendingReviewItem {
  bookingId: string;
  cafeId: string;
  cafeName: string;
  slotStart: Date;
  slotEnd: Date;
  playMode: string;
  completedAt: Date;
}

export async function getPendingReviews(
  customerId: string,
  includeSnoozed = false,
): Promise<PendingReviewItem[]> {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() - REVIEW_WINDOW_DAYS);

  const rows = await AppDataSource.query<PendingReviewItem[]>(
    `SELECT
       b.id AS "bookingId",
       b.cafe_id AS "cafeId",
       c.name AS "cafeName",
       b.slot_start AS "slotStart",
       b.slot_end AS "slotEnd",
       b.play_mode AS "playMode",
       b.completed_at AS "completedAt"
     FROM bookings b
     JOIN cafes c ON c.id = b.cafe_id
     WHERE b.customer_id = $1
       AND b.status = 'COMPLETED'
       AND b.completed_at IS NOT NULL
       AND b.completed_at > $2
       AND b.review_dismissed_at IS NULL
       ${includeSnoozed ? '' : 'AND (b.review_snoozed_until IS NULL OR b.review_snoozed_until <= NOW())'}
       AND b.source <> 'STAFF_MANUAL'
       AND NOT EXISTS (
         SELECT 1 FROM reviews r WHERE r.booking_id = b.id
       )
     ORDER BY b.completed_at DESC`,
    [customerId, deadline],
  );

  return rows;
}

// ── US1: List customer's own reviews ─────────────────────────────────────────

export async function listCustomerReviews(
  customerId: string,
  page: number,
  limit: number,
): Promise<{ data: (Review & { cafeName: string })[]; total: number }> {
  const offset = (page - 1) * limit;
  const [rows, [{ count }]] = await Promise.all([
    AppDataSource.query<(Review & { cafeName: string })[]>(
      `SELECT
         r.id,
         r.booking_id       AS "bookingId",
         r.cafe_id          AS "cafeId",
         r.customer_id      AS "customerId",
         r.rating           AS "overallScore",
         r.vehicle_score    AS "vehicleScore",
         r.staff_score      AS "staffScore",
         r.facility_score   AS "facilityScore",
         r.note,
         r.status,
         r.created_at       AS "createdAt",
         c.name             AS "cafeName"
       FROM reviews r
       JOIN cafes c ON c.id = r.cafe_id
       WHERE r.customer_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [customerId, limit, offset],
    ),
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) FROM reviews WHERE customer_id = $1`,
      [customerId],
    ),
  ]);
  return { data: rows, total: parseInt(count, 10) };
}

// ── US3: Mask customer name ───────────────────────────────────────────────────

export function maskName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];

  const ho = tokens[0];
  const ten = tokens[tokens.length - 1];

  if (tokens.length >= 3) {
    const dem = tokens[1];
    return `${ho} ${dem[0]}. ${ten[0]}.`;
  }

  return `${ho} ${ten[0]}.`;
}

// ── US3: Public cafe review aggregate ────────────────────────────────────────

export interface CafeAggregate {
  cafeId: string;
  reviewCount: number;
  overallAvg: number | null;
  vehicleAvg: number | null;
  staffAvg: number | null;
  facilityAvg: number | null;
}

export async function getCafeAggregate(cafeId: string): Promise<CafeAggregate> {
  const [row] = await AppDataSource.query<CafeAggregate[]>(
    `SELECT
       $1::uuid AS "cafeId",
       COUNT(*)::int AS "reviewCount",
       ROUND(AVG(rating)::numeric, 1) AS "overallAvg",
       ROUND(AVG(vehicle_score)::numeric, 1) AS "vehicleAvg",
       ROUND(AVG(staff_score)::numeric, 1) AS "staffAvg",
       ROUND(AVG(facility_score)::numeric, 1) AS "facilityAvg"
     FROM reviews
     WHERE cafe_id = $1 AND status = 'VISIBLE'`,
    [cafeId],
  );

  if (!row || row.reviewCount === 0) {
    return {
      cafeId,
      reviewCount: 0,
      overallAvg: null,
      vehicleAvg: null,
      staffAvg: null,
      facilityAvg: null,
    };
  }
  return row;
}

// ── US3: Public cafe review list ─────────────────────────────────────────────

export interface PublicReview {
  id: string;
  customerId: string;
  customerName: string;
  fullName: string;
  overallScore: number;
  vehicleScore: number | null;
  staffScore: number | null;
  facilityScore: number | null;
  note: string | null;
  createdAt: Date;
}

export async function getCafeReviews(
  cafeId: string,
  page: number,
  limit: number,
): Promise<{ data: PublicReview[]; total: number }> {
  const offset = (page - 1) * limit;

  const [rows, [{ count }]] = await Promise.all([
    AppDataSource.query<(PublicReview & { full_name: string; customer_id: string })[]>(
      `SELECT
         r.id,
         r.customer_id AS "customerId",
         u.full_name AS "fullName",
         u.full_name,
         r.rating AS "overallScore",
         r.vehicle_score AS "vehicleScore",
         r.staff_score AS "staffScore",
         r.facility_score AS "facilityScore",
         r.note,
         r.created_at AS "createdAt"
       FROM reviews r
       JOIN users u ON u.id = r.customer_id
       WHERE r.cafe_id = $1 AND r.status = 'VISIBLE'
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [cafeId, limit, offset],
    ),
    AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM reviews WHERE cafe_id = $1 AND status = 'VISIBLE'`,
      [cafeId],
    ),
  ]);

  const data = rows.map((r) => ({
    ...r,
    customerId: r.customerId,
    fullName: r.fullName,
    customerName: r.fullName, // Hiển thị đầy đủ tên thật không che theo yêu cầu
  }));
  return { data, total: parseInt(count, 10) };
}

// ── Public recent reviews (dành cho HomeScreen mobile) ────────────────────────
export async function getRecentReviews(
  limit: number,
): Promise<{ data: (PublicReview & { cafeName: string })[] }> {
  const rows = await AppDataSource.query<
    (PublicReview & { full_name: string; customer_id: string; cafeName: string })[]
  >(
    `SELECT
       r.id,
       r.customer_id AS "customerId",
       u.full_name AS "fullName",
       r.rating AS "overallScore",
       r.vehicle_score AS "vehicleScore",
       r.staff_score AS "staffScore",
       r.facility_score AS "facilityScore",
       r.note,
       r.created_at AS "createdAt",
       c.name AS "cafeName"
     FROM reviews r
     JOIN users u ON u.id = r.customer_id
     JOIN cafes c ON c.id = r.cafe_id
     WHERE r.status = 'VISIBLE'
       AND r.note IS NOT NULL
       AND r.note <> ''
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [limit],
  );

  const data = rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.fullName,
    fullName: r.fullName,
    overallScore: r.overallScore,
    vehicleScore: r.vehicleScore,
    staffScore: r.staffScore,
    facilityScore: r.facilityScore,
    note: r.note,
    createdAt: r.createdAt,
    cafeName: r.cafeName,
  }));

  return { data };
}

// ── US4: Provider review list ─────────────────────────────────────────────────

export interface ProviderReviewItem {
  id: string;
  bookingId: string;
  cafeId: string;
  customerId: string;
  overallScore: number;
  vehicleScore: number | null;
  staffScore: number | null;
  facilityScore: number | null;
  note: string | null;
  status: ReviewStatus;
  createdAt: Date;
  customerName: string;
}

interface ProviderReviewViewer {
  userId: string;
  role: UserRole.PROVIDER | UserRole.ADMIN;
}

interface ProviderReviewQuery {
  cafeId?: string;
  status?: ReviewStatus;
  page: number;
  limit: number;
}

function buildProviderReviewFilters(
  viewer: ProviderReviewViewer,
  { cafeId, status }: Pick<ProviderReviewQuery, 'cafeId' | 'status'>,
): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (viewer.role === UserRole.PROVIDER) {
    params.push(viewer.userId);
    conditions.push(`c.provider_id = $${params.length}`);
  }

  if (cafeId) {
    params.push(cafeId);
    conditions.push(`r.cafe_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export async function getProviderReviews(
  viewer: ProviderReviewViewer,
  options: ProviderReviewQuery,
): Promise<{ data: ProviderReviewItem[]; total: number; newSince24h: number }> {
  const { page, limit } = options;
  const offset = (page - 1) * limit;
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { where, params } = buildProviderReviewFilters(viewer, options);
  const fromClause = 'FROM reviews r JOIN cafes c ON c.id = r.cafe_id';
  const pageLimitPlaceholder = `$${params.length + 1}`;
  const pageOffsetPlaceholder = `$${params.length + 2}`;
  const thresholdPlaceholder = `$${params.length + 1}`;

  const [rows, [{ count }], [{ newCount }]] = await Promise.all([
    AppDataSource.query<(ProviderReviewItem & { fullName: string })[]>(
      `SELECT
         r.id,
         r.booking_id AS "bookingId",
         r.cafe_id AS "cafeId",
         r.customer_id AS "customerId",
         r.rating AS "overallScore",
         r.vehicle_score AS "vehicleScore",
         r.staff_score AS "staffScore",
         r.facility_score AS "facilityScore",
         r.note,
         r.status,
         r.created_at AS "createdAt",
         u.full_name AS "fullName"
       FROM reviews r
       JOIN users u ON u.id = r.customer_id
       JOIN cafes c ON c.id = r.cafe_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ${pageLimitPlaceholder} OFFSET ${pageOffsetPlaceholder}`,
      [...params, limit, offset],
    ),
    AppDataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count ${fromClause} ${where}`,
      params,
    ),
    AppDataSource.query<{ newCount: string }[]>(
      `SELECT COUNT(*)::text AS "newCount" FROM reviews r
       JOIN cafes c ON c.id = r.cafe_id
       ${where}${where ? ' AND' : ' WHERE'} r.created_at > ${thresholdPlaceholder}`,
      [...params, threshold],
    ),
  ]);

  const data: ProviderReviewItem[] = rows.map((r) => ({
    ...r,
    customerName: r.fullName,
  }));

  return { data, total: parseInt(count, 10), newSince24h: parseInt(newCount, 10) };
}

// ── US4: Set review visibility ────────────────────────────────────────────────

export async function setVisibility(
  reviewId: string,
  viewer: ProviderReviewViewer,
  status: ReviewStatus,
): Promise<Review> {
  const reviewRepo = AppDataSource.getRepository(Review);

  const query = reviewRepo
    .createQueryBuilder('r')
    .innerJoin('cafes', 'c', 'c.id = r.cafe_id')
    .where('r.id = :reviewId', { reviewId });

  if (viewer.role === UserRole.PROVIDER) {
    query.andWhere('c.provider_id = :providerId', { providerId: viewer.userId });
  }

  const review = await query.getOne();

  if (!review) {
    throw new AppError(
      'Review không tồn tại hoặc không thuộc quyền quản lý của bạn',
      404,
      'REVIEW_NOT_FOUND',
    );
  }

  review.status = status;
  return reviewRepo.save(review);
}
