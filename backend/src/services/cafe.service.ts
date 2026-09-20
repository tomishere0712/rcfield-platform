import { Brackets, FindOptionsWhere, In, LessThan, MoreThan, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Cafe } from '../models/cafe.entity';
import { AmenityCatalog } from '../models/amenity-catalog.entity';
import { TrackType } from '../models/track-type.entity';
import {
  AppError,
  BookingStatus,
  CafeOperatingHours,
  CafeStatus,
  DiscountType,
  PromoApplicableTo,
  ReviewStatus,
  UserRole,
  VehicleStatus,
} from '../types';
import { checkBranchQuota } from './subscription.service';
import { Booking } from '../models/booking.entity';
import { ProviderProfile } from '../models/provider-profile.entity';
import { DAY_MS } from '../lib/vietnam-time';
import { hasFreeSlotOnDay, type OccupyingBooking } from '../lib/cafe-day-availability';

export interface Viewer {
  userId: string;
  role: UserRole;
}

interface ListOptions {
  page: number;
  limit: number;
  scope?: 'managed';
  query?: string;
  slug?: string;
  district?: string;
  city?: string;
  track_type?: string;
  price_min?: number;
  price_max?: number;
  amenities?: string[];
  vehicle_type?: string;
  sort_by?: 'popularity' | 'price_asc' | 'price_desc' | 'rating';
  popular_filters?: string[];
  status?: CafeStatus;
  /** 'YYYY-MM-DD' theo giờ Việt Nam. Chỉ giữ chi nhánh còn slot trống ngày đó. */
  date?: string;
  /** Năng lực của chi nhánh: còn xe cho thuê, hay có nhận khách mang xe riêng. */
  play_mode?: 'RENTAL' | 'BYOC';
  viewer?: Viewer;
}

type ActivePromotionSummary = {
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: number | null;
  applicable_to: PromoApplicableTo;
  expires_at: Date | null;
};

type CafeBrowseMetrics = {
  rating: number;
  reviewsCount: number;
};

type CafeBrowseItem = Omit<Cafe, 'trackTypes'> & {
  trackTypes: TrackType[];
  amenities: AmenityCatalog[];
  rating: number;
  reviewsCount: number;
  minPrice: number;
  /** Tên doanh nghiệp của chủ cơ sở. `null` khi hồ sơ chưa có. */
  providerName: string | null;
  activePromotions: ActivePromotionSummary[];
};

export interface CreateCafeBody {
  name: string;
  description?: string | null;
  phone?: string | null;
  cover_image_url?: string | null;
  address: string;
  district: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  operating_hours: CafeOperatingHours;
  track_types: string[];
  slot_duration_minutes: number;
  slot_fee_rate: number;
  max_concurrent_bookings: number;
  min_booking_notice_minutes: number;
  max_advance_booking_days: number;
  byoc_capacity: number;
  amenity_ids?: string[];
  rules?: string[];
}

export type UpdateCafeBody = Partial<CreateCafeBody>;

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'cafe';
}

