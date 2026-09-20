import type { PaymentComponentResponse } from "@/features/booking/types/booking.types"

export interface InspectionPhoto {
  direction:
    | "FRONT"
    | "BACK"
    | "LEFT"
    | "RIGHT"
    | "TOP"
    | "BOTTOM"
    | "DETAIL"
    | "OTHER"
  url: string
  notes?: string
}

export interface ChecklistItem {
  id: string
  label: string
  checked: boolean
  notes?: string
}

export interface MockInspection {
  inspectionId: string
  type: "CHECK_IN" | "CHECK_OUT"
  photos: InspectionPhoto[]
  checklist: ChecklistItem[]
  staffNotes?: string
  customerConfirmed: boolean
  customerConfirmedAt?: string
  damageFlagged: boolean
  damageDescription?: string
  estimatedCost?: number
}

export interface MockExtensionProposal {
  proposalId: string
  extraMinutes: number
  additionalFee: number
  newPlannedEnd: string
  expiresAt: string // 10 minutes timeout
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"
}

export interface MockDamageClaim {
  claimId: string
  description: string
  damageLineItems: {
    id: string
    partType: string
    customPartName: string | null
    partsPrice: number
    laborPrice: number
    lineTotal: number
  }[]
  totalDamageCharge: number
  checkInPhoto: string
  checkOutPhoto: string
  status: "PENDING" | "CONFIRMED" | "DISPUTED"
  customerNotes?: string
  expiresAt: string
  estimatedCost?: number
  finalCharge?: number
}

export interface MockSessionDetail {
  sessionId: string
  bookingId: string
  status:
    | "CHECKED_IN"
    | "ACTIVE"
    | "EXTENDING"
    | "CHECKING_OUT"
    | "COMPLETED"
    | "CANCELLED"
  staffName: string
  actualStart?: string
  actualEnd?: string
  plannedEnd: string
  participants: { name: string; type: "PLAYER" | "SPECTATOR" }[]
  vehicles: {
    vehicleId: string
    name: string
    type: "RENT" | "BYOC"
    imageUrl?: string
    plateNumber?: string
  }[]
  inspections: MockInspection[]
  extensionProposal?: MockExtensionProposal
  approvedExtensionFee?: number
  approvedExtensionMinutes?: number
  approvedExtensions?: {
    proposalId: string
    extraMinutes: number
    additionalFee: number
    approvedAt?: string
  }[]
  extensionPricingOptions?: {
    extraMinutes: number
    additionalFee: number
    newPlannedEnd: string
    available?: boolean
    blockedReason?: string
  }[]
  damageClaim?: MockDamageClaim
  fnbOrders?: {
    orderId: string
    orderType?: string
    status?: string
    items: {
      name: string
      variantName?: string | null
      qty: number
      price: number
      notes?: string | null
    }[]
    total: number
  }[]
}

export interface CustomerBookingDetail {
  bookingId: string
  shortCode: string
  cafeId: string
  cafeName: string
  cafeAddress: string
  cafePhone: string
  trackName: string
  trackType: string
  bookingMode: "SINGLE" | "PACKAGE" | "SUBSCRIPTION"
  playMode: "RENTAL" | "BYOC" | "MIXED"
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "NO_SHOW"
    | "AWAITING_PAYMENT"
    | "COMPLETED"
  slotStart: string
  slotEnd: string
  slotCount: number
  paymentExpiresAt?: string // 30 mins countdown for PENDING
  depositAmount: number
  slotFee: number
  rentalFee: number
  fnbPreorderFee: number
  discountAmount: number
  totalAmount: number
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED"
  source?: string
  /**
   * Khách có tự đăng nhập để bấm xác nhận được không.
   *
   * `false` = tài khoản mềm (đặt qua Messenger, hoặc khách vãng lai nhân viên
   * tạo tại quầy). Những bước bắt buộc khách xác nhận phải đi qua đường thao
   * tác hộ, vì họ không có mật khẩu để đăng nhập.
   */
  customerCanSelfServe?: boolean
  payment_components?: PaymentComponentResponse[]
  plannedParticipants: string[]
  participantDetails?: { name: string; phone?: string; isBooker: boolean }[]
  plannedVehicles: string[]
  sessions: MockSessionDetail[]
  hasPendingRefund?: boolean
}

