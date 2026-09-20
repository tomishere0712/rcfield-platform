import type { CustomerBookingDetail } from "./customer-operational-mock-data"

export interface StaffIncident {
  incidentId: string
  sessionId?: string
  bookingShortCode?: string
  customerName: string
  customerPhone: string
  type: "CRASH" | "EQUIPMENT_DAMAGE" | "MISCONDUCT" | "TRACK_VIOLATION"
  severity: "LOW" | "MEDIUM" | "HIGH"
  description: string
  fineAmount: number
  status: "RESOLVED" | "UNRESOLVED"
  createdAt: string
}

export interface StaffMaintenanceLog {
  logId: string
  vehicleId: string
  vehicleName: string
  issueDescription: string
  staffNotes: string
  cost: number
  performedBy: string
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED"
  createdAt: string
  completedAt?: string
  // Context metadata (Cơ sở, Category, Bằng chứng ảnh & Checklist)
  cafeName?: string
  categoryName?: string
  categoryTier?: string
  inspectionPhotos?: { angle: string; url: string; notes?: string }[]
  damagedChecklist?: {
    itemKey: string
    itemLabel: string
    status: string
    note?: string
  }[]
}

export interface StaffByocVehicle {
  id: string
  ownerName: string
  ownerPhone: string
  vehicleBrand: string
  vehicleScale: string
  frequencyGhz: string
  safetyChecked: boolean
  lastCheckedAt: string
}

export interface StaffCustomerPackage {
  phone: string
  email: string
  fullName: string
  balanceAmount: number
  activeSubscriptions: {
    planName: string
    expiresAt: string
    remainingSessions: number
    totalSessions: number
  }[]
  purchasedPackages: {
    packageName: string
    purchasedAt: string
    remainingSlots: number
    totalSlots: number
  }[]
}

