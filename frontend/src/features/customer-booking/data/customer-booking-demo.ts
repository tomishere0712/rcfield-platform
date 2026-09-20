import { mockCafes, type Cafe, type Vehicle } from "@/shared/data/explore-data"

export type CustomerPlayMode = "RENTAL" | "BYOC" | "MIXED"
export type CheckoutStep = "track" | "schedule" | "participants" | "fnb" | "payment"
export type CustomerPaymentMethod = "vnpay" | "bank_transfer" | "card"

export type FnbMenuItem = {
  id: string
  name: string
  category: "drink" | "snack" | "meal"
  price: number
  image: string
  isAvailable: boolean
}

export type PaymentComponentLine = {
  id: string
  type:
    | "SLOT_FEE"
    | "RENTAL_FEE"
    | "FNB_PREORDER"
    | "PACKAGE_PURCHASE"
    | "PROMOTION"
    | "VAT"
  label: string
  amount: number
  status: "PENDING" | "HELD" | "CAPTURED" | "REFUNDED"
}

export type CustomerBookingSnapshot = {
  bookingId: string
  status: "PENDING" | "CONFIRMED" | "COMPLETED"
  cafe: Cafe
  vehicle: Vehicle
  playMode: CustomerPlayMode
  packageName: string
  slotStart: string
  slotEnd: string
  participants: number
  checkInCode: string
  paymentComponents: PaymentComponentLine[]
}

export type CustomerProfileSnapshot = {
  fullName: string
  email: string
  phone: string
  avatarUrl: string
  memberTier: string
  points: number
  pointsToNextTier: number
  trustScore: number
  bookingCount: number
  joinedAt: string
}

export const fnbMenuItems: FnbMenuItem[] = [
  {
    id: "fnb-1",
    name: "Cold Brew Racing",
    category: "drink",
    price: 45000,
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&q=80&w=400",
    isAvailable: true,
  },
  {
    id: "fnb-2",
    name: "Matcha Pit Stop",
    category: "drink",
    price: 52000,
    image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&q=80&w=400",
    isAvailable: true,
  },
  {
    id: "fnb-3",
    name: "Khoai tây Track Bite",
    category: "snack",
    price: 69000,
    image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&q=80&w=400",
    isAvailable: true,
  },
  {
    id: "fnb-4",
    name: "Combo Team Race",
    category: "meal",
    price: 159000,
    image: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&q=80&w=400",
    isAvailable: true,
  },
]

export const demoCustomerProfile: CustomerProfileSnapshot = {
  fullName: "Nguyễn Văn A",
  email: "nguyen.vana@example.com",
  phone: "0901234567",
  avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300",
  memberTier: "Gold Member",
  points: 12450,
  pointsToNextTier: 2550,
  trustScore: 98,
  bookingCount: 42,
  joinedAt: "2026-01-12",
}

export function getDemoBookingSnapshot(): CustomerBookingSnapshot {
  const cafe = mockCafes[0]
  const vehicle = cafe.availableVehicles[0]

  return {
    bookingId: "RC-8492",
    status: "CONFIRMED",
    cafe,
    vehicle,
    playMode: "RENTAL",
    packageName: "Gói trải nghiệm 2 giờ",
    slotStart: "2026-05-26T09:00:00+07:00",
    slotEnd: "2026-05-26T11:00:00+07:00",
    participants: 2,
    checkInCode: "RC8492-TXM",
    paymentComponents: [
      { id: "pc-1", type: "SLOT_FEE", label: "Gói trải nghiệm", amount: 500000, status: "CAPTURED" },
      { id: "pc-3", type: "VAT", label: "Thuế VAT 10%", amount: 60000, status: "CAPTURED" },
    ],
  }
}
