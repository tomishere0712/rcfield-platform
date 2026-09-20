import { CalendarCheck, Camera, Bot, BarChart3, CheckCircle2, Phone, Video, Send, Smile } from "lucide-react"
import { FEATURES } from "./partner-data"

// ─── Inline JSX mockups ───────────────────────────────────────────────────────

function BookingCalendarMockup() {
  const slots = [
    { time: "09:00", booked: true },
    { time: "10:00", booked: true },
    { time: "11:00", booked: false },
    { time: "12:00", booked: false },
    { time: "13:00", booked: true },
    { time: "14:00", booked: false },
  ]
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
      <p className="mb-3 text-xs font-bold text-slate-400">Slot hôm nay · Thứ Tư</p>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((s) => (
          <div
            key={s.time}
            className={`rounded-lg px-2 py-2 text-center text-xs font-semibold ${
              s.booked
                ? "bg-orange-500/20 text-orange-400"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {s.time}
            <div className="mt-0.5 text-[9px] opacity-70">{s.booked ? "Đã đặt" : "Trống"}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VehicleHandoffMockup() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
      <p className="mb-3 text-xs font-bold text-slate-400">Check-in · Traxxas Slash 4x4</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {["Trước", "Sau", "Trái", "Phải"].map((side) => (
          <div
            key={side}
            className="aspect-square rounded-lg bg-slate-800 flex items-center justify-center border border-white/5"
          >
            <div className="text-center">
              <Camera className="mx-auto mb-1 size-4 text-slate-500" />
              <span className="text-[9px] text-slate-500">{side}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2">
        <CheckCircle2 className="size-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-400">Khách đã xác nhận</span>
      </div>
    </div>
  )
}

function AIChatMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1c1e21] shadow-2xl">
      {/* Messenger-style header */}
      <div className="flex items-center gap-3 border-b border-white/8 bg-[#242526] px-4 py-3">
        <div className="relative shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/25 ring-2 ring-orange-500/30">
            <Bot className="size-4 text-orange-400" />
          </div>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#242526]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">RC Bot</p>
          <p className="text-[11px] leading-tight text-emerald-400">Đang hoạt động</p>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-orange-400 hover:bg-white/8 transition-colors">
            <Phone className="size-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-orange-400 hover:bg-white/8 transition-colors">
            <Video className="size-4" />
          </button>
        </div>
      </div>

      {/* Chat body */}
      <div className="flex flex-col gap-1 px-4 py-4">
        {/* Date separator */}
        <p className="mb-2 text-center text-[10px] text-slate-500">Hôm nay, 13:47</p>

        {/* Customer message (right — like "you" in Messenger) */}
        <div className="flex justify-end">
          <div className="max-w-[72%] rounded-2xl rounded-br-md bg-[#0084ff] px-3 py-2 text-xs leading-relaxed text-white">
            Sân có xe Traxxas không? Em mới chơi lần đầu
          </div>
        </div>

        {/* Bot messages (left — like "them" in Messenger) */}
        <div className="flex items-end gap-2 mt-1">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/25">
            <Bot className="size-3 text-orange-400" />
          </div>
          <div className="max-w-[72%] rounded-2xl rounded-bl-md bg-[#3a3b3c] px-3 py-2 text-xs leading-relaxed text-slate-100">
            Dạ có ạ! Sân em có Traxxas Slash 4x4 rất phù hợp cho người mới.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-6 shrink-0" /> {/* spacer for avatar alignment */}
          <div className="max-w-[72%] rounded-2xl rounded-bl-md bg-[#3a3b3c] px-3 py-2 text-xs leading-relaxed text-slate-100">
            Slot gần nhất còn trống 14:00 hôm nay, bạn muốn đặt không?
          </div>
        </div>

        {/* Customer reply */}
        <div className="mt-1 flex justify-end">
          <div className="max-w-[72%] rounded-2xl rounded-br-md bg-[#0084ff] px-3 py-2 text-xs leading-relaxed text-white">
            Đặt luôn anh ơi!
          </div>
        </div>

        {/* Seen indicator */}
        <div className="mt-0.5 flex justify-end">
          <p className="text-[10px] text-slate-500">Đã xem · 13:52</p>
        </div>

        {/* Bot sends booking link */}
        <div className="flex items-end gap-2 mt-1">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/25">
            <Bot className="size-3 text-orange-400" />
          </div>
          <div className="max-w-[72%] space-y-1.5">
            <div className="rounded-2xl rounded-bl-md bg-[#3a3b3c] px-3 py-2 text-xs leading-relaxed text-slate-100">
              Bạn dùng link này để xác nhận đặt sân nhé!
            </div>
            {/* Link card — Zalo OA style */}
            <div className="rounded-xl border border-white/10 bg-[#f0f0f0] px-4 py-3 text-center">
              <p className="text-xs font-bold text-[#1c1e21]">RC Cafe · Đặt sân ngay</p>
            </div>
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 border-t border-white/8 bg-[#242526] px-3 py-2.5">
        <button className="shrink-0 text-orange-400">
          <Smile className="size-5" />
        </button>
        <div className="flex-1 rounded-full bg-[#3a3b3c] px-3.5 py-1.5 text-xs text-slate-500">
          Nhắn tin...
        </div>
        <button className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-orange-400">
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function AnalyticsMockup() {
  const bars = [40, 65, 45, 80, 55, 90, 70]
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-xl">
      <p className="mb-1 text-xs font-bold text-slate-400">Doanh thu 7 ngày</p>
      <p className="mb-4 text-xl font-black text-white">16.8tr <span className="text-sm font-semibold text-emerald-400">↑ 24%</span></p>
      <div className="flex items-end gap-1.5 h-16">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-orange-500/70 transition-all"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] text-slate-600">
        {["T2","T3","T4","T5","T6","T7","CN"].map(d => <span key={d}>{d}</span>)}
      </div>
    </div>
  )
}

const MOCKUPS = [BookingCalendarMockup, VehicleHandoffMockup, AIChatMockup, AnalyticsMockup]
const ICONS = [
  <CalendarCheck className="size-4 text-orange-400" />,
  <Camera className="size-4 text-orange-400" />,
  <Bot className="size-4 text-orange-400" />,
  <BarChart3 className="size-4 text-orange-400" />,
]

export function PartnerFeatures() {
  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-orange-500">
            Tính năng
          </p>
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Mọi thứ bạn cần, trong một app
          </h2>
        </div>

        {/* Alternating feature rows */}
        <div className="space-y-24">
          {FEATURES.map((feature, i) => {
            const MockupComponent = MOCKUPS[i]
            const isReversed = feature.imagePosition === "left"

            return (
              <div
                key={feature.title}
                className={`flex flex-col gap-12 lg:items-center lg:gap-16 ${
                  isReversed ? "lg:flex-row-reverse" : "lg:flex-row"
                }`}
              >
                {/* Text column */}
                <div className="flex-1 space-y-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600">
                    {ICONS[i]}
                    {feature.eyebrow}
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 md:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="text-base leading-7 text-slate-600">{feature.description}</p>
                  <ul className="space-y-3">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Visual column */}
                <div className="flex-1">
                  {MockupComponent && <MockupComponent />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
