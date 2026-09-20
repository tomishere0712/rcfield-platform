export interface Review {
  id: string;
  bookingId: string;
  cafeId: string;
  cafeName?: string;
  customerId: string;
  customerName: string;
  overallScore: number;
  vehicleScore: number | null;
  staffScore: number | null;
  facilityScore: number | null;
  note: string | null;
  status: 'VISIBLE' | 'HIDDEN';
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewAggregate {
  cafeId: string;
  reviewCount: number;
  overallAvg: number | null;
  vehicleAvg: number | null;
  staffAvg: number | null;
  facilityAvg: number | null;
}

export interface PendingBookingReview {
  bookingId: string;
  cafeId: string;
  cafeName: string;
  slotStart: string;
  slotEnd: string;
  playMode: 'RENTAL' | 'BYOC';
  completedAt: string;
}