// ----------------------------------------------------
// 1. INCIDENTS MOCK SEED DATA
// ----------------------------------------------------
export const initialMockIncidents: StaffIncident[] = [
  {
    incidentId: "INC-9912",
    sessionId: "SS-4890",
    bookingShortCode: "RCF-8829",
    customerName: "Nguyễn Hoàng Long",
    customerPhone: "0908123456",
    type: "CRASH",
    severity: "MEDIUM",
    description:
      "Va chạm mạnh vào rào chắn cua số 4 gây nứt nhẹ cản trước xe Mazda RX-7.",
    fineAmount: 150000,
    status: "RESOLVED",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    incidentId: "INC-9913",
    customerName: "Trần Thế Vinh",
    customerPhone: "0912345678",
    type: "TRACK_VIOLATION",
    severity: "LOW",
    description:
      "Cố ý chạy ngược chiều đường đua Asphalt gây cản trở và nguy hiểm cho các xe khác. Đã nhắc nhở lần 1.",
    fineAmount: 0,
    status: "RESOLVED",
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    incidentId: "INC-9914",
    sessionId: "SS-7729",
    bookingShortCode: "RCF-4412",
    customerName: "Phạm Văn Minh",
    customerPhone: "0987654321",
    type: "EQUIPMENT_DAMAGE",
    severity: "HIGH",
    description:
      "Làm rơi bộ điều khiển RC từ bục ngắm cảnh xuống đường đua gây vỡ vỏ tay cầm điều khiển.",
    fineAmount: 350000,
    status: "UNRESOLVED",
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
]

// ----------------------------------------------------
// 2. FLEET MAINTENANCE LOGS MOCK SEED DATA
// ----------------------------------------------------
export const initialMockMaintenanceLogs: StaffMaintenanceLog[] = [
  {
    logId: "MNT-8812",
    vehicleId: "V-MAZDA-RX7",
    vehicleName: "Mazda RX-7 FD3S Drift Special",
    cafeName: "RC Field Quận 4",
    categoryName: "Drift Special Nitro",
    categoryTier: "PREMIUM",
    issueDescription:
      "Thay vỏ bánh xe nhựa cứng drift bị mòn vẹt sau 40 ca chạy.",
    staffNotes:
      "Đã thay vỏ nhựa ABS mới loại Drift Tech, căn chỉnh lại vis sai.",
    cost: 80000,
    performedBy: "Lê Văn Tùng (Staff)",
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 47).toISOString(),
    inspectionPhotos: [
      {
        angle: "FRONT",
        url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
        notes: "Ảnh Check-out: Bánh nhựa sờn mòn 80%",
      },
      {
        angle: "LEFT",
        url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=400",
        notes: "Mòn lệch góc sườn trái",
      },
    ],
    damagedChecklist: [
      {
        itemKey: "TIRES",
        itemLabel: "Vỏ bánh xe Drift",
        status: "SCRATCHED",
        note: "Mòn vẹt lớp nhựa ma sát",
      },
      {
        itemKey: "VIS_SAI",
        itemLabel: "Bộ Vis-sai cầu sau",
        status: "NEEDS_REVIEW",
        note: "Kêu rơ nhẹ khi ôm cua",
      },
    ],
  },
  {
    logId: "MNT-8813",
    vehicleId: "V-NISSAN-GTR",
    vehicleName: "Nissan GT-R R35 Drift Spec",
    cafeName: "RC Field Quận 4",
    categoryName: "Circuit GT Pro",
    categoryTier: "PREMIUM",
    issueDescription: "Kiểm tra Servo bẻ lái phản hồi chậm, lệch góc lái 5 độ.",
    staffNotes:
      "Đã bôi trơn lại khớp nhông lái, điều chỉnh trimmer trên mạch thu sóng.",
    cost: 30000,
    performedBy: "Trần Minh Quốc (Staff)",
    status: "COMPLETED",
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 23.5).toISOString(),
    inspectionPhotos: [
      {
        angle: "FRONT",
        url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
        notes: "Thân xe không móp xước",
      },
    ],
    damagedChecklist: [
      {
        itemKey: "SERVO",
        itemLabel: "Servo bẻ lái",
        status: "BROKEN",
        note: "Nhông servo rơ 5 độ",
      },
    ],
  },
  {
    logId: "MNT-8814",
    vehicleId: "V-SUBARU-BRZ",
    vehicleName: "Subaru BRZ Custom Drift",
    cafeName: "RC Field Quận 4",
    categoryName: "Drift Starter",
    categoryTier: "STANDARD",
    issueDescription:
      "Động cơ chổi than Brushless quá nhiệt đột ngột, pin hao nhanh bất thường.",
    staffNotes:
      "Đang tháo máy đo cuộn cảm và kiểm tra xem có kẹt bánh răng truyền động chính hay không.",
    cost: 250000,
    performedBy: "Lê Văn Tùng (Staff)",
    status: "IN_PROGRESS",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    inspectionPhotos: [
      {
        angle: "DETAIL",
        url: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400",
        notes: "Mô-tơ bốc khói nhẹ sau ca chạy",
      },
      {
        angle: "BACK",
        url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=400",
        notes: "Bụi nhựa bám khoang động cơ",
      },
    ],
    damagedChecklist: [
      {
        itemKey: "MOTOR",
        itemLabel: "Động cơ Brushless",
        status: "BROKEN",
        note: "Quá nhiệt 85°C",
      },
      {
        itemKey: "GEARBOX",
        itemLabel: "Hộp số & Bánh răng truyền động",
        status: "SCRATCHED",
        note: "Bột nhựa bám khe nhông",
      },
    ],
  },
]

