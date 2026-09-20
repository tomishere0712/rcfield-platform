export interface AdminMetric {
  label: string
  value: string
  helper: string
  trend: "up" | "down"
  icon: string
}

export interface AdminCafe {
  id: string
  name: string
  providerName: string
  email: string
  phone: string
  address: string
  saasPlan: "Professional" | "Starter" | "Free"
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  createdDate: string
  logo?: string
}

export interface InspectionEvidence {
  photos: {
    front: string
    back: string
    left: string
    right: string
  }
  checklist: {
    frontBumper: string
    tires: string
    chassis: string
    spoiler: string
  }
}

export interface AdminDispute {
  id: string
  bookingId: string
  sessionId: string
  cafeName: string
  customerName: string
  type: "DAMAGE_CHARGE" | "SERVICE_QUALITY" | "TIMING"
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "WAIVED"
  amount: number
  createdDate: string
  reason: string
  responsibleParty?: "CUSTOMER" | "PROVIDER" | "STAFF" | "SHARED" | "UNKNOWN"
  resolutionFavor?: "CUSTOMER" | "PROVIDER" | "SPLIT"
  resolutionNote?: string
  checkInEvidence: InspectionEvidence
  checkOutEvidence: InspectionEvidence
}

export interface AdminUser {
  id: string
  fullName: string
  email: string
  role: "customer" | "provider" | "staff" | "admin"
  trustScore: number
  status: "ACTIVE" | "BANNED"
  createdDate: string
}

export interface AdminPayment {
  id: string
  cafeName: string
  type: "SAAS_SUBSCRIPTION" | "PLATFORM_COMMISSION"
  amount: number
  status: "SUCCESS" | "PENDING" | "FAILED"
  paymentMethod: string
  date: string
  description: string
}

export interface FeatureFlag {
  key: string
  description: string
  status: "READY" | "MOCK" | "DISABLED"
  parentKey?: string
}

export interface TrustScoreLog {
  id: string
  userId: string
  userName: string
  previousScore: number
  newScore: number
  delta: number
  reason: string
  timestamp: string
}

// 1. Dashboard Metrics
export const adminMetrics = {
  totalCafes: { label: "Tổng số đối tác", value: "15", helper: "4 đang hoạt động", trend: "up", icon: "Building2" },
  totalUsers: { label: "Tổng người dùng", value: "1,280", helper: "+15.3% so với tuần trước", trend: "up", icon: "Users" },
  monthlyRevenue: { label: "Doanh thu nền tảng (Tháng này)", value: "4,500,000 ₫", helper: "+12.5% so với tháng trước", trend: "up", icon: "DollarSign" },
  activeSessions: { label: "Phiên chơi đang hoạt động", value: "18", helper: "Từ 5 cơ sở", trend: "up", icon: "Play" }
}

// 2. Charts Data
export const cafeGrowthData = [
  { name: "Thg 12", value: 4 },
  { name: "Thg 01", value: 6 },
  { name: "Thg 02", value: 8 },
  { name: "Thg 03", value: 11 },
  { name: "Thg 04", value: 13 },
  { name: "Thg 05", value: 15 }
]

export const revenueBySaaSPlan = [
  { name: "Professional", count: 4, revenue: 1196000 }, // Professional $299 equivalent
  { name: "Starter", count: 3, revenue: 147000 },      // Starter $49 equivalent
  { name: "Free", count: 8, revenue: 0 }
]

export const activeSessionsLast7Days = [
  { name: "T2", value: 12 },
  { name: "T3", value: 15 },
  { name: "T4", value: 18 },
  { name: "T5", value: 14 },
  { name: "T6", value: 25 },
  { name: "T7", value: 42 },
  { name: "CN", value: 38 }
]

