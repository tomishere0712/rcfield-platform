import { motion, useReducedMotion } from "framer-motion"
import { fadeUpItem } from "./landing-motion"
import type { HowItWorksStep } from "./landing-types"

interface HowItWorksCardProps {
  step: HowItWorksStep
  index?: number
}

export function HowItWorksCard({ step, index = 0 }: HowItWorksCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const Icon = step.icon

  return (
    <motion.article
      variants={fadeUpItem}
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView={prefersReducedMotion ? undefined : "visible"}
      viewport={{ once: true }}
      whileHover={prefersReducedMotion ? undefined : { y: -8, transition: { duration: 0.25 } }}
      className="group relative flex h-full flex-col items-center justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] via-white/[0.04] to-white/[0.02] p-7 text-center backdrop-blur-xl shadow-xl transition-all duration-500 hover:border-orange-500/50 hover:bg-white/[0.08] hover:shadow-[0_20px_50px_-15px_rgba(234,88,12,0.3)] md:p-8"
    >
      {/* Top accent glow line on hover */}
      <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      {/* Watermark Background Number */}
      <span className="pointer-events-none absolute right-2 -bottom-4 select-none text-8xl font-black tracking-tighter text-white/[0.03] transition-colors duration-500 group-hover:text-orange-500/[0.08]">
        {step.number}
      </span>

      <div className="flex w-full flex-col items-center">
        {/* Header: Centered Glowing Icon */}
        <div className="relative mb-2 flex size-16 items-center justify-center rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-transparent text-orange-400 shadow-[0_0_25px_rgba(234,88,12,0.2)] transition-all duration-300 group-hover:scale-110 group-hover:border-orange-500/60 group-hover:from-orange-500/30 group-hover:text-orange-300">
          {Icon ? <Icon className="size-7" /> : <span className="text-xl font-black">{step.number}</span>}
        </div>

        {/* Step Badge */}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3.5 py-1 text-xs font-black tracking-widest text-orange-400">
          <span className="text-[10px] tracking-wider text-orange-300/80">BƯỚC</span>
          <span className="font-black text-white">{step.number}</span>
        </div>

        {/* Eyebrow & Title & Description with balanced text wrapping */}
        <div className="mt-5 w-full">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-orange-400/90">
            {step.eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-white [text-wrap:balance] transition-colors group-hover:text-orange-100 md:text-2xl">
            {step.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300/85 [text-wrap:balance]">
            {step.description}
          </p>
        </div>
      </div>

      {/* Footer Step Progress Indicator */}
      <div className="mt-8 flex w-full items-center justify-center gap-3 border-t border-white/5 pt-4 text-xs">
        <span className="text-[11px] font-semibold text-slate-400 transition-colors group-hover:text-slate-300">
          0{index + 1} / 04
        </span>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
            style={{ width: `${((index + 1) / 4) * 100}%` }}
          />
        </div>
      </div>
    </motion.article>
  )
}