async function makeUniqueSlug(name: string): Promise<string> {
  const repo = AppDataSource.getRepository(Cafe);
  const base = slugify(name);
  let slug = base;
  let suffix = 1;

  while (await repo.findOne({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  return slug;
}

/**
 * Chỉ chủ sở hữu chi nhánh đi qua được.
 *
 * ⚠️ Khác `getManagedCafeOrThrow`, hàm này KHÔNG cho STAFF qua. Với dữ liệu
 * nhạy cảm như tài khoản ngân hàng nhận tiền, đó là khác biệt quyết định —
 * dùng nhầm hàm kia là để nhân viên đọc và sửa được số tài khoản của chủ quán.
 */
export function assertCafeOwner(cafe: Cafe, providerId: string): void {
  if (cafe.providerId !== providerId) {
    throw new AppError('Bạn chỉ có thể cập nhật cafe thuộc sở hữu của mình', 403, 'FORBIDDEN');
  }
}

function normalizeSearchTerm(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeFilterValues(values?: string[]): string[] {
  if (!values) return [];
  return values.map((value) => value.trim()).filter(Boolean);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadCafeBrowseMetrics(cafeIds: string[]): Promise<Map<string, CafeBrowseMetrics>> {
  if (cafeIds.length === 0) return new Map();

  const rows = (await AppDataSource.query(
    `SELECT
       r.cafe_id AS "cafeId",
       ROUND(AVG(r.rating)::numeric, 1) AS rating,
       COUNT(r.id)::text AS "reviewsCount"
     FROM reviews r
     WHERE r.status = $2
       AND r.cafe_id = ANY($1::uuid[])
     GROUP BY r.cafe_id`,
    [cafeIds, ReviewStatus.VISIBLE],
  )) as Array<{ cafeId: string; rating: string | null; reviewsCount: string | null }>;

  return new Map(
    rows.map((row) => [
      row.cafeId,
      {
        rating: toNumber(row.rating),
        reviewsCount: toNumber(row.reviewsCount),
      },
    ]),
  );
}

async function loadCafeTrackTypes(cafes: Cafe[]): Promise<Map<string, TrackType[]>> {
  const allTrackTypeIds = Array.from(new Set(cafes.flatMap((cafe) => cafe.trackTypes || [])));
  const trackTypes =
    allTrackTypeIds.length > 0
      ? await AppDataSource.getRepository(TrackType).findBy({ id: In(allTrackTypeIds) })
      : [];
  const trackTypeMap = new Map(trackTypes.map((t) => [t.id, t]));

  return new Map(
    cafes.map((cafe) => [
      cafe.id,
      (cafe.trackTypes || [])
        .map((id) => trackTypeMap.get(id))
        .filter((trackType): trackType is TrackType => !!trackType)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    ]),
  );
}

async function loadCafeAmenities(cafes: Cafe[]): Promise<Map<string, AmenityCatalog[]>> {
  const allAmenityIds = Array.from(new Set(cafes.flatMap((cafe) => cafe.amenityIds || [])));
  const amenities =
    allAmenityIds.length > 0
      ? await AppDataSource.getRepository(AmenityCatalog).findBy({ id: In(allAmenityIds) })
      : [];
  const amenityMap = new Map(amenities.map((amenity) => [amenity.id, amenity]));

  return new Map(
    cafes.map((cafe) => [
      cafe.id,
      (cafe.amenityIds || [])
        .map((id) => amenityMap.get(id))
        .filter((amenity): amenity is AmenityCatalog => !!amenity)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    ]),
  );
}

async function loadCafeActivePromotions(
  cafeIds: string[],
): Promise<Map<string, ActivePromotionSummary[]>> {
  if (cafeIds.length === 0) return new Map();

  const rows = await AppDataSource.query<
    Array<{
      cafeId: string;
      code: string;
      description: string | null;
      discountType: DiscountType;
      discountValue: string;
      maxDiscountAmount: string | null;
      minOrderAmount: string | null;
      applicableTo: PromoApplicableTo;
      expiresAt: Date | null;
      startsAt: Date;
      usesCount: number;
      maxUses: number | null;
      isActive: boolean;
      showOnCafePage: boolean;
    }>
  >(
    `SELECT
       p.cafe_id AS "cafeId",
       p.code,
       p.description,
       p.discount_type AS "discountType",
       p.discount_value AS "discountValue",
       p.max_discount_amount AS "maxDiscountAmount",
       p.min_order_amount AS "minOrderAmount",
       p.applicable_to AS "applicableTo",
       p.expires_at AS "expiresAt",
       p.starts_at AS "startsAt",
       p.uses_count AS "usesCount",
       p.max_uses AS "maxUses",
       p.is_active AS "isActive",
       p.show_on_cafe_page AS "showOnCafePage"
     FROM promotions p
     WHERE p.cafe_id = ANY($1::uuid[])
       AND p.is_active = TRUE
       AND p.show_on_cafe_page = TRUE
       AND p.starts_at <= NOW()
       AND (p.expires_at IS NULL OR p.expires_at > NOW())
       AND (p.max_uses IS NULL OR p.uses_count < p.max_uses)
     ORDER BY p.created_at DESC`,
    [cafeIds],
  );

  const grouped = new Map<string, ActivePromotionSummary[]>();
  for (const row of rows) {
    if (!grouped.has(row.cafeId)) grouped.set(row.cafeId, []);
    grouped.get(row.cafeId)!.push({
      code: row.code,
      description: row.description,
      discount_type: row.discountType,
      discount_value: toNumber(row.discountValue),
      max_discount_amount: row.maxDiscountAmount ? toNumber(row.maxDiscountAmount) : null,
      min_order_amount: row.minOrderAmount ? toNumber(row.minOrderAmount) : null,
      applicable_to: row.applicableTo,
      expires_at: row.expiresAt,
    });
  }

  return grouped;
}

/**
 * Tên doanh nghiệp của từng chủ cơ sở, tra theo lô.
 *
 * Màn quản trị trước đây chỉ có `providerId` nên hiển thị tám ký tự đầu của
 * UUID — vô nghĩa với người đọc, và không gom được các chi nhánh cùng một chủ.
 *
 * Chỉ lấy tên doanh nghiệp. Các trường còn lại của hồ sơ provider — giấy tờ
 * KYC, lý do từ chối, trạng thái duyệt — không có việc gì ở một danh sách cơ
 * sở, và bảng này còn phục vụ cả người dùng chưa đăng nhập.
 */
async function loadProviderNames(providerIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(providerIds.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const profiles = await AppDataSource.getRepository(ProviderProfile).find({
    where: { userId: In(unique) },
    select: ['userId', 'businessName'],
  });

  return new Map(profiles.map((profile) => [profile.userId, profile.businessName]));
}

async function hydrateCafeBrowsePayload(
  cafes: Cafe[],
  metricsMap?: Map<string, CafeBrowseMetrics>,
): Promise<CafeBrowseItem[]> {
  if (cafes.length === 0) return [];

  const [trackTypeMap, amenityMap, promoMap, fallbackMetrics, providerNameMap] = await Promise.all([
    loadCafeTrackTypes(cafes),
    loadCafeAmenities(cafes),
    loadCafeActivePromotions(cafes.map((cafe) => cafe.id)),
    metricsMap ? Promise.resolve(metricsMap) : loadCafeBrowseMetrics(cafes.map((cafe) => cafe.id)),
    loadProviderNames(cafes.map((cafe) => cafe.providerId)),
  ]);

  return cafes.map((cafe) => {
    const metrics = fallbackMetrics.get(cafe.id) ?? { rating: 0, reviewsCount: 0 };
    return {
      ...cafe,
      trackTypes: trackTypeMap.get(cafe.id) ?? [],
      amenities: amenityMap.get(cafe.id) ?? [],
      rating: metrics.rating,
      reviewsCount: metrics.reviewsCount,
      minPrice: toNumber(cafe.slotFeeRate),
      providerName: providerNameMap.get(cafe.providerId) ?? null,
      activePromotions: promoMap.get(cafe.id) ?? [],
    };
  });
}

function applyBrowseFilters(
  qb: SelectQueryBuilder<Cafe>,
  options: ListOptions,
  trackTypeId?: string,
) {
  const {
    query,
    slug,
    district,
    city,
    price_min,
    price_max,
    amenities,
    vehicle_type,
    popular_filters,
  } = options;

  const normalizedQuery = normalizeSearchTerm(query);
  if (normalizedQuery) {
    qb.andWhere(
      `(cafe.name ILIKE :search OR cafe.address ILIKE :search OR cafe.district ILIKE :search OR cafe.city ILIKE :search OR cafe.description ILIKE :search)`,
      { search: `%${normalizedQuery}%` },
    );
  }

  if (slug) qb.andWhere('cafe.slug = :slug', { slug });
  if (district) qb.andWhere('cafe.district = :district', { district });
  // So khớp CHỨA chứ không bằng tuyệt đối.
  //
  // Tên tỉnh thành trong dữ liệu không thống nhất tiền tố: có bản ghi lưu
  // 'TP. Hồ Chí Minh', có bản ghi 'Thành phố Hồ Chí Minh'. Ô chọn ở giao diện
  // gửi lên tên trần 'Hồ Chí Minh', nên so bằng dấu `=` thì không khớp bản ghi
  // nào và lọc theo thành phố luôn trả về rỗng.
  //
  // Cột này vốn đã được tìm bằng ILIKE ở câu tìm kiếm tự do ngay trên, nên đây
  // là cách cư xử nhất quán chứ không phải ngoại lệ.
  if (city) qb.andWhere('cafe.city ILIKE :city', { city: `%${city}%` });
  // `cafes.track_types` là mảng uuid. Bộ lọc cho phép gửi mã (`DRIFT`) để đường
  // dẫn chia sẻ đọc được, nên `listCafes` quy đổi sang uuid rồi truyền vào đây.
  if (trackTypeId) qb.andWhere(':trackType = ANY(cafe.track_types)', { trackType: trackTypeId });

  // Chế độ chơi là năng lực của chi nhánh, không phải cột có sẵn:
  //   RENTAL — còn xe cho thuê dùng được (loại RETIRED và xe đã xoá mềm)
  //   BYOC   — có nhận khách mang xe riêng
  // Một chi nhánh khai byoc_capacity nhưng chưa nhập xe nào thì không hiện ở bộ
  // lọc RENTAL — đúng thực tế, khách chọn "thuê xe" mà tới nơi không có xe là
  // hỏng cả buổi.
  if (options.play_mode === 'RENTAL') {
    qb.andWhere(
      `EXISTS (
         SELECT 1 FROM vehicles v
         WHERE v.cafe_id = cafe.id
           AND v.deleted_at IS NULL
           AND v.status <> :retired
       )`,
      { retired: VehicleStatus.RETIRED },
    );
  } else if (options.play_mode === 'BYOC') {
    qb.andWhere('cafe.byoc_capacity > 0');
  }
  if (price_min !== undefined)
    qb.andWhere('cafe.slot_fee_rate >= :priceMin', { priceMin: price_min });
  if (price_max !== undefined)
    qb.andWhere('cafe.slot_fee_rate <= :priceMax', { priceMax: price_max });

  const normalizedAmenities = normalizeFilterValues(amenities);
  normalizedAmenities.forEach((amenity, index) => {
    const like = `%${amenity}%`;
    qb.andWhere(
      new Brackets((br) => {
        br.where(
          `EXISTS (
             SELECT 1
             FROM unnest(cafe.amenity_ids) AS amenity_id
             JOIN amenity_catalog a ON a.id = amenity_id
             WHERE a.id::text = :amenityExact${index}
                OR a.title ILIKE :amenityLike${index}
           )`,
          {
            [`amenityExact${index}`]: amenity,
            [`amenityLike${index}`]: like,
          },
        );
      }),
    );
  });

  if (vehicle_type) {
    qb.andWhere(
      `EXISTS (
         SELECT 1
         FROM vehicle_catalogs vc
         LEFT JOIN track_types tt ON tt.id = ANY(vc.compatible_track_types)
         WHERE vc.cafe_id = cafe.id
           AND vc.deleted_at IS NULL
           AND (
             vc.name ILIKE :vehicleType
             OR tt.name ILIKE :vehicleType
             OR tt.code ILIKE :vehicleType
           )
       )`,
      { vehicleType: `%${vehicle_type}%` },
    );
  }

  const normalizedPopularFilters = normalizeFilterValues(popular_filters);
  normalizedPopularFilters.forEach((filter, index) => {
    const filterValue = `%${filter}%`;
    qb.andWhere(
      new Brackets((br) => {
        br.where(
          `EXISTS (
             SELECT 1
             FROM unnest(cafe.track_types) AS track_type_id
             JOIN track_types tt ON tt.id = track_type_id
             WHERE tt.id::text = :popularFilterExact${index}
                OR tt.code ILIKE :popularFilterLike${index}
                OR tt.name ILIKE :popularFilterLike${index}
           )`,
          {
            [`popularFilterExact${index}`]: filter,
            [`popularFilterLike${index}`]: filterValue,
          },
        ).orWhere(
          `EXISTS (
             SELECT 1
             FROM unnest(cafe.amenity_ids) AS amenity_id
             JOIN amenity_catalog a ON a.id = amenity_id
             WHERE a.id::text = :popularFilterExact${index}
                OR a.title ILIKE :popularFilterLike${index}
           )`,
          {
            [`popularFilterExact${index}`]: filter,
            [`popularFilterLike${index}`]: filterValue,
          },
        );
      }),
    );
  });
}

function sortBrowseItems(
  items: CafeBrowseItem[],
  sortBy: ListOptions['sort_by'],
): CafeBrowseItem[] {
  const sorted = [...items];
  switch (sortBy) {
    case 'price_asc':
      return sorted.sort(
        (a, b) => a.minPrice - b.minPrice || b.createdAt.getTime() - a.createdAt.getTime(),
      );
    case 'price_desc':
      return sorted.sort(
        (a, b) => b.minPrice - a.minPrice || b.createdAt.getTime() - a.createdAt.getTime(),
      );
    case 'rating':
      return sorted.sort(
        (a, b) =>
          b.rating - a.rating ||
          b.reviewsCount - a.reviewsCount ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
    case 'popularity':
    default:
      return sorted.sort(
        (a, b) =>
          b.reviewsCount - a.reviewsCount ||
          b.rating - a.rating ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }
}

export async function getCafeOrThrow(id: string): Promise<Cafe> {
  const cafe = await AppDataSource.getRepository(Cafe).findOne({
    where: { id } as FindOptionsWhere<Cafe>,
  });
  if (!cafe) throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  return cafe;
}

export async function getManagedCafeOrThrow(id: string, viewer: Viewer): Promise<Cafe> {
  const cafe = await getCafeOrThrow(id);
  if (viewer.role === UserRole.PROVIDER) {
    if (cafe.providerId === viewer.userId) return cafe;
    throw new AppError('Bạn không phải chủ sở hữu chi nhánh này', 403, 'FORBIDDEN');
  }
  if (viewer.role === UserRole.STAFF) {
    const isAssigned = await AppDataSource.query(
      `SELECT 1 FROM staff_cafe_assignments WHERE staff_id = $1 AND cafe_id = $2`,
      [viewer.userId, id],
    );
    if (isAssigned && isAssigned.length > 0) return cafe;
    throw new AppError('Nhân viên không thuộc chi nhánh này', 403, 'FORBIDDEN');
  }
  throw new AppError('Bạn không có quyền truy cập hoặc quản lý chi nhánh này', 403, 'FORBIDDEN');
}

export async function createCafe(
  providerId: string,
  body: CreateCafeBody,
): Promise<CafeBrowseItem> {
  await checkBranchQuota(providerId);

  const repo = AppDataSource.getRepository(Cafe);
  const cafe = new Cafe();
  cafe.providerId = providerId;
  cafe.name = body.name;
  cafe.slug = await makeUniqueSlug(body.name);
  cafe.description = body.description ?? null;
  cafe.phone = body.phone ?? null;
  cafe.status = CafeStatus.PENDING;
  cafe.coverImageUrl = body.cover_image_url ?? null;
  cafe.address = body.address;
  cafe.district = body.district;
  cafe.city = body.city;
  cafe.latitude = body.latitude ?? null;
  cafe.longitude = body.longitude ?? null;
  cafe.operatingHours = body.operating_hours;
  cafe.trackTypes = body.track_types;
  cafe.slotDurationMinutes = body.slot_duration_minutes;
  cafe.slotFeeRate = body.slot_fee_rate;
  cafe.maxConcurrentBookings = body.max_concurrent_bookings;
  cafe.minBookingNoticeMinutes = body.min_booking_notice_minutes;
  cafe.maxAdvanceBookingDays = body.max_advance_booking_days;
  cafe.byocCapacity = body.byoc_capacity;
  cafe.amenityIds = body.amenity_ids ?? [];
  cafe.rules = body.rules ?? [];

  const saved = await repo.save(cafe);
  return getCafeDetail(saved.id, { userId: providerId, role: UserRole.PROVIDER });
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Đổi giá trị lọc loại sân sang uuid. Nhận sẵn uuid thì trả về nguyên, nhận mã
 * (`DRIFT`) thì tra bảng `track_types`. Trả `null` khi mã không tồn tại.
 */
async function resolveTrackTypeId(value: string): Promise<string | null> {
  if (UUID_RE.test(value)) return value;
  const found = await AppDataSource.getRepository(TrackType).findOne({
    where: { code: value.toUpperCase() },
    select: ['id'],
  });
  return found?.id ?? null;
}

export async function listCafes(
  options: ListOptions,
): Promise<{ data: CafeBrowseItem[]; total: number }> {
  const { page, limit, scope, status, viewer } = options;
  const repo = AppDataSource.getRepository(Cafe);

  const qb = repo.createQueryBuilder('cafe').where('cafe.deleted_at IS NULL');

  if (scope === 'managed' && viewer?.role === UserRole.PROVIDER) {
    qb.andWhere('cafe.provider_id = :providerId', { providerId: viewer.userId });
  } else if (viewer?.role !== UserRole.ADMIN) {
    // Khách và người chưa đăng nhập chỉ thấy cơ sở đang hoạt động.
    //
    // ADMIN được loại khỏi ràng buộc này. Trước đây admin cũng bị ép về ACTIVE,
    // rồi bộ lọc bên dưới cộng thêm một điều kiện trạng thái nữa — hỏi cơ sở
    // chờ duyệt thành `status = 'ACTIVE' AND status = 'PENDING'`, luôn rỗng.
    // Hệ quả: màn duyệt cơ sở của admin không bao giờ có gì để duyệt.
    qb.andWhere('cafe.status = :active', { active: CafeStatus.ACTIVE });
  }

  if (status && (viewer?.role === UserRole.ADMIN || viewer?.role === UserRole.PROVIDER)) {
    qb.andWhere('cafe.status = :status', { status });
  }

  // Mã loại sân không tồn tại thì trả rỗng, không phải lỗi máy chủ: người dùng
  // gõ sai trên thanh địa chỉ vẫn phải thấy trang danh sách trống bình thường.
  let trackTypeId: string | undefined;
  if (options.track_type) {
    const resolved = await resolveTrackTypeId(options.track_type);
    if (!resolved) return { data: [], total: 0 };
    trackTypeId = resolved;
  }

  applyBrowseFilters(qb, options, trackTypeId);
  const data = await qb.getMany();

  // Lọc theo ngày TRƯỚC khi cắt trang, và lấy tổng từ tập đã lọc — lọc sau khi
  // cắt thì trang 1 còn 2 kết quả trong khi vẫn ghi "tìm thấy 4 nơi".
  const matching = options.date ? await filterCafesWithFreeSlot(data, options.date) : data;

  const hydrated = await hydrateCafeBrowsePayload(matching);
  const sortedHydrated = sortBrowseItems(hydrated, options.sort_by);
  const start = (page - 1) * limit;
  const end = start + limit;

  return { data: sortedHydrated.slice(start, end), total: matching.length };
}

/**
 * Giữ lại các chi nhánh còn ít nhất một slot đặt được trong ngày `dateIso`.
 *
 * Một truy vấn duy nhất lấy toàn bộ đơn đang giữ chỗ của mọi chi nhánh ứng
 * viên, rồi đối chiếu trong bộ nhớ — thay vì hỏi cơ sở dữ liệu cho từng chi
 * nhánh từng slot.
 */
async function filterCafesWithFreeSlot(cafes: Cafe[], dateIso: string): Promise<Cafe[]> {
  if (cafes.length === 0) return cafes;

  // Chuỗi 'YYYY-MM-DD' được đọc theo giờ Việt Nam, không theo giờ máy chủ.
  const dayMidnightUtcMs = Date.parse(`${dateIso}T00:00:00+07:00`);
  if (Number.isNaN(dayMidnightUtcMs)) return cafes;

  const now = new Date();
  // Quét rộng sang ngày kế tiếp vì quán bán qua nửa đêm thì slot cuối của ngày
  // hôm trước vẫn còn chiếm chỗ sang ngày đang xét.
  const rangeStart = new Date(dayMidnightUtcMs - DAY_MS);
  const rangeEnd = new Date(dayMidnightUtcMs + 2 * DAY_MS);

  const bookings = await AppDataSource.getRepository(Booking).find({
    where: {
      cafeId: In(cafes.map((cafe) => cafe.id)),
      status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
      slotStart: LessThan(rangeEnd),
      slotEnd: MoreThan(rangeStart),
    },
    select: ['cafeId', 'slotStart', 'slotEnd'],
  });

  const bookingsByCafe = new Map<string, OccupyingBooking[]>();
  for (const booking of bookings) {
    const list = bookingsByCafe.get(booking.cafeId);
    const entry = {
      cafeId: booking.cafeId,
      slotStart: booking.slotStart,
      slotEnd: booking.slotEnd,
    };
    if (list) list.push(entry);
    else bookingsByCafe.set(booking.cafeId, [entry]);
  }

  return cafes.filter((cafe) =>
    hasFreeSlotOnDay(
      {
        cafeId: cafe.id,
        operatingHours: cafe.operatingHours,
        slotDurationMinutes: cafe.slotDurationMinutes,
        maxConcurrentBookings: cafe.maxConcurrentBookings,
        minBookingNoticeMinutes: cafe.minBookingNoticeMinutes,
        maxAdvanceBookingDays: cafe.maxAdvanceBookingDays,
      },
      dayMidnightUtcMs,
      now,
      bookingsByCafe.get(cafe.id) ?? [],
    ),
  );
}

/**
 * Thông tin doanh nghiệp của chi nhánh, phần được phép công khai.
 *
 * ⚠️ DANH SÁCH TRẮNG, không phải danh sách đen. `provider_profiles` chứa cả
 * `kyc_documents` — ảnh căn cước và giấy phép kinh doanh đã tải lên — cùng
 * `rejection_reason`, `suspended_reason`, `registration_status`. Trả nguyên bản
 * ghi ra là phát tán giấy tờ tuỳ thân của chủ quán lên một trang ai cũng xem
 * được. Vì thế hàm dưới liệt kê từng trường một; thêm cột mới vào bảng sẽ KHÔNG
 * tự động lọt ra ngoài.
 *
 * Các trường ở đây là danh tính doanh nghiệp theo hồ sơ công khai — đúng nhóm
 * thông tin mà nghị định thương mại điện tử yêu cầu sàn phải hiển thị về người
 * bán: tên, địa chỉ, mã số thuế, đầu mối liên hệ.
 */
export interface CafeProviderBusiness {
  business_name: string;
  /** Tên pháp lý theo dữ liệu Cục Thuế, có thể khác tên thương hiệu. */
  business_legal_name: string | null;
  tax_code: string | null;
  /** Địa chỉ đăng ký kinh doanh — khác địa chỉ chi nhánh. */
  business_address: string | null;
  business_email: string | null;
  business_type: string | null;
  /** Mã số thuế đã đối chiếu được với Cục Thuế hay chưa. */
  tax_verified: boolean;
}

export type CafeDetailItem = CafeBrowseItem & {
  provider_business: CafeProviderBusiness | null;
};

async function loadProviderBusiness(providerId: string): Promise<CafeProviderBusiness | null> {
  const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
    where: { userId: providerId },
    // Chỉ đọc đúng những cột sẽ trả ra. Giấy tờ KYC không được nạp vào bộ nhớ
    // ngay từ đầu, nên không có đường nào lọt ra do sơ ý ở tầng trên.
    select: [
      'businessName',
      'businessLegalName',
      'taxCode',
      'businessAddress',
      'businessEmail',
      'businessType',
      'taxVerifiedAt',
    ],
  });
  if (!profile) return null;

  return {
    business_name: profile.businessName,
    business_legal_name: profile.businessLegalName,
    tax_code: profile.taxCode,
    business_address: profile.businessAddress,
    business_email: profile.businessEmail,
    business_type: profile.businessType,
    tax_verified: profile.taxVerifiedAt !== null,
  };
}

export async function getCafeDetail(id: string, viewer?: Viewer): Promise<CafeDetailItem> {
  const cafe = await getCafeOrThrow(id);
  const canViewInactive =
    viewer?.role === UserRole.ADMIN ||
    (viewer?.role === UserRole.PROVIDER && viewer.userId === cafe.providerId);

  if (cafe.status !== CafeStatus.ACTIVE && !canViewInactive) {
    throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  }
  const [result, providerBusiness] = await Promise.all([
    hydrateCafeBrowsePayload([cafe]),
    loadProviderBusiness(cafe.providerId),
  ]);
  return { ...result[0]!, provider_business: providerBusiness };
}

export async function updateCafe(
  id: string,
  providerId: string,
  body: UpdateCafeBody,
): Promise<CafeBrowseItem> {
  const cafe = await getCafeOrThrow(id);
  assertCafeOwner(cafe, providerId);

  if (body.name !== undefined) cafe.name = body.name;
  if (body.description !== undefined) cafe.description = body.description;
  if (body.phone !== undefined) cafe.phone = body.phone;
  if (body.cover_image_url !== undefined) cafe.coverImageUrl = body.cover_image_url;
  if (body.address !== undefined) cafe.address = body.address;
  if (body.district !== undefined) cafe.district = body.district;
  if (body.city !== undefined) cafe.city = body.city;
  if (body.latitude !== undefined) cafe.latitude = body.latitude;
  if (body.longitude !== undefined) cafe.longitude = body.longitude;
  if (body.operating_hours !== undefined) cafe.operatingHours = body.operating_hours;
  if (body.track_types !== undefined) cafe.trackTypes = body.track_types;
  if (body.slot_duration_minutes !== undefined) {
    cafe.slotDurationMinutes = body.slot_duration_minutes;
  }
  if (body.slot_fee_rate !== undefined) cafe.slotFeeRate = body.slot_fee_rate;
  if (body.max_concurrent_bookings !== undefined) {
    cafe.maxConcurrentBookings = body.max_concurrent_bookings;
  }
  if (body.min_booking_notice_minutes !== undefined) {
    cafe.minBookingNoticeMinutes = body.min_booking_notice_minutes;
  }
  if (body.max_advance_booking_days !== undefined) {
    cafe.maxAdvanceBookingDays = body.max_advance_booking_days;
  }
  if (body.byoc_capacity !== undefined) cafe.byocCapacity = body.byoc_capacity;
  if (body.amenity_ids !== undefined) cafe.amenityIds = body.amenity_ids;
  if (body.rules !== undefined) cafe.rules = body.rules;

  await AppDataSource.getRepository(Cafe).save(cafe);
  return getCafeDetail(id, { userId: providerId, role: UserRole.PROVIDER });
}

export async function updateCafeStatus(
  id: string,
  status: CafeStatus,
  viewer: Viewer,
): Promise<Cafe> {
  const cafe = await getCafeOrThrow(id);

  if (viewer.role === UserRole.PROVIDER) {
    assertCafeOwner(cafe, viewer.userId);
    if (cafe.status === CafeStatus.PENDING || status === CafeStatus.PENDING) {
      throw new AppError(
        'Provider không thể tự duyệt hoặc chuyển cafe về trạng thái chờ duyệt',
        403,
        'FORBIDDEN',
      );
    }
  } else if (viewer.role !== UserRole.ADMIN) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  cafe.status = status;
  return AppDataSource.getRepository(Cafe).save(cafe);
}