// 3. Cafe / Provider Onboarding Requests
export const mockAdminCafes: AdminCafe[] = [
  {
    id: "CF-101",
    name: "Drift Town Sài Gòn",
    providerName: "Nguyễn Văn Hùng",
    email: "hung.nguyen@drifttown.vn",
    phone: "0901234567",
    address: "123 Song Hành, Quận 2, TP.HCM",
    saasPlan: "Professional",
    status: "APPROVED",
    createdDate: "2026-01-15",
    logo: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=150"
  },
  {
    id: "CF-102",
    name: "RC Cafe Hà Nội Speed",
    providerName: "Trần Đức Thắng",
    email: "thang.tran@hanoispeed.com",
    phone: "0912345678",
    address: "45 Lạc Long Quân, Tây Hồ, Hà Nội",
    saasPlan: "Starter",
    status: "APPROVED",
    createdDate: "2026-02-10",
    logo: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=150"
  },
  {
    id: "CF-103",
    name: "Mini Racer Đà Nẵng",
    providerName: "Phan Văn Minh",
    email: "minh.phan@miniracer.vn",
    phone: "0987654321",
    address: "88 Bạch Đằng, Hải Châu, Đà Nẵng",
    saasPlan: "Professional",
    status: "APPROVED",
    createdDate: "2026-03-01"
  },
  {
    id: "CF-104",
    name: "RC Off-Road Bình Dương",
    providerName: "Lê Hoàng Hải",
    email: "hai.le@rcoffroad.vn",
    phone: "0898765432",
    address: "D1, KDC Chánh Nghĩa, Thủ Dầu Một, Bình Dương",
    saasPlan: "Professional",
    status: "PENDING",
    createdDate: "2026-05-20"
  },
  {
    id: "CF-105",
    name: "Drift Cafe Hải Phòng",
    providerName: "Vũ Thị Lan",
    email: "lan.vu@driftcafe.hp.vn",
    phone: "0934567890",
    address: "12 Lê Hồng Phong, Ngô Quyền, Hải Phòng",
    saasPlan: "Starter",
    status: "PENDING",
    createdDate: "2026-05-22"
  },
  {
    id: "CF-106",
    name: "Cánh Buồm Vàng RC Nha Trang",
    providerName: "Phạm Quốc Bảo",
    email: "bao.pham@canhbuomvang.vn",
    phone: "0976543210",
    address: "24 Trần Phú, Nha Trang, Khánh Hòa",
    saasPlan: "Free",
    status: "REJECTED",
    createdDate: "2026-04-18"
  },
  {
    id: "CF-107",
    name: "Speed Zone Biên Hòa",
    providerName: "Đỗ Minh Tâm",
    email: "tam.do@speedzone.vn",
    phone: "0945678901",
    address: "78 Nguyễn Ái Quốc, Biên Hòa, Đồng Nai",
    saasPlan: "Starter",
    status: "SUSPENDED",
    createdDate: "2026-01-20"
  }
]

// 4. Disputes
export const mockAdminDisputes: AdminDispute[] = [
  {
    id: "DS-501",
    bookingId: "BK-8829",
    sessionId: "SS-1204",
    cafeName: "Drift Town Sài Gòn",
    customerName: "Nguyễn Minh Anh",
    type: "DAMAGE_CHARGE",
    status: "OPEN",
    amount: 150000,
    createdDate: "2026-05-23 14:45",
    reason: "Khách hàng không đồng ý với khoản phạt hư hỏng cản trước. Khách hàng cho rằng cản trước đã bị rạn nứt từ trước khi chơi và không phải do lỗi của họ.",
    checkInEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=500", // Car photo front
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "Trầy xước nhẹ (Không rạn nứt)",
        tires: "Lốp bám đường tốt, mâm không trầy",
        chassis: "Khung gầm nguyên vẹn",
        spoiler: "Đuôi gió chắc chắn"
      }
    },
    checkOutEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1617469767053-d3b508a0d7f5?auto=format&fit=crop&q=80&w=500", // Broken front bumper photo
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "RẠN NỨT NẶNG (Do va chạm vào gờ phân cách)",
        tires: "Lốp bình thường",
        chassis: "Khung gầm trầy xước nhẹ",
        spoiler: "Đuôi gió chắc chắn"
      }
    }
  },
  {
    id: "DS-502",
    bookingId: "BK-7612",
    sessionId: "SS-1082",
    cafeName: "RC Cafe Hà Nội Speed",
    customerName: "Trần Gia Huy",
    type: "TIMING",
    status: "UNDER_REVIEW",
    amount: 80000,
    createdDate: "2026-05-22 18:20",
    reason: "Khách khiếu nại nhân viên tính giờ lố. Phiên chơi kết thúc lúc 16:30 nhưng staff ghi nhận 16:45 dẫn đến bị phụ thu phí gia hạn thêm giờ.",
    checkInEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=500",
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "OK",
        tires: "OK",
        chassis: "OK",
        spoiler: "OK"
      }
    },
    checkOutEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=500",
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "OK",
        tires: "OK",
        chassis: "OK",
        spoiler: "OK"
      }
    }
  },
  {
    id: "DS-503",
    bookingId: "BK-4412",
    sessionId: "SS-0994",
    cafeName: "Drift Town Sài Gòn",
    customerName: "Lê Minh Tuấn",
    type: "DAMAGE_CHARGE",
    status: "RESOLVED",
    amount: 300000,
    createdDate: "2026-05-15 19:30",
    reason: "Khách nại đuôi gió sau đã nứt từ trước. Kiểm tra ảnh check-in phát hiện đuôi gió hoàn toàn nguyên vẹn ở check-in.",
    responsibleParty: "CUSTOMER",
    resolutionFavor: "PROVIDER",
    resolutionNote: "Dựa vào ảnh check-in rõ nét lúc 18:00, đuôi gió xe không hề có vết nứt. Vết rách gãy chỉ xuất hiện trên ảnh check-out lúc 19:05. Quyết định thu phí sửa chữa 300,000₫ từ tiền cọc của khách hàng.",
    checkInEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=500",
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "OK",
        tires: "OK",
        chassis: "OK",
        spoiler: "Đuôi gió nguyên vẹn"
      }
    },
    checkOutEvidence: {
      photos: {
        front: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=500",
        back: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=500",
        left: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=500",
        right: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&q=80&w=500"
      },
      checklist: {
        frontBumper: "OK",
        tires: "OK",
        chassis: "OK",
        spoiler: "BỊ RÁCH GÃY MẤT GÓC PHẢI"
      }
    }
  }
]

