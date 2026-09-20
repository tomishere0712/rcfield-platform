import { motion, useReducedMotion } from "framer-motion"
import { CalendarCheck, Compass, CreditCard, Flag } from "lucide-react"
import { HowItWorksCard } from "./HowItWorksCard"
import { SectionIntro } from "./SectionIntro"
import { landingViewport, staggerContainer } from "./landing-motion"
import type { HowItWorksStep } from "./landing-types"

const howItWorksSteps: HowItWorksStep[] = [
  {
    number: "01",
    eyebrow: "Khám phá",
    title: "Tìm sân phù hợp",
    description: "Chọn địa điểm, ngày chơi và loại track để lọc đúng cơ sở bạn cần.",
    icon: Compass,
  },
  {
    number: "02",
    eyebrow: "Đặt lịch",
    title: "Chọn giờ & đặt xe",
    description: "Giữ chỗ theo khung giờ trống, kèm xe thuê nếu cần ngay trong một luồng.",
    icon: CalendarCheck,
  },
  {
    number: "03",
    eyebrow: "Xác nhận",
    title: "Thanh toán & nhận lịch",
    description: "Xác nhận lịch nhanh, xem rõ thông tin giữ chỗ và chuẩn bị check-in.",
    icon: CreditCard,
  },
  {
    number: "04",
    eyebrow: "Check-in",
    title: "Nhận xe & vào sân",
    description: "Đến quán, kiểm tra xe cùng nhân viên rồi bắt đầu phiên chơi đúng giờ.",
    icon: Flag,
  },
]

export function HowItWorksSection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section className="relative overflow-hidden bg-[#16191b] py-24 md:py-32">
      {/* Subtle Background Glows & Accent Lines */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[350px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <SectionIntro
          eyebrow="Chỉ 4 bước"
          title="Từ ý định đến phiên chơi trong vài phút."
          description="Luồng đặt sân được rút gọn để bạn tìm đúng cơ sở, xem giờ trống và vào sân nhanh mà không bị rối."
          align="center"
          invert
        />

        <motion.div
          variants={staggerContainer}
          initial={prefersReducedMotion ? false : "hidden"}
          whileInView={prefersReducedMotion ? undefined : "visible"}
          viewport={landingViewport}
          className="mt-14 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {howItWorksSteps.map((step, index) => (
            <HowItWorksCard key={step.number} step={step} index={index} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
