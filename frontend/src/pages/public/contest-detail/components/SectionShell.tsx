import type { ReactNode } from "react"
import { motion } from "framer-motion"

import { useSectionEntrance } from "@/shared/lib/motion"
import { cn } from "@/shared/lib/utils"

/**
 * Tông nền của một dải nội dung. Trang chi tiết giải đấu xen kẽ các tông này
 * để mắt người đọc có điểm nghỉ giữa các phần, thay vì đọc một chuỗi thẻ giống hệt nhau.
 */
export type SectionTone = "light" | "muted" | "warm" | "dark"

const TONE_CLASS: Record<SectionTone, string> = {
  light: "bg-white text-slate-900",
  muted: "bg-slate-50 text-slate-900",
  warm: "bg-gradient-to-b from-amber-50/80 via-orange-50/40 to-white text-slate-900",
  dark: "bg-brand-dark text-white",
}

/**
 * Một dải nội dung chiếm trọn bề ngang màn hình.
 *
 * `scroll-mt` chừa chỗ cho header nổi (~68–76px) cộng thanh điều hướng phần (~56px),
 * để khi bấm mục lục thì tiêu đề phần không bị hai thanh đó che mất.
 */
export function PageSection({
  id,
  tone = "light",
  className,
  children,
}: {
  id?: string
  tone?: SectionTone
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-[136px] py-16 sm:py-20 lg:py-24",
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">{children}</div>
    </section>
  )
}

/**
 * Tiêu đề mở đầu một phần: nhãn nhỏ → tiêu đề lớn → câu dẫn.
 * Cùng một nhịp với các section ở trang chủ để hai trang nói chung một ngôn ngữ.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = "light",
  action,
  className,
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  tone?: SectionTone
  action?: ReactNode
  className?: string
}) {
  const isDark = tone === "dark"

  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        <p
          className={cn(
            "text-xs font-black uppercase tracking-[0.2em]",
            isDark ? "text-brand-amber" : "text-orange-600",
          )}
        >
          {eyebrow}
        </p>
        <h2
          className={cn(
            "mt-3 text-3xl font-black leading-tight tracking-tight md:text-4xl",
            isDark ? "text-white" : "text-slate-900",
          )}
        >
          {title}
        </h2>
        {lead ? (
          <p
            className={cn(
              "mt-4 text-sm font-medium leading-7 md:text-base",
              isDark ? "text-white/70" : "text-slate-600",
            )}
          >
            {lead}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Bọc nội dung để nó trôi lên khi lọt vào khung nhìn (tôn trọng reduced-motion). */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode
  index?: number
  className?: string
}) {
  const variants = useSectionEntrance()

  return (
    <motion.div
      className={className}
      variants={variants}
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </motion.div>
  )
}
