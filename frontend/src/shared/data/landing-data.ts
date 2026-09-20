export interface Feature {
  id: string
  title: string
  description: string
  icon: string
}

export interface LiveSession {
  track: string
  user: string
  details: string
  timeRemaining: string
  status: "active" | "warning"
}

export interface PricingPlan {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  isPopular?: boolean
  cta: string
}

export interface FAQItem {
  question: string
  answer: string
}

export const liveSessionsData: LiveSession[] = [
  {
    track: "Track 1 - Drift Pro",
    user: "Hoàng Minh",
    details: "Thuê xe RX-7 Drift Spec",
    timeRemaining: "45:20",
    status: "active",
  },
  {
    track: "Track 2 - Circuit",
    user: "Ngọc Linh",
    details: "Mang xe cá nhân",
    timeRemaining: "12:05",
    status: "warning",
  },
  {
    track: "Track 3 - Offroad Arena",
    user: "Minh Tuấn",
    details: "Thuê xe Buggy Monster",
    timeRemaining: "28:15",
    status: "active",
  },
]

export const recentInspectionsData = [
  {
    vehicleCode: "RC-DRIFT-04",
    type: "Post-session (Sau phiên chạy)",
    status: "Đã duyệt - Không hư hại",
    time: "5 phút trước",
    staff: "Nguyễn Văn Hùng",
  },
  {
    vehicleCode: "RC-BUGGY-02",
    type: "Pre-session (Trước phiên chạy)",
    status: "Phát hiện vết xước nhẹ (Ghi chú)",
    time: "15 phút trước",
    staff: "Trần Minh Tâm",
  },
]

export const playerFeatures: Feature[] = [
  {
    id: "find-cafe",
    title: "Tìm sân dễ dàng",
    description:
      "Khám phá các quán RC Cafe gần bạn nhất, xem xếp hạng, bản đồ chi tiết và tình trạng track trống theo thời gian thực.",
    icon: "MapPin",
  },
  {
    id: "booking-pay",
    title: "Đặt lịch & Thanh toán",
    description:
      "Chọn khung giờ, thuê xe tại quán hoặc đăng ký mang xe cá nhân. Thanh toán trực tuyến nhanh chóng, giữ lịch ngay lập tức.",
    icon: "CalendarCheck",
  },
  {
    id: "checkin-4",
    title: "Check-in 4 góc minh bạch",
    description:
      "Chụp ảnh kiểm tra 4 góc xe thuê trước khi nhận sân để tránh mọi tranh chấp không đáng có.",
    icon: "Camera",
  },
  {
    id: "active-session",
    title: "Theo dõi phiên chơi Live",
    description:
      "Nhận thông báo đếm ngược thời gian chơi, quản lý dịch vụ ăn uống F&B trực tiếp tại chỗ thuận tiện.",
    icon: "Clock",
  },
  {
    id: "checkout-rate",
    title: "Check-out nhanh chóng",
    description:
      "Bàn giao xe, nghiệm thu tình trạng, đối soát hóa đơn, hoàn tất thanh toán cuối cùng và đánh giá dịch vụ.",
    icon: "Receipt",
  },
]

export const providerFeatures: Feature[] = [
  {
    id: "branch-manage",
    title: "Quản lý chuỗi chi nhánh",
    description:
      "1 Provider quản lý toàn bộ chuỗi từ một dashboard: cấu hình giờ mở cửa, sức chứa, loại track và đội xe riêng cho từng chi nhánh.",
    icon: "UserCheck",
  },
  {
    id: "track-config",
    title: "Cấu hình sân & Dịch vụ",
    description:
      "Dễ dàng thiết lập các loại đường đua (drift, off-road), phân loại xe cho thuê, giá vé, và menu đồ ăn đồ uống (F&B).",
    icon: "Sliders",
  },
  {
    id: "booking-manage",
    title: "Quản lý Booking thông minh",
    description:
      "Xem trực quan sơ đồ đặt lịch, tự động kiểm soát chồng chéo khung giờ, duyệt thanh toán qua hệ thống Ledger.",
    icon: "Calendar",
  },
  {
    id: "revenue-split",
    title: "Đối soát & Báo cáo Doanh thu",
    description:
      "Tự động phân tách doanh thu từ vé sân, phí thuê xe và dịch vụ đi kèm. Xuất báo cáo trực quan dạng biểu đồ.",
    icon: "TrendingUp",
  },
]

export const pricingPlans: PricingPlan[] = [
  {
    name: "Starter",
    price: "499,000đ",
    period: "tháng",
    description: "Phù hợp cho các quán cafe xe RC mới mở hoặc quy mô nhỏ.",
    features: [
      "Quản lý tối đa 2 track chơi",
      "Quản lý tối đa 5 xe cho thuê",
      "Đặt lịch & quản lý slot cơ bản",
      "Tích hợp quét mã QR thanh toán",
      "Hỗ trợ qua email trong 24h",
    ],
    cta: "Bắt đầu miễn phí",
  },
  {
    name: "Pro",
    price: "1,499,000đ",
    period: "tháng",
    description:
      "Dành cho các sân đua chuyên nghiệp và lưu lượng khách ổn định.",
    features: [
      "Không giới hạn số lượng track & xe",
      "Quy trình nghiêm ngặt Serious Inspection (4 góc)",
      "Quản lý ca trực & phân quyền nhân viên",
      "Hệ thống báo cáo doanh thu & đối soát chi tiết",
      "Hỗ trợ trực tuyến 24/7",
    ],
    isPopular: true,
    cta: "Dùng thử 14 ngày",
  },
  {
    name: "Enterprise",
    price: "Liên hệ",
    period: "tùy biến",
    description: "Hệ thống quản lý chuỗi, đa chi nhánh với cấu hình mạnh mẽ.",
    features: [
      "Đầy đủ mọi tính năng của gói Pro",
      "Quản lý tập trung đa chi nhánh/sân đua",
      "Tích hợp API mở với POS và phần mềm kế toán",
      "Hạ tầng máy chủ riêng & SLA cam kết 99.9%",
      "Chuyên viên hỗ trợ kỹ thuật trực tiếp",
    ],
    cta: "Liên hệ tư vấn",
  },
]

