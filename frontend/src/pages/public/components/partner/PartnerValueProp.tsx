import { Bot, RefreshCw, Camera } from "lucide-react"

const benefits = [
  {
    icon: Bot,
    title: "AI tư vấn 24/7",
    desc: "Chatbot AI được huấn luyện theo thông tin sân của bạn, tự trả lời câu hỏi về giá, xe, lịch trống.",
  },
  {
    icon: RefreshCw,
    title: "Quản lý tự động",
    desc: "Ghi nhận số, nhận Zalo, nhận tiền mặt — dễ dàng quản lý khi có nhiều khách cùng một lúc.",
  },
  {
    icon: Camera,
    title: "Bàn giao minh bạch",
    desc: "Check-in/out bằng ảnh 4 góc, không còn tranh chấp về tình trạng xe trước và sau khi chơi.",
  },
]

export function PartnerValueProp() {
  return (
    <section className="relative">
      {/* Dark Header part */}
      <div className="bg-slate-900 pt-24 pb-40 text-center relative overflow-hidden">
        {/* Subtle orange accent glow */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-64 w-96 rounded-full bg-[#ff6b00]/10 blur-3xl pointer-events-none" />
        
        <div className="mx-auto max-w-7xl px-4 md:px-6 relative z-10">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6b00]">
            DÀNH CHO CHỦ SÂN RC CAFE
          </p>
          <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            Vận hành chuyên nghiệp, tối ưu doanh thu
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
            RCField giúp chủ sân tự động hoá đặt lịch, bàn giao xe có bằng chứng, và tư vấn khách qua AI — tất cả trong một nền tảng.
          </p>
        </div>
      </div>

      {/* Light Cards part */}
      <div className="bg-slate-50 pb-24">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          {/* Overlapping Benefits Grid */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 -mt-20 relative z-20">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-[8px] border border-slate-100 bg-white p-8 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-[8px] bg-orange-50 text-[#ff6b00]">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-900 group-hover:text-[#ff6b00] transition-colors duration-300">
                  {title}
                </h3>
                <p className="text-sm font-medium leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
