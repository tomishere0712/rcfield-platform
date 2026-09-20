import { api } from '@/shared/lib/api';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import type { Cafe, CafeSearchParams, PublicPackage, Review, ActivePromotion } from '../types/explore.types';

export const CAFE_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=600&auto=format&fit=crop';

function formatTrackType(trackType: any): string {
  if (trackType && typeof trackType === 'object' && 'name' in trackType) {
    return trackType.name;
  }
  if (typeof trackType === 'string') {
    return trackType
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return '';
}

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getCafes(params: CafeSearchParams = {}): Promise<Cafe[]> {
  try {
    const apiParams: any = {
      page: 1,
      limit: 100,
    };
    if (params.city && params.city !== 'all') {
      apiParams.city = params.city;
    }
    if (params.trackType && params.trackType !== 'all') {
      apiParams.track_type = params.trackType;
    }

    const response = await api.get('/cafes', { params: apiParams });
    const cafesData = response.data?.data || [];

    return cafesData.map((cafe: any): Cafe => {
      const slotFeeRate = toNumber(cafe.slotFeeRate);
      const lat = toNumber(cafe.latitude);
      const lng = toNumber(cafe.longitude);

      return {
        id: cafe.id,
        providerId: cafe.providerId,
        name: cafe.name,
        slug: cafe.slug,
        rating: toNumber(cafe.rating) || 0,
        reviewsCount: toNumber(cafe.reviewsCount) || 0,
        phone: cafe.phone,
        status: cafe.status,
        address: cafe.address,
        district: cafe.district,
        city: cafe.city,
        image: cafe.coverImageUrl || CAFE_PLACEHOLDER_IMAGE,
        images: cafe.coverImageUrl ? [cafe.coverImageUrl] : [CAFE_PLACEHOLDER_IMAGE],
        priceRange: slotFeeRate > 0 ? `${slotFeeRate.toLocaleString('vi-VN')} đ/slot` : 'Chưa cập nhật',
        slotDurationMinutes: cafe.slotDurationMinutes,
        slotFeeRate,
        maxConcurrentBookings: cafe.maxConcurrentBookings,
        minBookingNoticeMinutes: cafe.minBookingNoticeMinutes,
        maxAdvanceBookingDays: cafe.maxAdvanceBookingDays,
        byocCapacity: cafe.byocCapacity,
        trackTypes: Array.isArray(cafe.trackTypes) ? cafe.trackTypes.map(formatTrackType) : [],
        trackTypeIds: Array.isArray(cafe.trackTypes) ? cafe.trackTypes.map((t: any) => t.id) : [],
        features: [],
        description: cafe.description || 'Cơ sở chưa cập nhật mô tả.',
        coordinates: { x: 50, y: 50 },
        latitude: lat || null,
        longitude: lng || null,
        availableVehicles: [],
        operatingHours: cafe.operatingHours,
        amenities: Array.isArray(cafe.amenities)
          ? cafe.amenities.map((a: any) => ({ id: a.id, title: a.title }))
          : [],
        rules: Array.isArray(cafe.rules) ? cafe.rules : [],
      };
    });
  } catch (error) {
    console.error('[ExploreAPI] Error fetching cafes:', error);
    return [];
  }
}

export async function getCafeById(cafeId: string): Promise<Cafe | null> {
  try {
    const response = await api.get(`/cafes/${cafeId}`);
    const cafe = response.data?.data;
    if (!cafe) return null;

    const slotFeeRate = toNumber(cafe.slotFeeRate);
    const lat = toNumber(cafe.latitude);
    const lng = toNumber(cafe.longitude);

    return {
      id: cafe.id,
      providerId: cafe.providerId,
      name: cafe.name,
      slug: cafe.slug,
      rating: toNumber(cafe.rating) || 0,
      reviewsCount: toNumber(cafe.reviewsCount) || 0,
      phone: cafe.phone,
      status: cafe.status,
      address: cafe.address,
      district: cafe.district,
      city: cafe.city,
      image: cafe.coverImageUrl || CAFE_PLACEHOLDER_IMAGE,
      images: cafe.coverImageUrl ? [cafe.coverImageUrl] : [CAFE_PLACEHOLDER_IMAGE],
      priceRange: slotFeeRate > 0 ? `${slotFeeRate.toLocaleString('vi-VN')} đ/slot` : 'Chưa cập nhật',
      slotDurationMinutes: cafe.slotDurationMinutes,
      slotFeeRate,
      maxConcurrentBookings: cafe.maxConcurrentBookings,
        minBookingNoticeMinutes: cafe.minBookingNoticeMinutes,
        maxAdvanceBookingDays: cafe.maxAdvanceBookingDays,
      byocCapacity: cafe.byocCapacity,
      trackTypes: Array.isArray(cafe.trackTypes) ? cafe.trackTypes.map(formatTrackType) : [],
      trackTypeIds: Array.isArray(cafe.trackTypes) ? cafe.trackTypes.map((t: any) => t.id) : [],
      features: [],
      description: cafe.description || 'Cơ sở chưa cập nhật mô tả.',
      coordinates: { x: 50, y: 50 },
      latitude: lat || null,
      longitude: lng || null,
      availableVehicles: [],
      operatingHours: cafe.operatingHours,
      amenities: Array.isArray(cafe.amenities)
        ? cafe.amenities.map((a: any) => ({ id: a.id, title: a.title }))
        : [],
      rules: Array.isArray(cafe.rules) ? cafe.rules : [],
    };
  } catch (error) {
    console.error('[ExploreAPI] Error fetching cafe by id:', error);
    return null;
  }
}

export async function listCafeImages(cafeId: string): Promise<string[]> {
  try {
    const response = await api.get(`/cafes/${cafeId}/images`);
    const imagesData = response.data?.data || [];
    return imagesData.map((img: any) => img.url).filter(Boolean);
  } catch (error) {
    console.error('[ExploreAPI] Error fetching cafe images:', error);
    return [];
  }
}

export interface CafeReviewsResponse {
  data: Review[];
  total: number;
  aggregate: {
    reviewCount: number;
    overallAvg: number | null;
    vehicleAvg: number | null;
    staffAvg: number | null;
    facilityAvg: number | null;
  } | null;
}

export async function listCafeReviews(cafeId: string): Promise<CafeReviewsResponse> {
  try {
    const response = await api.get(`/cafes/${cafeId}/reviews`);
    const reviewsData = response.data?.data || [];
    const aggregate = response.data?.aggregate || null;

    const reviews = reviewsData.map((rev: any): Review => ({
      id: rev.id,
      rating: toNumber(rev.overallScore),
      comment: rev.note || '',
      createdAt: rev.createdAt || '',
      customerId: rev.customerId,
      user: {
        fullName: rev.fullName || rev.customerName || 'Khách hàng',
        avatarUrl: null,
      },
      ownerResponse: null,
      vehicleScore: rev.vehicleScore ? toNumber(rev.vehicleScore) : null,
      staffScore: rev.staffScore ? toNumber(rev.staffScore) : null,
      facilityScore: rev.facilityScore ? toNumber(rev.facilityScore) : null,
    }));

    return {
      data: reviews,
      total: response.data?.total || reviews.length,
      aggregate: aggregate ? {
        reviewCount: toNumber(aggregate.reviewCount),
        overallAvg: aggregate.overallAvg ? toNumber(aggregate.overallAvg) : null,
        vehicleAvg: aggregate.vehicleAvg ? toNumber(aggregate.vehicleAvg) : null,
        staffAvg: aggregate.staffAvg ? toNumber(aggregate.staffAvg) : null,
        facilityAvg: aggregate.facilityAvg ? toNumber(aggregate.facilityAvg) : null,
      } : null,
    };
  } catch (error) {
    console.error('[ExploreAPI] Error fetching cafe reviews:', error);
    return { data: [], total: 0, aggregate: null };
  }
}

export async function listPublicPackages(cafeId: string): Promise<PublicPackage[]> {
  try {
    const response = await api.get(`/cafes/${cafeId}/packages/public`);
    const pkgs = response.data?.data || [];
    return pkgs.map((pkg: any): PublicPackage => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description || null,
      price: toNumber(pkg.price),
      slot_count: toNumber(pkg.slotCount || pkg.slot_count),
      valid_days: toNumber(pkg.validDays || pkg.valid_days),
      applicable_play_modes: Array.isArray(pkg.applicablePlayModes) ? pkg.applicablePlayModes : [],
      benefits: Array.isArray(pkg.benefits) ? pkg.benefits : [],
      is_popular: !!(pkg.isPopular || pkg.is_popular),
    }));
  } catch (error) {
    console.error('[ExploreAPI] Error fetching public packages:', error);
    return [];
  }
}