// ----------------------------------------------------
// DATASETS FOR TESTING VARIOUS USER FLOWS
// ----------------------------------------------------

export const mockCustomerBookingDetails: CustomerBookingDetail[] = [
  // 1. CONFIRMED Booking with an ACTIVE Session
  {
    bookingId: "BK-8829",
    shortCode: "RCF-8829",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Drift A",
    trackType: "DRIFT_ASPHALT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "CONFIRMED",
    slotStart: "2026-05-24T14:00:00Z",
    slotEnd: "2026-05-24T15:30:00Z",
    slotCount: 3, // 30-min slots
    depositAmount: 0,
    slotFee: 120000,
    rentalFee: 200000,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 320000,
    paymentStatus: "PAID",
    plannedParticipants: ["Nguyễn Hoàng Long"],
    plannedVehicles: ["Mazda RX-7 FD3S (Scale 1/10)"],
    sessions: [
      {
        sessionId: "SS-4890",
        bookingId: "BK-8829",
        status: "ACTIVE",
        staffName: "Trần Minh Quốc (Staff)",
        actualStart: "2026-05-24T14:05:00Z",
        plannedEnd: "2026-05-24T15:35:00Z",
        participants: [{ name: "Nguyễn Hoàng Long", type: "PLAYER" }],
        vehicles: [
          {
            vehicleId: "V-MAZDA-RX7",
            name: "Mazda RX-7 FD3S Drift Special",
            type: "RENT",
            imageUrl:
              "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400",
          },
        ],
        inspections: [
          {
            inspectionId: "INS-CHECKIN-4890",
            type: "CHECK_IN",
            customerConfirmed: true,
            customerConfirmedAt: "2026-05-24T14:04:00Z",
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
                notes: "Kính trước sạch bóng, không nứt",
              },
              {
                direction: "BACK",
                url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
                notes: "Cản sau nguyên vẹn, đèn led sáng",
              },
              {
                direction: "LEFT",
                url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
                notes: "Sườn xe trái nguyên mẫu",
              },
              {
                direction: "RIGHT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
                notes: "Sườn xe phải không xước",
              },
            ],
            checklist: [
              { id: "ck-1", label: "Pin được sạc đầy 100%", checked: true },
              {
                id: "ck-2",
                label: "Hệ thống lái Servo hoạt động nhạy",
                checked: true,
              },
              {
                id: "ck-3",
                label: "Vỏ drift nhựa cứng bám đường tốt",
                checked: true,
              },
              {
                id: "ck-4",
                label: "Điều khiển từ xa kết nối ổn định",
                checked: true,
              },
            ],
            staffNotes: "Xe hoạt động hoàn hảo trước khi giao cho khách.",
          },
        ],
        fnbOrders: [
          {
            orderId: "FNB-0082",
            items: [
              { name: "Cà phê sữa đá pha máy", qty: 1, price: 35000 },
              { name: "Bánh bông lan trứng muối", qty: 1, price: 45000 },
            ],
            total: 80000,
          },
        ],
      },
    ],
  },

  // 2. CONFIRMED Booking with an CHECKED_IN Session (Customer confirmation needed!)
  {
    bookingId: "BK-9021",
    shortCode: "RCF-9021",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Drift A",
    trackType: "DRIFT_ASPHALT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "CONFIRMED",
    slotStart: "2026-05-24T16:00:00Z",
    slotEnd: "2026-05-24T17:00:00Z",
    slotCount: 2,
    depositAmount: 0,
    slotFee: 80000,
    rentalFee: 150000,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 230000,
    paymentStatus: "PAID",
    plannedParticipants: ["Nguyễn Hoàng Long"],
    plannedVehicles: ["Nissan GT-R R35 Drift (Scale 1/10)"],
    sessions: [
      {
        sessionId: "SS-5112",
        bookingId: "BK-9021",
        status: "CHECKED_IN",
        staffName: "Lê Văn Tùng (Staff)",
        plannedEnd: "2026-05-24T17:00:00Z",
        participants: [{ name: "Nguyễn Hoàng Long", type: "PLAYER" }],
        vehicles: [
          {
            vehicleId: "V-NISSAN-GTR",
            name: "Nissan GT-R R35 Drift Spec",
            type: "RENT",
            imageUrl:
              "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400",
          },
        ],
        inspections: [
          {
            inspectionId: "INS-CHECKIN-5112",
            type: "CHECK_IN",
            customerConfirmed: false,
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
                notes: "Lưới tản nhiệt trước nguyên vẹn",
              },
              {
                direction: "BACK",
                url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
                notes: "Ống xả đôi nguyên trạng",
              },
              {
                direction: "LEFT",
                url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
                notes: "Decal hông trái bóng đẹp",
              },
              {
                direction: "RIGHT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
                notes: "Vành bánh xe bên phải hoàn chỉnh",
              },
            ],
            checklist: [
              { id: "ck-r1", label: "Pin đã kiểm tra đầy sạc", checked: true },
              {
                id: "ck-r2",
                label: "Lốp drift chính hãng không mòn lẹm",
                checked: true,
              },
              { id: "ck-r3", label: "Body kit không lỏng lẻo", checked: true },
              { id: "ck-r4", label: "Remote có pin mới", checked: true },
            ],
            staffNotes:
              "Xe Nissan GT-R R35 drift màu đỏ rất đẹp, đã kiểm tra đầy đủ mọi chức năng.",
          },
        ],
      },
    ],
  },

  // 3. CONFIRMED Booking with an EXTENDING Session (Extension proposal pending!)
  {
    bookingId: "BK-4412",
    shortCode: "RCF-4412",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Drift A",
    trackType: "DRIFT_ASPHALT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "CONFIRMED",
    slotStart: "2026-05-24T18:00:00Z",
    slotEnd: "2026-05-24T19:00:00Z",
    slotCount: 2,
    depositAmount: 0,
    slotFee: 80000,
    rentalFee: 150000,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 230000,
    paymentStatus: "PAID",
    plannedParticipants: ["Nguyễn Hoàng Long"],
    plannedVehicles: ["Subaru BRZ Drift (Scale 1/10)"],
    sessions: [
      {
        sessionId: "SS-7729",
        bookingId: "BK-4412",
        status: "EXTENDING",
        staffName: "Trần Minh Quốc (Staff)",
        actualStart: "2026-05-24T18:02:00Z",
        plannedEnd: "2026-05-24T19:02:00Z",
        participants: [{ name: "Nguyễn Hoàng Long", type: "PLAYER" }],
        vehicles: [
          {
            vehicleId: "V-SUBARU-BRZ",
            name: "Subaru BRZ Custom Drift",
            type: "RENT",
            imageUrl:
              "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400",
          },
        ],
        inspections: [
          {
            inspectionId: "INS-CHECKIN-7729",
            type: "CHECK_IN",
            customerConfirmed: true,
            customerConfirmedAt: "2026-05-24T18:01:00Z",
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "BACK",
                url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "LEFT",
                url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "RIGHT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
              },
            ],
            checklist: [
              { id: "ck-s1", label: "Pin đầy", checked: true },
              { id: "ck-s2", label: "Servo ok", checked: true },
            ],
          },
        ],
        extensionProposal: {
          proposalId: "PRP-9921",
          extraMinutes: 30,
          additionalFee: 75000,
          newPlannedEnd: "2026-05-24T19:32:00Z",
          expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(), // 8 minutes left
          status: "PENDING",
        },
      },
    ],
  },

  // 4. CONFIRMED Booking with an CHECKING_OUT Session (Damage claim pending!)
  {
    bookingId: "BK-5192",
    shortCode: "RCF-5192",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Drift A",
    trackType: "DRIFT_ASPHALT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "CONFIRMED",
    slotStart: "2026-05-24T11:00:00Z",
    slotEnd: "2026-05-24T12:00:00Z",
    slotCount: 2,
    depositAmount: 0,
    slotFee: 80000,
    rentalFee: 150000,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 230000,
    paymentStatus: "PAID",
    plannedParticipants: ["Nguyễn Hoàng Long"],
    plannedVehicles: ["Mazda RX-7 FD3S (Scale 1/10)"],
    sessions: [
      {
        sessionId: "SS-2291",
        bookingId: "BK-5192",
        status: "CHECKING_OUT",
        staffName: "Lê Văn Tùng (Staff)",
        actualStart: "2026-05-24T11:05:00Z",
        actualEnd: "2026-05-24T12:05:00Z",
        plannedEnd: "2026-05-24T12:05:00Z",
        participants: [{ name: "Nguyễn Hoàng Long", type: "PLAYER" }],
        vehicles: [
          {
            vehicleId: "V-MAZDA-RX7-OUT",
            name: "Mazda RX-7 FD3S Drift Special",
            type: "RENT",
            imageUrl:
              "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400",
          },
        ],
        inspections: [
          // Check-in Inspection
          {
            inspectionId: "INS-CI-2291",
            type: "CHECK_IN",
            customerConfirmed: true,
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "BACK",
                url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "LEFT",
                url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "RIGHT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
              },
            ],
            checklist: [
              { id: "ck-c1", label: "Thân vỏ sạch", checked: true },
              { id: "ck-c2", label: "Cánh gió vững", checked: true },
            ],
          },
          // Check-out Inspection (Hư hại bánh trái trước!)
          {
            inspectionId: "INS-CO-2291",
            type: "CHECK_OUT",
            customerConfirmed: false,
            damageFlagged: true,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&q=80&w=400",
                notes: "Lốp bên trái trước bị móp và vỡ vành",
              },
              {
                direction: "BACK",
                url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "LEFT",
                url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
              },
              {
                direction: "RIGHT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
              },
            ],
            checklist: [
              { id: "ck-c1", label: "Thân vỏ sạch", checked: true },
              { id: "ck-c2", label: "Cánh gió vững", checked: true },
              {
                id: "ck-c3",
                label: "Cản trước xước sâu và mẻ vành bánh xe trước",
                checked: false,
                notes: "Vết đâm trực diện vào dải phân cách",
              },
            ],
            staffNotes:
              "Khách đâm xe khá mạnh vào tường chắn góc cua số 3 làm vỡ vành và xước sâu cản trước. Cần thay vành trước bên trái và sơn dặm lại cản.",
          },
        ],
        damageClaim: {
          claimId: "CLM-3199",
          description:
            "Vỡ vành bánh xe trước bên trái & trầy xước nặng cản trước do va đập tốc độ cao.",
          damageLineItems: [
            {
              id: "li-1",
              partType: "TIRE_WHEEL",
              customPartName: null,
              partsPrice: 80000,
              laborPrice: 20000,
              lineTotal: 100000,
            },
            {
              id: "li-2",
              partType: "SHELL",
              customPartName: null,
              partsPrice: 40000,
              laborPrice: 10000,
              lineTotal: 50000,
            },
          ],
          totalDamageCharge: 150000,
          checkInPhoto:
            "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
          checkOutPhoto:
            "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&q=80&w=400",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        },
      },
    ],
  },

  // 5. Booking PENDING PAYMENT (Payment countdown active!)
  {
    bookingId: "BK-1992",
    shortCode: "RCF-1992",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Drift A",
    trackType: "DRIFT_ASPHALT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "PENDING",
    slotStart: "2026-05-25T10:00:00Z",
    slotEnd: "2026-05-25T11:00:00Z",
    slotCount: 2,
    depositAmount: 0,
    slotFee: 80000,
    rentalFee: 150000,
    fnbPreorderFee: 45000, // Preordered bánh ngọt
    discountAmount: 25000, // Mã giảm giá cựu chiến binh
    totalAmount: 250000,
    paymentStatus: "UNPAID",
    plannedParticipants: ["Nguyễn Hoàng Long", "Trần Hữu Nam"],
    plannedVehicles: ["Mazda RX-7 FD3S (Scale 1/10)"],
    paymentExpiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // 25 minutes left
    sessions: [],
  },
]