// 5. Users Database
export const mockAdminUsers: AdminUser[] = [
  { id: "US-201", fullName: "Nguyễn Minh Anh", email: "minhanh@gmail.com", role: "customer", trustScore: 98, status: "ACTIVE", createdDate: "2025-11-20" },
  { id: "US-202", fullName: "Trần Gia Huy", email: "giahuy@gmail.com", role: "customer", trustScore: 85, status: "ACTIVE", createdDate: "2025-12-05" },
  { id: "US-203", fullName: "Lê Minh Tuấn", email: "tuấn.le@outlook.com", role: "customer", trustScore: 100, status: "ACTIVE", createdDate: "2026-01-10" },
  { id: "US-204", fullName: "Nguyễn Văn Hùng", email: "hung.nguyen@drifttown.vn", role: "provider", trustScore: 95, status: "ACTIVE", createdDate: "2026-01-15" },
  { id: "US-205", fullName: "Trần Đức Thắng", email: "thang.tran@hanoispeed.com", role: "provider", trustScore: 92, status: "ACTIVE", createdDate: "2026-02-10" },
  { id: "US-206", fullName: "Đỗ Anh Tuấn", email: "tuấn.staff@drifttown.vn", role: "staff", trustScore: 96, status: "ACTIVE", createdDate: "2026-01-20" },
  { id: "US-207", fullName: "Vũ Thị Lan", email: "lan.vu@driftcafe.hp.vn", role: "provider", trustScore: 88, status: "ACTIVE", createdDate: "2026-05-22" },
  { id: "US-208", fullName: "Phan Quốc Việt", email: "vietphan.banned@gmail.com", role: "customer", trustScore: 35, status: "BANNED", createdDate: "2025-10-01" },
  { id: "US-209", fullName: "Đỗ Minh Tâm", email: "tam.do@speedzone.vn", role: "provider", trustScore: 70, status: "ACTIVE", createdDate: "2026-01-20" }
]

// 6. SaaS Billing & Commission Settlements
export const mockAdminPayments: AdminPayment[] = [
  {
    id: "TX-7001",
    cafeName: "Drift Town Sài Gòn",
    type: "SAAS_SUBSCRIPTION",
    amount: 6800000, // Roughly Professional SaaS fee per month
    status: "SUCCESS",
    paymentMethod: "VNPay",
    date: "2026-05-01 10:00",
    description: "Thanh toán gói SaaS Professional định kỳ tháng 05/2026"
  },
  {
    id: "TX-7002",
    cafeName: "RC Cafe Hà Nội Speed",
    type: "SAAS_SUBSCRIPTION",
    amount: 1100000, // Starter SaaS fee
    status: "SUCCESS",
    paymentMethod: "Momo",
    date: "2026-05-10 14:30",
    description: "Thanh toán gói SaaS Starter định kỳ tháng 05/2026"
  },
  {
    id: "TX-7003",
    cafeName: "Mini Racer Đà Nẵng",
    type: "SAAS_SUBSCRIPTION",
    amount: 6800000,
    status: "SUCCESS",
    paymentMethod: "VietQR",
    date: "2026-05-01 09:15",
    description: "Thanh toán gói SaaS Professional định kỳ tháng 05/2026"
  },
  {
    id: "TX-7004",
    cafeName: "Drift Town Sài Gòn",
    type: "PLATFORM_COMMISSION",
    amount: 48000, // 15% of BK-8829 (320k)
    status: "SUCCESS",
    paymentMethod: "Hệ thống Ledger",
    date: "2026-05-23 15:30",
    description: "Đối soát phí 15% booking BK-8829"
  },
  {
    id: "TX-7005",
    cafeName: "RC Cafe Hà Nội Speed",
    type: "PLATFORM_COMMISSION",
    amount: 18000, // 15% of 120k
    status: "SUCCESS",
    paymentMethod: "Hệ thống Ledger",
    date: "2026-05-23 11:30",
    description: "Đối soát phí 15% booking BK-7612"
  },
  {
    id: "TX-7006",
    cafeName: "RC Off-Road Bình Dương",
    type: "SAAS_SUBSCRIPTION",
    amount: 6800000,
    status: "PENDING",
    paymentMethod: "VNPay",
    date: "2026-05-20 16:40",
    description: "Đăng ký gói SaaS Professional - Yêu cầu kích hoạt ban đầu"
  }
]

