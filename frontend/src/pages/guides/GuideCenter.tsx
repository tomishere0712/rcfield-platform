import { Link } from "react-router"
import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowRight,
  BadgePercent,
  BookOpen,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Coffee,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  PlayCircle,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { cn } from "@/shared/lib/utils"

type GuideRole = "provider" | "staff" | "admin"

type GuideAction = {
  label: string
  to: string
}

type GuideSection = {
  title: string
  description: string
  icon: LucideIcon
  steps: string[]
  action?: GuideAction
}

type GuideDefinition = {
  eyebrow: string
  intro: string
  quickActions: Array<GuideAction & { icon: LucideIcon; description: string }>
  sections: GuideSection[]
}

const guideDefinitions: Record<GuideRole, GuideDefinition> = {
  provider: {
    eyebrow: "Trung tâm trợ giúp",
    intro: "Các bước thiết lập và vận hành dành cho chủ cơ sở. Chọn một tác vụ để đi thẳng đến màn hình tương ứng.",
    quickActions: [
      { label: "Thiết lập cơ sở", description: "Thông tin, sân, giá và lịch hoạt động", icon: Building2, to: routePaths.providerCafes },
      { label: "Xử lý đặt lịch", description: "Theo dõi, xác nhận và điều phối đơn", icon: CalendarDays, to: routePaths.providerBookings },
      { label: "Quản lý đội xe", description: "Danh mục xe, trạng thái và bảo trì", icon: Car, to: routePaths.providerVehicles },
      { label: "Phân quyền nhân sự", description: "Mời và quản lý nhân viên cơ sở", icon: Users, to: routePaths.providerStaff },
    ],
    sections: [
      {
        title: "Thiết lập cơ sở",
        description: "Hoàn thành cấu hình trước khi mở nhận lịch.",
        icon: Building2,
        steps: ["Tạo cơ sở và kiểm tra địa chỉ, thông tin liên hệ.", "Khai báo loại sân, khung giờ hoạt động và cấu hình giá.", "Thêm xe vào đội xe, sau đó kiểm tra trạng thái sẵn sàng."],
        action: { label: "Mở danh sách cơ sở", to: routePaths.providerCafes },
      },
      {
        title: "Vận hành hằng ngày",
        description: "Theo dõi đơn, phiên chạy và nhân sự trong ngày.",
        icon: ClipboardList,
        steps: ["Kiểm tra các đơn chờ xác nhận hoặc sắp đến giờ.", "Điều phối xe sẵn sàng và nhân viên theo từng ca.", "Theo dõi phiên chạy; xử lý xe cần bảo trì trước khi nhận lượt mới."],
        action: { label: "Mở đặt lịch", to: routePaths.providerBookings },
      },
      {
        title: "Phát triển kinh doanh",
        description: "Tăng doanh thu bằng gói chơi, ưu đãi và contest.",
        icon: BadgePercent,
        steps: ["Tạo gói chơi phù hợp với thời lượng và đối tượng khách.", "Tạo ưu đãi có thời hạn, kiểm tra điều kiện áp dụng.", "Dùng contest để thu hút cộng đồng và theo dõi kết quả."],
        action: { label: "Mở gói & giá", to: routePaths.providerPackages },
      },
      {
        title: "Thiết lập dịch vụ bổ sung",
        description: "Cập nhật món, nhân sự và kênh phục vụ khách.",
        icon: Coffee,
        steps: ["Phân loại món trong thực đơn để staff xử lý nhanh.", "Mời đúng nhân sự vào từng cơ sở.", "Rà soát thông tin hiển thị trước khi gửi khách."],
        action: { label: "Mở thực đơn", to: routePaths.providerMenu },
      },
    ],
  },
  staff: {
    eyebrow: "Trợ giúp vận hành",
    intro: "Quy trình ngắn cho ca làm tại cơ sở: nhận ca, đón khách, theo dõi phiên chạy và bàn giao an toàn.",
    quickActions: [
      { label: "Đặt lịch hôm nay", description: "Tra cứu và xử lý khách đến trong ngày", icon: CalendarDays, to: routePaths.staffTodayBookings },
      { label: "Gọi món", description: "Theo dõi và cập nhật trạng thái món", icon: Coffee, to: routePaths.staffFnbOrders },
      { label: "Bảo trì đội xe", description: "Cập nhật xe cần kiểm tra hoặc sửa chữa", icon: Wrench, to: routePaths.staffMaintenance },
    ],
    sections: [
      {
        title: "Bắt đầu ca",
        description: "Kiểm tra bức tranh vận hành trước khi đón khách.",
        icon: LayoutDashboard,
        steps: ["Mở Tổng quan để xem phiên đang chạy và đơn trong ngày.", "Kiểm tra xe cần bảo trì hoặc sự cố còn mở.", "Ưu tiên các đơn sắp đến giờ và khách đã có mặt."],
        action: { label: "Mở tổng quan", to: routePaths.staffDashboard },
      },
      {
        title: "Đón khách và nhận xe",
        description: "Theo đúng luồng đặt lịch để tránh nhận nhầm xe hoặc bỏ sót biên bản.",
        icon: ClipboardList,
        steps: ["Tra cứu mã đặt lịch hoặc quét mã khi khách đến.", "Xác nhận xe được bàn giao đúng trạng thái.", "Mở phiên chạy và ghi nhận các lưu ý cần thiết."],
        action: { label: "Mở đặt lịch hôm nay", to: routePaths.staffTodayBookings },
      },
      {
        title: "Trong và sau phiên chạy",
        description: "Theo dõi an toàn, xử lý phát sinh và hoàn tất bàn giao.",
        icon: PlayCircle,
        steps: ["Theo dõi phiên chạy đang hoạt động.", "Nếu xe có lỗi hoặc hư hỏng, ghi nhận tại biên bản trả xe để tạo phiếu bảo trì.", "Khi trả xe, hoàn tất kiểm tra trước khi đóng phiên."],
        action: { label: "Mở bảo trì đội xe", to: routePaths.staffMaintenance },
      },
      {
        title: "Đội xe và thiết bị",
        description: "Chỉ mở bán xe đang ở trạng thái sẵn sàng.",
        icon: ShieldCheck,
        steps: ["Đưa xe lỗi hoặc cần kiểm tra vào trạng thái bảo trì.", "Ghi rõ hạng mục và kết quả xử lý.", "Chỉ xác nhận sẵn sàng khi xe đã đạt kiểm tra an toàn."],
        action: { label: "Mở bảo trì đội xe", to: routePaths.staffMaintenance },
      },
    ],
  },
  admin: {
    eyebrow: "Sổ tay quản trị",
    intro: "Các quy trình tác động đến toàn nền tảng. Mỗi thao tác nên được kiểm tra dữ liệu và quyền ảnh hưởng trước khi lưu.",
    quickActions: [
      { label: "Duyệt đối tác", description: "Kiểm tra và xử lý hồ sơ cơ sở", icon: Building2, to: routePaths.adminCafes },
      { label: "Quản lý Provider", description: "Theo dõi trạng thái và thông tin đối tác", icon: Users, to: routePaths.adminProviders },
      { label: "Yêu cầu thanh toán", description: "Xử lý các khoản rút tiền cần duyệt", icon: CreditCard, to: routePaths.adminPaymentRequests },
      { label: "Cấu hình hệ thống", description: "Thiết lập thay đổi áp dụng toàn nền tảng", icon: Settings2, to: routePaths.adminFeatureFlags },
    ],
    sections: [
      {
        title: "Duyệt và quản lý Provider",
        description: "Xác thực thông tin trước khi cho cơ sở vận hành.",
        icon: Building2,
        steps: ["Kiểm tra hồ sơ, thông tin cơ sở và trạng thái đăng ký.", "Duyệt hoặc yêu cầu Provider bổ sung thông tin cần thiết.", "Theo dõi Provider sau duyệt để phát hiện vấn đề vận hành sớm."],
        action: { label: "Mở duyệt đối tác", to: routePaths.adminCafes },
      },
      {
        title: "Thương mại và thanh toán",
        description: "Quản lý gói SaaS và các khoản thanh toán có tác động tài chính.",
        icon: CreditCard,
        steps: ["Rà soát điều kiện yêu cầu thanh toán trước khi duyệt.", "Cấu hình gói với giá, quyền lợi và trạng thái rõ ràng.", "Kiểm tra thanh toán SaaS và đối soát bất thường."],
        action: { label: "Mở yêu cầu thanh toán", to: routePaths.adminPaymentRequests },
      },
      {
        title: "AI, nội dung và kênh",
        description: "Quản trị thông tin mà khách và Provider có thể nhận được.",
        icon: MessageCircle,
        steps: ["Cập nhật Knowledge Base bằng thông tin đã được xác thực.", "Kiểm tra cấu hình Chat Widget và kênh Messenger trước khi áp dụng.", "Duy trì nội dung nhất quán, không đưa dữ liệu nội bộ vào kênh công khai."],
        action: { label: "Mở Knowledge Base", to: routePaths.adminKnowledgeBase },
      },
      {
        title: "Cấu hình toàn hệ thống",
        description: "Dùng cho thay đổi có phạm vi toàn nền tảng.",
        icon: Settings2,
        steps: ["Xác định phạm vi đối tượng và thời điểm có hiệu lực.", "Rà soát tác động đến Provider, Staff và khách hàng.", "Lưu cấu hình, sau đó kiểm tra lại chức năng liên quan."],
        action: { label: "Mở cấu hình hệ thống", to: routePaths.adminFeatureFlags },
      },
    ],
  },
}

