export type VehicleStatus = 'available' | 'rented' | 'maintenance';

export interface Vehicle {
  id: string;
  name: string;
  scale: string;
  type: string;
  image: string;
  pricePerHour: number;
  securityDeposit?: number;
  status: VehicleStatus;
  specs?: {
    battery?: string;
    motor?: string;
    brand?: string;
  };
}

export type CafeOperatingHour = {
  open?: string;
  close?: string;
  is_closed?: boolean;
};

export interface Cafe {
  id: string;
  providerId?: string;
  name: string;
  slug: string;
  rating: number;
  reviewsCount: number;
  phone?: string | null;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  address: string;
  district: string;
  city: string;
  image: string;
  images?: string[];
  priceRange: string;
  slotDurationMinutes?: number;
  slotFeeRate?: number;
  maxConcurrentBookings?: number;
  minBookingNoticeMinutes?: number;
  maxAdvanceBookingDays?: number;
  byocCapacity?: number;
  trackTypes: string[];
  trackTypeIds?: string[];
  features: string[];
  description: string;
  coordinates?: { x: number; y: number };
  latitude?: number | null;
  longitude?: number | null;
  availableVehicles: Vehicle[];
  operatingHours?: Record<string, CafeOperatingHour> | string;
  amenities?: { id: string; title: string }[];
  rules?: string[];
}

export type CafeSearchParams = {
  query?: string;
  city?: string;
  trackType?: string;
  priceRange?: string;
  feature?: string;
  date?: string;
  vehicleType?: string;
};

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface PublicPackage {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  slot_count: number;
  valid_days: number;
  applicable_play_modes: ('RENTAL' | 'BYOC')[];
  benefits: string[];
  is_popular: boolean;
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  customerId?: string;
  user?: {
    fullName: string;
    avatarUrl?: string | null;
  } | null;
  ownerResponse?: string | null;
  vehicleScore?: number | null;
  staffScore?: number | null;
  facilityScore?: number | null;
  cafeName?: string;
}

export interface ActivePromotion {
  code: string;
  description: string | null;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: number | null;
  applicable_to: 'ALL' | 'RENTAL' | 'BYOC';
  expires_at: string | null;
}