// 7. Feature Flags Database
export const mockFeatureFlags: FeatureFlag[] = [
  { key: "ANALYTICS", description: "Báo cáo phân tích và thống kê nâng cao (Biểu đồ, dự báo xu hướng)", status: "DISABLED" },
  { key: "AUTH", description: "Cơ chế xác thực, đăng nhập và phân quyền đa luồng", status: "READY" },
  { key: "BILLING", description: "Cổng thanh toán tự động, đối soát SaaS & Ledger", status: "DISABLED" },
  { key: "BYOC_REGISTRY", description: "Đăng ký và duyệt thiết bị cá nhân (Bring Your Own Car) của khách chơi", status: "READY" },
  { key: "TRUST_SCORE_SYSTEM", description: "Tính toán và cập nhật điểm uy tín người dùng dựa trên hành vi", status: "READY" },
  { key: "INCIDENT_POLICY", description: "Áp dụng biểu phí và chính sách đền bù tự động cho sự cố hư hại xe", status: "READY" },
  { key: "BOT_CONFIG", description: "Module quản trị BOT đàm thoại & hỗ trợ đặt lịch tự động", status: "READY" },
  { key: "BOT_CONFIG.AI", description: "Tích hợp Gemini AI hỗ trợ phản hồi nhanh nhu cầu khách hàng", status: "READY", parentKey: "BOT_CONFIG" },
  { key: "BOT_CONFIG.ANALYTICS", description: "Thu thập thống kê hội thoại tự động của Bot", status: "DISABLED", parentKey: "BOT_CONFIG" },
  { key: "BOT_CONFIG.CHANNELS", description: "Cấu hình tích hợp Bot trên đa kênh Facebook, Zalo, Web Widget", status: "READY", parentKey: "BOT_CONFIG" },
  { key: "BOT_CONFIG.SESSION", description: "Lưu vết ngữ cảnh phiên đàm thoại thông minh", status: "DISABLED", parentKey: "BOT_CONFIG" },
  { key: "AI_REVENUE_ANALYTICS", description: "Bảng phân tích doanh thu bằng AI Gemini trong Provider Dashboard", status: "DISABLED" },
]

// 8. Trust Score Audit Logs
export const mockTrustScoreLogs: TrustScoreLog[] = [
  {
    id: "TSL-8001",
    userId: "US-201",
    userName: "Nguyễn Minh Anh",
    previousScore: 95,
    newScore: 98,
    delta: 3,
    reason: "Thành lập 5 phiên chơi liên tục không gây sự cố hay hủy lịch trễ hạn",
    timestamp: "2026-05-23 15:30"
  },
  {
    id: "TSL-8002",
    userId: "US-202",
    userName: "Trần Gia Huy",
    previousScore: 95,
    newScore: 85,
    delta: -10,
    reason: "Hủy lịch đột xuất (No-show) không thông báo trước 2 tiếng tại RC Cafe Hà Nội Speed",
    timestamp: "2026-05-22 18:20"
  },
  {
    id: "TSL-8003",
    userId: "US-208",
    userName: "Phan Quốc Việt",
    previousScore: 45,
    newScore: 35,
    delta: -10,
    reason: "Từ chối bồi thường hư hại cản trước xe thuê tại Mini Racer Đà Nẵng, gây gổ phá rối",
    timestamp: "2026-05-18 10:15"
  },
  {
    id: "TSL-8004",
    userId: "US-209",
    userName: "Đỗ Minh Tâm",
    previousScore: 75,
    newScore: 70,
    delta: -5,
    reason: "Không kiểm tra quy trình Inspection đầy đủ cho 3 xe khi checkout của khách hàng",
    timestamp: "2026-05-15 21:00"
  }
]