// ----------------------------------------------------
// 3. BYOC VEHICLES MOCK SEED DATA
// ----------------------------------------------------
export const initialMockByocRegistry: StaffByocVehicle[] = [
  {
    id: "BYOC-001",
    ownerName: "Lê Hoàng Khánh",
    ownerPhone: "0909112233",
    vehicleBrand: "Yokomo YD-2 ZX",
    vehicleScale: "1/10",
    frequencyGhz: "2.4 GHz",
    safetyChecked: true,
    lastCheckedAt: new Date().toISOString(),
  },
  {
    id: "BYOC-002",
    ownerName: "Phan Anh Vũ",
    ownerPhone: "0977889900",
    vehicleBrand: "MST RMX 2.5",
    vehicleScale: "1/10",
    frequencyGhz: "2.4 GHz",
    safetyChecked: true,
    lastCheckedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "BYOC-003",
    ownerName: "Hoàng Kim Sơn",
    ownerPhone: "0934556677",
    vehicleBrand: "HPI Racing E10",
    vehicleScale: "1/10",
    frequencyGhz: "2.4 GHz",
    safetyChecked: false,
    lastCheckedAt: new Date(Date.now() - 7200000).toISOString(),
  },
]

// ----------------------------------------------------
// 4. PACKAGES & SUBSCRIPTIONS MOCK SEED DATA
// ----------------------------------------------------
export const initialMockPackages: StaffCustomerPackage[] = [
  {
    phone: "0908123456",
    email: "longnh@gmail.com",
    fullName: "Nguyễn Hoàng Long",
    balanceAmount: 250000,
    activeSubscriptions: [
      {
        planName: "Gói Hội Viên Vàng - Gold Member Playpass",
        expiresAt: "2026-12-31T23:59:59Z",
        remainingSessions: 18,
        totalSessions: 30,
      },
    ],
    purchasedPackages: [
      {
        packageName: "Combo 10 ca chơi tự do (BYOC)",
        purchasedAt: "2026-05-10T09:00:00Z",
        remainingSlots: 4,
        totalSlots: 10,
      },
    ],
  },
  {
    phone: "0912345678",
    email: "vinh.tranthe@yahoo.com",
    fullName: "Trần Thế Vinh",
    balanceAmount: 50000,
    activeSubscriptions: [],
    purchasedPackages: [
      {
        packageName: "Gói Trải Nghiệm Lính Mới - 5 ca thuê xe",
        purchasedAt: "2026-05-20T15:30:00Z",
        remainingSlots: 2,
        totalSlots: 5,
      },
    ],
  },
  {
    phone: "0987654321",
    email: "minh.phamvan@gmail.com",
    fullName: "Phạm Văn Minh",
    balanceAmount: 1200000,
    activeSubscriptions: [
      {
        planName: "Gói Hội Viên Kim Cương - VIP Drift Master",
        expiresAt: "2026-08-15T23:59:59Z",
        remainingSessions: 45,
        totalSessions: 50,
      },
    ],
    purchasedPackages: [],
  },
]

