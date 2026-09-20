import { cn } from "@/shared/lib/utils"

type SectionIntroProps = {
  eyebrow: string
  title: string
  description?: string
  align?: "left" | "center"
  action?: React.ReactNode
  invert?: boolean
  className?: string
}

export function SectionIntro({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  invert = false,
  className,
}: SectionIntroProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        align === "center" && "items-center text-center md:flex-col md:items-center",
        className,
      )}
    >
      <div
        className={cn(
          "space-y-3.5",
          align === "center" ? "mx-auto max-w-4xl text-center" : "max-w-2xl",
        )}
      >
        <p
          className={cn(
            "text-xs font-black uppercase tracking-[0.22em]",
            invert ? "text-orange-400" : "text-orange-600",
          )}
        >
          {eyebrow}
        </p>
        <h2
          className={cn(
            "text-3xl font-black tracking-tight [text-wrap:balance] md:text-4xl lg:text-[42px] lg:leading-[1.2]",
            invert ? "text-white" : "text-slate-950",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "mx-auto max-w-2xl text-sm font-medium leading-relaxed [text-wrap:balance] md:text-base md:leading-7",
              invert ? "text-slate-300" : "text-slate-600",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