function searchText(section: GuideSection) {
  return [section.title, section.description, ...section.steps, section.action?.label ?? ""].join(" ").toLocaleLowerCase("vi")
}

export function GuideCenter({ role }: { role: GuideRole }) {
  const [query, setQuery] = useState("")
  const guide = guideDefinitions[role]
  const normalizedQuery = query.trim().toLocaleLowerCase("vi")
  const visibleSections = useMemo(
    () => (normalizedQuery ? guide.sections.filter((section) => searchText(section).includes(normalizedQuery)) : guide.sections),
    [guide.sections, normalizedQuery],
  )

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/90 px-3 py-1 text-xs font-bold text-orange-700">
              <BookOpen className="size-3.5" />
              {guide.eyebrow}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1c1b1b] md:text-3xl">
              Bạn cần thực hiện việc gì?
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-[#5f6263]">{guide.intro}</p>
          </div>
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-[#747878]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tác vụ hoặc quy trình"
              className="h-11 w-full rounded-xl border border-[#c4c7c8] bg-white pl-10 pr-4 text-sm font-medium text-[#1c1b1b] outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>
        </div>
      </section>

      {!normalizedQuery ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <CircleHelp className="size-4.5 text-orange-600" />
            <h2 className="text-base font-extrabold text-[#1c1b1b]">Tác vụ nhanh</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {guide.quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <Icon className="size-5" />
                    </span>
                    <ArrowRight className="size-4 text-[#b0b4b4] transition group-hover:translate-x-0.5 group-hover:text-orange-600" />
                  </div>
                  <p className="mt-4 text-sm font-extrabold text-[#1c1b1b]">{action.label}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#747878]">{action.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#1c1b1b]">{normalizedQuery ? "Kết quả hướng dẫn" : "Quy trình theo vai trò"}</h2>
            <p className="mt-0.5 text-xs font-medium text-[#747878]">
              {normalizedQuery ? `${visibleSections.length} mục phù hợp với “${query.trim()}”` : "Làm lần lượt các bước để hạn chế sót tác vụ."}
            </p>
          </div>
          {!normalizedQuery ? <span className="hidden rounded-full bg-[#f6f3f2] px-2.5 py-1 text-xs font-bold text-[#747878] sm:inline-flex">{visibleSections.length} quy trình</span> : null}
        </div>

        {visibleSections.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleSections.map((section) => {
              const Icon = section.icon
              return (
                <article key={section.title} className="rounded-2xl border border-[#e5e2e1] bg-white p-5 shadow-sm">
                  <div className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff3eb] text-orange-600">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-[#1c1b1b]">{section.title}</h3>
                      <p className="mt-1 text-sm font-medium leading-5 text-[#747878]">{section.description}</p>
                    </div>
                  </div>
                  <ol className="mt-5 space-y-3">
                    {section.steps.map((step, index) => (
                      <li key={step} className="flex gap-3 text-sm font-medium leading-5 text-[#444748]">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#f6f3f2] text-[11px] font-extrabold text-[#747878]">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {section.action ? (
                    <Link
                      to={section.action.to}
                      className={cn("mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-orange-700 transition hover:text-orange-800")}
                    >
                      {section.action.label}
                      <ArrowRight className="size-4" />
                    </Link>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#c4c7c8] bg-white px-6 py-12 text-center">
            <Search className="mx-auto size-6 text-[#b0b4b4]" />
            <p className="mt-3 font-extrabold text-[#1c1b1b]">Chưa tìm thấy hướng dẫn phù hợp</p>
            <button type="button" onClick={() => setQuery("")} className="mt-2 text-sm font-bold text-orange-700 hover:text-orange-800">
              Xem tất cả quy trình
            </button>
          </div>
        )}
      </section>

      <section className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
        <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-amber-700" />
        <p className="font-medium leading-5">
          Trước khi lưu một thay đổi quan trọng, hãy kiểm tra phạm vi ảnh hưởng và dữ liệu liên quan. Với thao tác tài chính hoặc cấu hình toàn hệ thống, cần rà soát lại kết quả sau khi thực hiện.
        </p>
      </section>
    </div>
  )
}
