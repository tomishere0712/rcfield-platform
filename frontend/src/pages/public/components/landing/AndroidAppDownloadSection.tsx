import { motion, useReducedMotion } from "framer-motion"
import { Download, QrCode, ShieldCheck, Smartphone, CheckCircle2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { fadeUpItem, landingViewport, staggerContainer } from "./landing-motion"

export const ANDROID_APK_URL =
  "https://expo.dev/artifacts/eas/0YSsMEBiyX4FohWjob7K6wpNXQqXft606EXQLpSyAVc.apk"

export function AndroidAppDownloadSection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section className="relative overflow-hidden bg-slate-950 py-20 text-white md:py-24">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-orange-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-emerald-600/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          variants={staggerContainer}
          initial={prefersReducedMotion ? false : "hidden"}
          whileInView={prefersReducedMotion ? undefined : "visible"}
          viewport={landingViewport}
          className="grid gap-12 lg:grid-cols-12 lg:items-center"
        >
          {/* Left Column: Info & Download Actions */}
          <motion.div variants={fadeUpItem} className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-400 backdrop-blur-md">
              <Smartphone className="h-4 w-4" />
              <span>RCField App Mobile for Android</span>
            </div>

            <h2 className="text-4xl font-black tracking-tight text-white md:text-4xl lg:leading-[1.1]">
              Trải nghiệm RCField mượt mà hơn trên <span className="text-orange-400">Ứng dụng Android</span>
            </h2>

            <p className="max-w-xl text-base font-medium leading-relaxed text-slate-300 md:text-lg">
              Tải ứng dụng RCField phiên bản Android chính thức (file APK). Đặt sân đua, theo dõi hành trình giải đấu, nhận thông báo tức thì và quét mã QR check-in tiện lợi chỉ với một chạm.
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                "Đặt lịch & Thuê xe siêu nhanh",
                "Mã QR Check-in điểm danh tại sân",
                "Theo dõi sơ đồ thi đấu Realtime",
                "Thông báo Push Notification ngay tức thì",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{text}</span>
                </div>
              ))}
            </div>

            {/* Download Button */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-2xl bg-gradient-to-r from-orange-600 to-orange-500 px-8 text-base font-black text-white shadow-lg shadow-orange-600/30 hover:from-orange-500 hover:to-orange-400 transition-all transform hover:-translate-y-0.5"
              >
                <a href={ANDROID_APK_URL} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2.5 h-5 w-5" />
                  Tải RCField APK (Android)
                </a>
              </Button>

              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300 backdrop-blur-md">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>An toàn · Phiên bản v1.0</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Visual Mockup / Badge Box */}
          <motion.div variants={fadeUpItem} className="lg:col-span-5">
            <div className="relative mx-auto max-w-md rounded-[32px] border border-white/15 bg-gradient-to-b from-white/10 to-white/5 p-8 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div className="flex items-center gap-3">
                  <img
                    src="/brand/rcfield-logo.png"
                    alt="RCField Logo"
                    className="h-12 w-12 rounded-2xl border border-white/10 bg-white object-contain p-1 shadow-md"
                  />
                  <div>
                    <h3 className="text-lg font-black text-white">RCField Mobile</h3>
                    <p className="text-xs text-slate-400 font-medium">Bản Android APK chính thức</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-black text-emerald-400">
                  Ready
                </span>
              </div>

              <div className="my-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center">
                  <p className="text-xs font-bold text-slate-300 mb-2">Quét mã để tải nhanh về điện thoại</p>
                  <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-xl bg-white p-2 shadow-inner">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(ANDROID_APK_URL)}`}
                      alt="QR Code Tải App RCField APK"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <p className="mt-2.5 text-[10px] font-semibold text-slate-400">
                    Dùng camera điện thoại Android để quét & tải trực tiếp
                  </p>
                </div>
              </div>

              <a
                href={ANDROID_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 py-3 text-xs font-bold text-white transition-colors"
              >
                <QrCode className="h-4 w-4 text-orange-400" />
                <span>Hoặc bấm vào đây để tải trực tiếp file .apk</span>
              </a>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
