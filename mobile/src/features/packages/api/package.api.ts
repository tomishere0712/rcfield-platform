import { api } from '@/shared/lib/api';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';

export type CustomerPackageStatus = 'ACTIVE' | 'PENDING_PAYMENT' | 'EXHAUSTED' | 'EXPIRED';

export interface MyPackageResponse {
  id: string;
  package_id: string;
  cafe_id: string;
  cafe_name: string;
  package_name: string;
  applicable_play_modes: ('RENTAL' | 'BYOC')[];
  slots_total: number;
  slots_remaining: number;
  expires_at: string;
  status: CustomerPackageStatus;
  purchased_price: number;
  created_at: string;
}

export interface PublicPackage {
  id: string;
  cafeId: string;
  code: string;
  name: string;
  description: string | null;
  slotCount: number;
  price: string;
  benefits: string[];
  applicablePlayModes: ('RENTAL' | 'BYOC')[];
  validDays: number;
  isPopular: boolean;
  isActive: boolean;
}

export interface PurchasePackageResult {
  customer_package_id: string;
  payment_url: string;
  txn_ref: string;
  amount: number;
  expires_at: string;
}

export interface PackageUsageEntry {
  booking_id: string;
  slot_start: string;
  slot_end: string;
  slots_used: number;
  cafe_name: string;
  booking_status: string;
}

// 1. Lấy danh sách gói đã mua của tôi
export async function getMyPackages(status?: CustomerPackageStatus): Promise<MyPackageResponse[]> {
  try {
    const response = await api.get('/customers/me/packages', {
      params: { status },
    });
    return response.data?.data || [];
  } catch (error) {
    console.error('[PackageAPI] Error fetching customer packages:', error);
    return [];
  }
}

// 2. Lấy danh sách gói bán công khai của cơ sở
export async function getCafePackages(cafeId: string): Promise<PublicPackage[]> {
  try {
    const response = await api.get(`/cafes/${cafeId}/packages/public`);
    return response.data?.data || [];
  } catch (error) {
    console.error('[PackageAPI] Error fetching public cafe packages:', error);
    return [];
  }
}

// 3. Thực hiện mua gói chơi hội viên
export async function purchasePackage(
  cafeId: string,
  packageId: string,
  returnUrl?: string,
): Promise<PurchasePackageResult | null> {
  try {
    const response = await api.post(`/cafes/${cafeId}/packages/${packageId}/purchase`, {
      return_url: returnUrl,
    });
    return response.data?.data || null;
  } catch (error) {
    console.error('[PackageAPI] Error purchasing package:', error);
    throw error; // Quăng lỗi ra ngoài để màn hình hiển thị Alert thông báo lỗi chi tiết
  }
}

// 4. Lấy lịch sử sử dụng của một gói
export async function getPackageUsageHistory(customerPackageId: string): Promise<PackageUsageEntry[]> {
  try {
    const response = await api.get(`/customers/me/packages/${customerPackageId}/usage`);
    return response.data?.data || [];
  } catch (error) {
    console.error('[PackageAPI] Error fetching package usage history:', error);
    return [];
  }
}

// 5. Lấy lại payment URL cho gói đang chờ thanh toán (PENDING_PAYMENT)
export async function getRepayUrl(customerPackageId: string): Promise<PurchasePackageResult | null> {
  try {
    const response = await api.post(`/customers/me/packages/${customerPackageId}/repay`, {
      // Truyền mobile return URL để backend redirect về app sau thanh toán (giống các luồng khác)
      return_url: getVnpayReturnUrl(),
    });
    return response.data?.data || null;
  } catch (error) {
    console.error('[PackageAPI] Error getting repay URL:', error);
    throw error;
  }
}
