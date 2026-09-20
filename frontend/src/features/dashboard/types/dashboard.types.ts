export type RevenuePeriod = 'daily' | 'weekly' | 'monthly';

export interface ProviderKpi {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancellationRate: number;
  vehicleUtilizationRate: number;
  totalVehicles: number;
  inUseVehicles: number;
  availableVehicles: number;
  maintenanceVehicles: number;
  newCustomers: number;
}

export interface RevenueTrendItem {
  label: string;
  slotFee: number;
  rentalFee: number;
  fnbPreorder: number;
  extensionFee: number;
  damageCharge: number;
  packageFee?: number;
  /** Phí dự giải — nguồn thứ ba, không gắn booking nào. */
  contestFee?: number;
  total: number;
}

export interface RevenueBreakdownItem {
  type: string;
  label: string;
  amount: number;
}

/** Cơ cấu đơn đặt theo kênh: khách tự đặt qua app, nhân viên tạo, hay giải đấu. */
export interface BookingChannelItem {
  source: string;
  label: string;
  bookingCount: number;
  revenue: number;
  /** Tỉ lệ số đơn trên tổng, 0–1. */
  bookingShare: number;
}

export interface BranchPerformanceItem {
  cafeId: string;
  cafeName: string;
  totalRevenue: number;
  bookingCount: number;
}

export interface BranchOperationsItem {
  cafeId: string;
  cafeName: string;
  cafeStatus: "PENDING" | "ACTIVE" | "SUSPENDED";
  totalRevenue: number;
  bookingCount: number;
  occupiedSlotMinutes: number;
  bookableSlotMinutes: number;
  occupancyRate: number | null;
  totalVehicles: number;
  inUseVehicles: number;
  availableVehicles: number;
  maintenanceVehicles: number;
  overdueSessionCount: number;
  operationalAlertCount: number;
}

export interface RecentBookingItem {
  bookingId: string;
  cafeName: string;
  customerName: string;
  playMode: 'RENTAL' | 'BYOC';
  slotStart: string;
  status: string;
  totalCharged: number;
}

export interface TopFnbItem {
  menuItemId: string;
  itemName: string;
  cafeName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface TopTrackItem {
  trackTypeId: string;
  trackTypeName: string;
  trackTypeCode: string;
  cafeName: string;
  bookingCount: number;
}

export interface TopCustomerItem {
  customerId: string;
  customerName: string;
  customerEmail: string;
  bookingCount: number;
  totalSpent: number;
}

export interface TopVehicleItem {
  catalogId: string;
  catalogName: string;
  catalogTier: string;
  cafeName: string;
  bookingCount: number;
  rentalRevenue: number;
}

export interface TopPackageItem {
  packageId: string;
  packageName: string;
  cafeName: string;
  purchaseCount: number;
  totalRevenue: number;
}

export interface ProviderTopStats {
  topFnb: TopFnbItem[];
  topTracks: TopTrackItem[];
  topCustomers: TopCustomerItem[];
  topVehicles: TopVehicleItem[];
  topPackages?: TopPackageItem[];
}

// ── AI Revenue Analytics ────────────────────────────────────────────────────

export type InsightSeverity = "positive" | "neutral" | "warning" | "critical"
export type InsightType = "trend" | "revenue_mix" | "fleet" | "retention" | "branch"

export interface AiInsight {
  type: InsightType
  title: string
  body: string
  severity: InsightSeverity
}

export interface AiInsightResponse {
  period: { from: string; to: string }
  summary: string
  insights: AiInsight[]
  topOpportunity: string
  watchouts: string[]
  generatedAt: string
}

export type AiInsightResult =
  | { type: "SUCCESS"; data: AiInsightResponse }
  | { type: "INSUFFICIENT_DATA"; data: null }