export const faqsData: FAQItem[] = [
  {
    question: "Quy trình đặt lịch và thanh toán hoạt động như thế nào?",
    answer:
      "Khi booking được xác nhận, toàn bộ phí slot, phí thuê xe và F&B đặt trước được ghi nhận chi tiết dưới dạng các component độc lập trên Ledger. Sau khi phiên chơi hoàn tất, doanh thu được đối soát và giải ngân về Provider sau khi khấu trừ phí nền tảng theo chính sách.",
  },
  {
    question: "Ai chịu trách nhiệm khi xe thuê bị hỏng hóc trong phiên chơi?",
    answer:
      "Nhờ vào quy trình 'Serious Inspection' bắt buộc chụp ảnh 4 góc trước và sau mỗi phiên thuê xe, hệ thống sẽ lưu trữ bằng chứng rõ ràng. Nếu xảy ra hư hỏng, nhân viên sẽ ghi nhận chi tiết, hệ thống tự động tính toán chi phí sửa chữa dựa trên bảng giá linh kiện đã cấu hình. Khách hàng sẽ thanh toán khoản bồi thường này tại quầy khi check-out. Tranh chấp (nếu có) sẽ được gửi lên ban quản trị Admin xử lý.",
  },
  {
    question:
      "Quán của tôi đang sử dụng phần mềm POS cafe khác, có thể tích hợp không?",
    answer:
      "Hoàn toàn được. Ở gói Enterprise, RCField cung cấp hệ thống API mở giúp kết nối đồng bộ hóa dữ liệu đặt sân trực tuyến với phần mềm POS cafe hiện tại của bạn, bảo đảm số liệu doanh thu F&B và đặt lịch luôn nhất quán.",
  },
  {
    question: "Nếu khách hàng đến trễ so với khung giờ đã đặt trước thì sao?",
    answer:
      "Khung giờ đặt lịch được giữ nguyên. Nếu khách đến trễ, phiên chơi thực tế (Session) sẽ bắt đầu muộn hơn nhưng thời lượng được tính từ lúc thực tế check-in. Nếu không check-in trong khoảng thời gian quy định, booking sẽ chuyển trạng thái NO_SHOW và được xử lý theo chính sách hủy lịch.",
  },
]
export type LandingStat = {
  label: string
  value: string
}

export type LandingFeature = {
  title: string
  description: string
  icon: "map" | "calendar" | "shield" | "car"
}

export type LandingStep = {
  title: string
  description: string
}

export const landingStats: LandingStat[] = [
  { label: "cơ sở RC Cafe", value: "50+" },
  { label: "phiên chơi hoàn tất", value: "12k+" },
  { label: "đánh giá tích cực", value: "4.8/5" },
]

export const landingFeatures: LandingFeature[] = [
  {
    title: "Tìm sân theo nhu cầu",
    description:
      "Lọc nhanh theo thành phố, loại track, giá thuê xe và tiện ích tại quán.",
    icon: "map",
  },
  {
    title: "Đặt lịch rõ ràng",
    description:
      "Chuyển thẳng từ form đặt nhanh sang danh sách cơ sở phù hợp để giữ chỗ.",
    icon: "calendar",
  },
  {
    title: "Serious Inspection",
    description:
      "Ưu tiên các cơ sở có quy trình kiểm xe minh bạch trước và sau phiên chơi.",
    icon: "shield",
  },
  {
    title: "Xe thuê sẵn sàng",
    description: "Xem nhanh đội xe của từng cơ sở và đặt kèm xe khi cần.",
    icon: "car",
  },
]

export const landingSteps: LandingStep[] = [
  {
    title: "Chọn lịch chơi",
    description:
      "Nhập thành phố, ngày chơi và dòng xe hoặc loại đường đua muốn trải nghiệm.",
  },
  {
    title: "So sánh cơ sở",
    description: "Xem rating, tiện ích, mức giá và xe đang có ở từng RC Cafe.",
  },
  {
    title: "Giữ chỗ nhanh",
    description:
      "Chọn cơ sở phù hợp rồi chuyển sang luồng tạo booking với cafe và xe đã chọn.",
  },
]

export const quickBookingVehicleOptions = [
  { value: "all", label: "Tất cả loại xe" },
  { value: "Drift", label: "Drift 1:10" },
  { value: "Offroad", label: "Offroad / Buggy" },
  { value: "Touring", label: "Touring" },
  { value: "Mini", label: "Mini-Z" },
]
