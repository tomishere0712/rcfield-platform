import { motion } from "framer-motion"

const steps = [
  {
    number: 1,
    title: "Đăng ký & Cấu hình",
    desc: "Tạo tài khoản Provider, nhập thông tin sân và danh sách xe trong vài phút.",
  },
  {
    number: 2,
    title: "Nhận đặt lịch tự động",
    desc: "Khách tìm sân, chọn xe, đặt lịch và thanh toán online — không cần nhân viên can thiệp.",
  },
  {
    number: 3,
    title: "Bàn giao có bằng chứng",
    desc: "Check-in/out bằng ảnh trực tiếp trên app — bảo vệ tài sản sân, không còn tranh chấp.",
  },
]

export function PartnerHowItWorks() {
  return (
    <section className="bg-slate-900 py-24 text-white relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#ff6b00]/10 blur-3xl pointer-events-none" />
      <div className="absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-orange-600/5 blur-3xl pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-4 md:px-6 relative z-10">
        {/* Header */}
        <div className="mb-20 text-center">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff6b00]">
            Quy trình
          </p>
          <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            Bắt đầu trong 3 bước đơn giản
          </h2>
        </div>

        {/* Steps Horizontal Roadmap */}
        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Connecting lines for desktop (md and up) */}
          <div className="absolute top-8 left-[16.6%] right-[16.6%] hidden h-0.5 bg-slate-800 md:block" aria-hidden="true">
            <motion.div 
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="h-full bg-gradient-to-r from-[#ff6b00] to-orange-500"
            />
          </div>

          {steps.map((step) => (
            <div
              key={step.number}
              className="relative flex flex-col items-center text-center group"
            >
              {/* Numbered circle anchor */}
              <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#ff6b00] text-xl font-black text-white shadow-lg shadow-[#ff6b00]/25 ring-8 ring-slate-900 transition-transform duration-300 group-hover:scale-110">
                {step.number}
              </div>

              {/* Step contents */}
              <h3 className="mb-3 text-xl font-bold text-white group-hover:text-[#ff6b00] transition-colors duration-300">
                {step.title}
              </h3>
              <p className="max-w-xs text-sm font-medium leading-relaxed text-slate-400">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
