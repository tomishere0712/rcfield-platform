import { useState, useRef } from "react"
import {
  CalendarCheck,
  Camera,
  Clock,
  MapPin,
  Receipt,
  Trophy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { motion } from "framer-motion"

const features = [
  {
    icon: MapPin,
    color: "from-orange-500 to-amber-500",
    title: "Tìm sân gần bạn",
    desc: "Lọc theo thành phố, loại track, giá thuê xe và tiện ích. Xem trực tiếp trên bản đồ trực quan.",
    mockup: (
      <div className="relative h-44 w-full rounded-2xl bg-slate-950 overflow-hidden border border-white/10 flex flex-col justify-end p-4">
        {/* Map grid lines */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Glowing track route path */}
        <svg
          className="absolute inset-0 w-full h-full text-orange-500/20"
          fill="none"
        >
          <path
            d="M 30,80 Q 80,20 150,90 T 260,30"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
        </svg>

        {/* Pulsing focal pin */}
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="h-4 w-4 bg-orange-500 rounded-full animate-ping absolute" />
          <div className="h-4 w-4 bg-orange-500 rounded-full border-2 border-white relative z-10" />
        </div>

        {/* Floating branch tag */}
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="absolute top-6 right-6 bg-slate-900/95 border border-white/10 backdrop-blur-md rounded-xl p-2.5 shadow-2xl flex items-center gap-2"
        >
          <div className="size-6 bg-orange-600 rounded-lg flex items-center justify-center text-white text-3xs font-black">
            RC
          </div>
          <div>
            <p className="text-3xs font-black text-white">RC Arena Sài Gòn</p>
            <p className="text-[9px] font-semibold text-slate-400">
              TP. Hồ Chí Minh · 4.9★
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    icon: CalendarCheck,
    color: "from-emerald-500 to-teal-500",
    title: "Đặt lịch & giữ chỗ",
    desc: "Chọn khung giờ, đặt xe thuê hoặc mang xe cá nhân. Thanh toán toàn bộ chi phí rõ ràng trước khi đến sân.",
    mockup: (
      <div className="h-44 w-full rounded-2xl bg-slate-950 p-4 border border-white/10 flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-2xs font-extrabold text-slate-400">
            CHỌN KHUNG GIỜ
          </span>
          <span className="text-3xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            Hôm nay
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 my-2">
          <div className="rounded-xl border border-white/5 bg-white/5 p-2 text-center opacity-40">
            <p className="text-3xs font-bold text-slate-400">08:00 - 10:00</p>
            <p className="text-[9px] font-black text-red-400 mt-0.5">Hết chỗ</p>
          </div>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-center cursor-pointer"
          >
            <p className="text-3xs font-black text-white">14:00 - 16:00</p>
            <p className="text-[9px] font-black text-emerald-400 mt-0.5">
              Đặt chỗ
            </p>
          </motion.div>
        </div>
        <div className="flex gap-2">
          <span className="text-3xs font-extrabold px-2 py-1 rounded-lg bg-white/5 text-slate-300">
            Xe tự mang
          </span>
          <span className="text-3xs font-extrabold px-2 py-1 rounded-lg bg-orange-600 text-white">
            RENTAL (Thuê xe)
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Camera,
    color: "from-teal-500 to-cyan-500",
    title: "Kiểm tra xe minh bạch",
    desc: "Chụp ảnh 4 góc xe trước và sau phiên chơi. Tránh tranh chấp không đáng có, bảo mật tài sản.",
    mockup: (
      <div className="relative h-44 w-full rounded-2xl bg-slate-950 p-3 border border-white/10 flex flex-col justify-between">
        {/* Photo view frame overlay */}
        <div className="absolute inset-3 border border-dashed border-white/10 rounded-xl pointer-events-none flex items-center justify-center">
          <div className="w-6 h-6 border-t-2 border-l-2 border-cyan-400 absolute top-0 left-0" />
          <div className="w-6 h-6 border-t-2 border-r-2 border-cyan-400 absolute top-0 right-0" />
          <div className="w-6 h-6 border-b-2 border-l-2 border-cyan-400 absolute bottom-0 left-0" />
          <div className="w-6 h-6 border-b-2 border-r-2 border-cyan-400 absolute bottom-0 right-0" />
        </div>

        {/* Small mock car image or shape */}
        <div className="absolute inset-0 flex items-center justify-center opacity-85">
          <div className="w-24 h-14 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center flex-col">
            <span className="text-[10px] font-black text-slate-500">
              CAR PHOTO
            </span>
            <div className="flex gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div className="relative z-10 flex justify-between items-center w-full">
          <span className="text-3xs font-extrabold uppercase tracking-wide text-slate-400 bg-black/60 px-2 py-1 rounded-lg">
            Check-in
          </span>
          <span className="text-3xs font-extrabold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
            Khớp 100%
          </span>
        </div>
        <div className="relative z-10 flex gap-1 justify-end">
          <div className="size-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] font-bold">
            ✓
          </div>
          <span className="text-3xs font-bold text-slate-300">
            Đã xác nhận ngoại quan
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Clock,
    color: "from-sky-500 to-indigo-500",
    title: "Theo dõi phiên đang chạy",
    desc: "Nhận thông báo đếm ngược theo thời gian thực. Gia hạn phiên chơi hoặc gọi món ngay tại chỗ.",
    mockup: (
      <div className="h-44 w-full rounded-2xl bg-slate-950 p-4 border border-white/10 flex flex-col justify-between items-center">
        <div className="flex justify-between items-center w-full border-b border-white/5 pb-2">
          <span className="text-2xs font-extrabold text-slate-400">
            PHIÊN CHƠI LIVE
          </span>
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        </div>

        {/* Countdown Timer */}
        <div className="text-center my-1">
          <motion.p
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-2xl font-black tracking-widest text-white font-mono"
          >
            00:42:19
          </motion.p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Khung giờ: 14:00 - 16:00
          </p>
        </div>

        {/* CTA options */}
        <div className="flex gap-2 w-full justify-center">
          <button className="text-3xs font-extrabold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-500 transition">
            Gia hạn
          </button>
          <button className="text-3xs font-extrabold px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition">
            Gọi món
          </button>
        </div>
      </div>
    ),
  },
  {
    icon: Receipt,
    color: "from-amber-500 to-orange-500",
    title: "Thanh toán rõ ràng",
    desc: "Hóa đơn chi tiết từng khoản mục. Khoản hoàn (nếu có) được đối soát theo chính sách hủy và trạng thái dịch vụ.",
    mockup: (
      <div className="h-44 w-full rounded-2xl bg-slate-950 p-4 border border-white/10 flex flex-col justify-between text-xs">
        <div className="flex justify-between text-3xs font-extrabold text-slate-400 border-b border-white/5 pb-2">
          <span>HÓA ĐƠN CHI TIẾT</span>
          <span>#RC-9402</span>
        </div>
        <div className="space-y-1 my-2 text-[10px]">
          <div className="flex justify-between text-slate-300">
            <span>Tiền thuê sân (2h)</span>
            <span className="font-bold">120.000đ</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Thuê xe drift</span>
            <span className="font-bold">80.000đ</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Đồ ăn & thức uống đặt trước</span>
            <span>30.000đ</span>
          </div>
        </div>
        <div className="flex justify-between items-center border-t border-white/5 pt-2">
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
            Thanh toán an toàn
          </span>
          <span className="text-sm font-black text-white">230.000đ</span>
        </div>
      </div>
    ),
  },
  {
    icon: Trophy,
    color: "from-rose-500 to-pink-500",
    title: "Giải đấu & Vinh danh",
    desc: "Tham gia các giải đấu phong trào tại quán, tranh tài trên bảng xếp hạng Global và tích lũy danh hiệu.",
    mockup: (
      <div className="h-44 w-full rounded-2xl bg-slate-950 p-4 border border-white/10 flex flex-col justify-between">
        <div className="flex justify-between items-center w-full border-b border-white/5 pb-2">
          <span className="text-2xs font-extrabold text-slate-400">
            VINH DANH TOP 1
          </span>
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div className="flex items-center gap-3 my-2">
          <div className="size-10 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 flex items-center justify-center">
            <div className="size-full bg-slate-900 rounded-full flex items-center justify-center font-black text-white text-xs">
              #1
            </div>
          </div>
          <div>
            <p className="text-xs font-black text-white">Minh Tuấn RC</p>
            <p className="text-3xs font-extrabold text-amber-400 uppercase tracking-widest mt-0.5">
              Legendary Driver
            </p>
          </div>
        </div>
        <div className="flex justify-between text-3xs font-bold text-slate-400">
          <span>Best Lap: 14.821s</span>
          <span className="text-emerald-400">Win Rate: 78%</span>
        </div>
      </div>
    ),
  },
]

export function FeatureHighlights() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current
    const maxScroll = scrollWidth - clientWidth
    if (maxScroll > 0) {
      setScrollProgress(scrollLeft / maxScroll)
    }
  }

  const scroll = (direction: "left" | "right") => {
    if (!containerRef.current) return
    const offset = direction === "left" ? -350 : 350
    containerRef.current.scrollBy({ left: offset, behavior: "smooth" })
  }

  return (
    <section
      id="features"
      className="bg-slate-950 text-white py-28 relative overflow-hidden"
    >
      {/* Background decorations like Macbook pages */}
      <div className="absolute top-0 right-1/4 h-[500px] w-[500px] rounded-full bg-orange-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 md:px-6 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-500">
              Mọi thứ bạn cần
            </p>
            <h2 className="text-4xl font-black tracking-tight text-white md:text-5xl leading-tight">
              Từ tìm sân đến vinh danh giải đấu – <br />
              hệ sinh thái RC toàn diện.
            </h2>
          </div>

          {/* Arrow navigation buttons */}
          <div className="flex items-center gap-2.5 mt-6 md:mt-0">
            <button
              onClick={() => scroll("left")}
              className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Macbook Style Horizontal Scroll Container */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide snap-x snap-mandatory touch-pan-x cursor-grab active:cursor-grabbing"
          style={{ scrollbarWidth: "none" }}
        >
          {features.map(({ icon: Icon, color, title, desc, mockup }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: idx * 0.05, duration: 0.6 }}
              className="w-[340px] shrink-0 snap-start rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col justify-between h-[450px] transition-all hover:border-white/20 hover:bg-white/[0.08]"
            >
              {/* Product UI Mockup */}
              <div className="w-full mb-6">{mockup}</div>

              {/* Text Info */}
              <div className="mt-auto">
                <div
                  className={`inline-flex items-center justify-center rounded-xl p-2.5 bg-gradient-to-tr ${color} text-white mb-4 shadow-lg shadow-black/35`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-black text-white mb-2">{title}</h3>
                <p className="text-sm font-medium leading-relaxed text-slate-400">
                  {desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Progress Scroll Indicator Bar */}
        <div className="relative mt-8 h-1 w-full max-w-xs mx-auto bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 left-0 bg-orange-500 rounded-full"
            style={{
              width: `${(scrollProgress * 100).toFixed(2)}%`,
              left: 0,
              right: 0,
            }}
            animate={{ width: `${scrollProgress * 100}%` }}
            transition={{ ease: "easeOut", duration: 0.1 }}
          />
        </div>
      </div>
    </section>
  )
}
