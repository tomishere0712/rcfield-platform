import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { FeaturedPopup } from '../models/featured-popup.entity';
import { Contest } from '../models/contest.entity';
import { mapContestPayload } from './contest/payload';
import {
  AppError,
  FeaturedPopupAudienceScope,
  FeaturedPopupPlacement,
  FeaturedPopupReviewStatus,
  UserRole,
} from '../types';

type Viewer = {
  userId: string;
  role: UserRole;
};

type FeaturedPopupBody = {
  title?: string;
  subtitle?: string | null;
  image_url?: string | null;
  cta_label?: string;
  cta_url?: string | null;
  contest_id?: string | null;
  placement?: FeaturedPopupPlacement;
  audience_scope?: FeaturedPopupAudienceScope;
  starts_at?: Date;
  ends_at?: Date;
  is_active?: boolean;
  priority?: number;
};

type ListQuery = {
  placement?: FeaturedPopupPlacement;
  is_active?: boolean;
};

function mapFeaturedPopup(popup: FeaturedPopup) {
  return {
    id: popup.id,
    title: popup.title,
    subtitle: popup.subtitle,
    image_url: popup.imageUrl,
    cta_label: popup.ctaLabel,
    cta_url: popup.ctaUrl,
    contest_id: popup.contestId,
    placement: popup.placement,
    audience_scope: popup.audienceScope,
    starts_at: popup.startsAt,
    ends_at: popup.endsAt,
    is_active: popup.isActive,
    review_status: popup.reviewStatus,
    review_notes: popup.reviewNotes,
    contest_fee_order_id: popup.contestFeeOrderId,
    priority: popup.priority,
    created_by: popup.createdBy,
    updated_by: popup.updatedBy,
    created_at: popup.createdAt,
    updated_at: popup.updatedAt,
  };
}

async function assertContestExists(contestId?: string | null) {
  if (!contestId) return;
  const contest = await AppDataSource.getRepository(Contest).findOne({ where: { id: contestId } });
  if (!contest) throw new AppError('Contest không tồn tại', 404, 'CONTEST_NOT_FOUND');
}

export async function listFeaturedPopups(query?: ListQuery) {
  const repo = AppDataSource.getRepository(FeaturedPopup);
  const qb = repo
    .createQueryBuilder('popup')
    .orderBy('popup.priority', 'DESC')
    .addOrderBy('popup.starts_at', 'DESC');

  if (query?.placement) qb.andWhere('popup.placement = :placement', { placement: query.placement });
  if (query?.is_active !== undefined) {
    qb.andWhere('popup.is_active = :isActive', { isActive: query.is_active });
  }

  const rows = await qb.getMany();
  return rows.map(mapFeaturedPopup);
}

export async function createFeaturedPopup(viewer: Viewer, body: FeaturedPopupBody) {
  await assertContestExists(body.contest_id ?? null);
  const repo = AppDataSource.getRepository(FeaturedPopup);
  const created = await repo.save(
    repo.create({
      title: body.title!,
      subtitle: body.subtitle ?? null,
      imageUrl: body.image_url ?? null,
      ctaLabel: body.cta_label!,
      ctaUrl: body.cta_url ?? null,
      contestId: body.contest_id ?? null,
      placement: body.placement ?? FeaturedPopupPlacement.EXPLORE,
      audienceScope: body.audience_scope ?? FeaturedPopupAudienceScope.ALL,
      startsAt: body.starts_at!,
      endsAt: body.ends_at!,
      isActive: body.is_active ?? true,
      priority: body.priority ?? 100,
      createdBy: viewer.userId,
      updatedBy: viewer.userId,
    }),
  );
  return mapFeaturedPopup(created);
}

export async function updateFeaturedPopup(
  popupId: string,
  viewer: Viewer,
  body: FeaturedPopupBody,
) {
  const repo = AppDataSource.getRepository(FeaturedPopup);
  const popup = await repo.findOne({ where: { id: popupId } });
  if (!popup) throw new AppError('Featured popup không tồn tại', 404, 'FEATURED_POPUP_NOT_FOUND');

  await assertContestExists(body.contest_id ?? popup.contestId);

  if (body.title !== undefined) popup.title = body.title;
  if (body.subtitle !== undefined) popup.subtitle = body.subtitle ?? null;
  if (body.image_url !== undefined) popup.imageUrl = body.image_url ?? null;
  if (body.cta_label !== undefined) popup.ctaLabel = body.cta_label;
  if (body.cta_url !== undefined) popup.ctaUrl = body.cta_url ?? null;
  if (body.contest_id !== undefined) popup.contestId = body.contest_id ?? null;
  if (body.placement !== undefined) popup.placement = body.placement;
  if (body.audience_scope !== undefined) popup.audienceScope = body.audience_scope;
  if (body.starts_at !== undefined) popup.startsAt = body.starts_at;
  if (body.ends_at !== undefined) popup.endsAt = body.ends_at;
  if (body.is_active !== undefined) popup.isActive = body.is_active;
  if (body.priority !== undefined) popup.priority = body.priority;
  popup.updatedBy = viewer.userId;

  const saved = await repo.save(popup);
  return mapFeaturedPopup(saved);
}