// ----------------------------------------------------
// 5. EXTENDED CUSTOMER BOOKINGS LIST FOR TODAY OPERATIONAL FLOW
// ----------------------------------------------------
export const initialMockBookings: CustomerBookingDetail[] = [
  // 1. Active RENTAL drift session
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
    slotStart: new Date(Date.now() - 1800000).toISOString(), // started 30 mins ago
    slotEnd: new Date(Date.now() + 3600000).toISOString(), // ends in 60 mins
    slotCount: 3,
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
        staffName: "Lê Văn Tùng (Staff)",
        actualStart: new Date(Date.now() - 1800000).toISOString(),
        plannedEnd: new Date(Date.now() + 3600000).toISOString(),
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
            customerConfirmedAt: new Date(Date.now() - 1900000).toISOString(),
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
  // 2. Walk-in BYOC slot waiting to Check-in
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
    playMode: "BYOC",
    status: "CONFIRMED",
    slotStart: new Date(Date.now() + 600000).toISOString(), // starts in 10 mins
    slotEnd: new Date(Date.now() + 4200000).toISOString(),
    slotCount: 2,
    depositAmount: 0,
    slotFee: 80000,
    rentalFee: 0,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 80000,
    paymentStatus: "PAID",
    plannedParticipants: ["Phan Anh Vũ"],
    plannedVehicles: ["MST RMX 2.5 (Sở hữu riêng)"],
    sessions: [],
  },
  // 3. Extending Session with active proposal
  {
    bookingId: "BK-4412",
    shortCode: "RCF-4412",
    cafeId: "cafe-drift-town",
    cafeName: "Drift Town Sài Gòn",
    cafeAddress: "145 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh",
    cafePhone: "0901 234 567",
    trackName: "Đường đua Super Offroad B",
    trackType: "OFFROAD_DIRT",
    bookingMode: "SINGLE",
    playMode: "RENTAL",
    status: "CONFIRMED",
    slotStart: new Date(Date.now() - 3600000).toISOString(),
    slotEnd: new Date(Date.now()).toISOString(),
    slotCount: 2,
    depositAmount: 0,
    slotFee: 85000,
    rentalFee: 150000,
    fnbPreorderFee: 0,
    discountAmount: 0,
    totalAmount: 235000,
    paymentStatus: "PAID",
    plannedParticipants: ["Phạm Văn Minh"],
    plannedVehicles: ["Subaru BRZ Drift (Scale 1/10)"],
    sessions: [
      {
        sessionId: "SS-7729",
        bookingId: "BK-4412",
        status: "EXTENDING",
        staffName: "Lê Văn Tùng (Staff)",
        actualStart: new Date(Date.now() - 3500000).toISOString(),
        plannedEnd: new Date(Date.now()).toISOString(),
        participants: [{ name: "Phạm Văn Minh", type: "PLAYER" }],
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
            customerConfirmedAt: new Date(Date.now() - 3550000).toISOString(),
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
              },
            ],
            checklist: [{ id: "ck-s1", label: "Pin đầy", checked: true }],
          },
        ],
        extensionProposal: {
          proposalId: "PRP-9921",
          extraMinutes: 30,
          additionalFee: 75000,
          newPlannedEnd: new Date(Date.now() + 1800000).toISOString(),
          expiresAt: new Date(Date.now() + 500000).toISOString(),
          status: "PENDING",
        },
      },
    ],
  },
  // 4. Session waiting for Check-out verification (Damage flagged)
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
    slotStart: new Date(Date.now() - 7200000).toISOString(),
    slotEnd: new Date(Date.now() - 3600000).toISOString(),
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
        sessionId: "SS-2291",
        bookingId: "BK-5192",
        status: "CHECKING_OUT",
        staffName: "Trần Minh Quốc (Staff)",
        actualStart: new Date(Date.now() - 7100000).toISOString(),
        actualEnd: new Date(Date.now() - 3600000).toISOString(),
        plannedEnd: new Date(Date.now() - 3600000).toISOString(),
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
            inspectionId: "INS-CI-2291",
            type: "CHECK_IN",
            customerConfirmed: true,
            damageFlagged: false,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
              },
            ],
            checklist: [{ id: "ck-c1", label: "Thân vỏ sạch", checked: true }],
          },
          {
            inspectionId: "INS-CO-2291",
            type: "CHECK_OUT",
            customerConfirmed: false,
            damageFlagged: true,
            photos: [
              {
                direction: "FRONT",
                url: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
                notes: "Lốp rách nhẹ",
              },
            ],
            checklist: [
              {
                id: "ck-c1",
                label: "Thân vỏ sạch",
                checked: false,
                notes: "Nứt xước nhẹ vè trước",
              },
            ],
            staffNotes: "Phát hiện vết nứt ở vè chắn bùn trước bên phải.",
          },
        ],
        damageClaim: {
          claimId: "CLM-2291",
          description: "Nứt vè chắn bùn trước xe Nissan GT-R",
          damageLineItems: [
            {
              id: "DAMAGE-LINE-2291",
              partType: "FENDER",
              customPartName: "Vè chắn bùn trước",
              partsPrice: 150000,
              laborPrice: 0,
              lineTotal: 150000,
            },
          ],
          totalDamageCharge: 180000,
          estimatedCost: 150000,
          finalCharge: 180000,
          checkInPhoto:
            "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=400",
          checkOutPhoto:
            "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=400",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
        },
      },
    ],
  },
]