export async function purchasePackage(
  cafeId: string,
  packageId: string,
  returnUrl?: string,
): Promise<{ payment_url: string; confirmed: boolean }> {
  const response = await api.post(`/cafes/${cafeId}/packages/${packageId}/purchase`, {
    return_url: returnUrl ?? getVnpayReturnUrl(),
  });
  return response.data?.data;
}

export async function listActivePromotions(cafeId: string): Promise<ActivePromotion[]> {
  try {
    const response = await api.get(`/cafes/${cafeId}/promotions/active`);
    return response.data?.data || [];
  } catch (error) {
    console.error('[ExploreAPI] Error fetching active promotions:', error);
    return [];
  }
}

export async function listFeaturedPopups(): Promise<any[]> {
  try {
    const response = await api.get('/explore/featured-popups');
    return response.data?.data || [];
  } catch (error) {
    console.error('[ExploreAPI] Error fetching featured popups:', error);
    return [];
  }
}

export async function getRecentReviews(limit = 5): Promise<Review[]> {
  try {
    const response = await api.get('/reviews/recent', { params: { limit } });
    const reviewsData = response.data?.data || [];
    return reviewsData.map((rev: any): Review => ({
      id: rev.id,
      rating: toNumber(rev.overallScore || rev.rating),
      comment: rev.note || rev.comment || '',
      createdAt: rev.createdAt,
      customerId: rev.customerId,
      user: {
        fullName: rev.fullName || rev.customerName || 'Người chơi',
        avatarUrl: null,
      },
      cafeName: rev.cafeName || '',
    }));
  } catch (error) {
    console.error('[ExploreAPI] Error fetching recent reviews:', error);
    return [];
  }
}