export async function getActiveFeaturedPopup(placement = FeaturedPopupPlacement.EXPLORE) {
  const now = new Date();
  const popup = await AppDataSource.getRepository(FeaturedPopup)
    .createQueryBuilder('popup')
    .where('popup.placement = :placement', { placement })
    .andWhere('popup.is_active = TRUE')
    // Suất provider trả phí chỉ lên trang khi admin đã duyệt nội dung. Lọc cả
    // hai điều kiện chứ không chỉ is_active: bật nhầm cờ hiển thị không được
    // phép đẩy nội dung chưa duyệt ra trước khách.
    .andWhere('popup.review_status = :approved', {
      approved: FeaturedPopupReviewStatus.APPROVED,
    })
    .andWhere('popup.starts_at <= :now', { now })
    .andWhere('popup.ends_at >= :now', { now })
    .orderBy('popup.priority', 'DESC')
    .addOrderBy('popup.starts_at', 'DESC')
    .getOne();

  return popup ? mapFeaturedPopup(popup) : null;
}

/**
 * Mọi suất quảng bá đang chạy của một vị trí, kèm dữ liệu giải đấu liên kết.
 *
 * Dùng cho dải carousel ở trang khám phá. Khác `getActiveFeaturedPopup` ở chỗ
 * trả về danh sách thay vì một suất, nhưng dùng **đúng bộ điều kiện lọc** — đặc
 * biệt là `review_status = APPROVED`, để nội dung provider trả tiền vẫn phải qua
 * kiểm duyệt mới ra trước mặt khách.
 *
 * Giải không mua gói quảng bá sẽ không có hàng nào trong `featured_popups`, nên
 * mặc nhiên không xuất hiện — không cần lọc thêm ở tầng nào khác.
 */
export async function listActiveFeaturedPopups(placement = FeaturedPopupPlacement.EXPLORE) {
  const now = new Date();
  const popups = await AppDataSource.getRepository(FeaturedPopup)
    .createQueryBuilder('popup')
    .where('popup.placement = :placement', { placement })
    .andWhere('popup.is_active = TRUE')
    .andWhere('popup.review_status = :approved', {
      approved: FeaturedPopupReviewStatus.APPROVED,
    })
    .andWhere('popup.starts_at <= :now', { now })
    .andWhere('popup.ends_at >= :now', { now })
    .orderBy('popup.priority', 'DESC')
    .addOrderBy('popup.starts_at', 'DESC')
    .getMany();

  if (popups.length === 0) return [];

  const contestIds = popups
    .map((popup) => popup.contestId)
    .filter((id): id is string => Boolean(id));

  const contests = contestIds.length
    ? await AppDataSource.getRepository(Contest).findBy({ id: In(contestIds) })
    : [];
  const mappedContests = contests.length ? await mapContestPayload(contests) : [];
  const contestMap = new Map(mappedContests.map((contest) => [contest.id, contest]));

  return popups.map((popup) => ({
    ...mapFeaturedPopup(popup),
    contest: popup.contestId ? (contestMap.get(popup.contestId) ?? null) : null,
  }));
}

/**
 * Suất quảng bá do provider trả phí, đang chờ admin xem nội dung.
 *
 * Tách riêng khỏi `listFeaturedPopups` để admin có một hàng đợi rõ ràng thay vì
 * phải lọc thủ công giữa các suất tự tạo.
 */
export async function listPendingFeaturedPopups() {
  const rows = await AppDataSource.getRepository(FeaturedPopup).find({
    where: { reviewStatus: FeaturedPopupReviewStatus.PENDING },
    order: { createdAt: 'ASC' },
  });
  return rows.map(mapFeaturedPopup);
}

export async function reviewFeaturedPopup(
  popupId: string,
  viewer: Viewer,
  body: { approve: boolean; notes?: string },
) {
  const repo = AppDataSource.getRepository(FeaturedPopup);
  const popup = await repo.findOne({ where: { id: popupId } });
  if (!popup) throw new AppError('Suất quảng bá không tồn tại', 404, 'FEATURED_POPUP_NOT_FOUND');
  if (popup.reviewStatus !== FeaturedPopupReviewStatus.PENDING) {
    throw new AppError('Suất quảng bá này đã được xử lý', 409, 'FEATURED_POPUP_ALREADY_REVIEWED');
  }

  popup.reviewStatus = body.approve
    ? FeaturedPopupReviewStatus.APPROVED
    : FeaturedPopupReviewStatus.REJECTED;
  popup.isActive = body.approve;
  popup.reviewNotes = body.notes ?? null;
  popup.updatedBy = viewer.userId;

  /*
    Đồng hồ hiển thị chạy từ lúc DUYỆT, không phải từ lúc thu tiền.

    `createPendingFeaturedSlot` đặt `startsAt = new Date()` ngay khi tiền về, mà
    suất quảng bá thì chỉ lên trang khi `review_status = APPROVED`. Nên mỗi ngày
    admin chưa duyệt là một ngày chủ sân trả tiền mà không được hiện: mua 7 ngày,
    duyệt vào ngày thứ ba, còn lại bốn. Duyệt sau ngày thứ bảy thì suất đó đã hết
    hạn trước cả khi được bật — trả đủ tiền, hiện ra 0 ngày.

    Giữ nguyên ĐỘ DÀI đã mua rồi neo lại vào hiện tại. Lấy độ dài từ chính cửa sổ
    cũ thay vì đọc lại đơn hàng: hai giá trị đó luôn bằng nhau, mà đọc lại thì
    thêm một truy vấn và thêm một chỗ có thể lệch.
  */
  if (body.approve) {
    const thoiLuongMs = popup.endsAt.getTime() - popup.startsAt.getTime();
    const now = new Date();
    popup.startsAt = now;
    popup.endsAt = new Date(now.getTime() + thoiLuongMs);
  }

  const saved = await repo.save(popup);
  return mapFeaturedPopup(saved);
}
