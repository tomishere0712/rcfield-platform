import { Check, Lock } from "lucide-react"

import { cn } from "@/shared/lib/utils"

import { CONTEST_WIZARD_STEPS } from "./contest-wizard"

/**
 * Thanh tiến trình các bước.
 *
 * Bước chưa mở khoá hiện ổ khoá và không bấm được — provider luôn thấy toàn bộ
 * lộ trình còn bao nhiêu bước, nhưng không nhảy cóc qua dữ liệu mà bước sau phụ thuộc.
 */
export function ContestWizardNav({
  currentIndex,
  maxUnlockedIndex,
  onSelect,
}: {
  currentIndex: number
  maxUnlockedIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {CONTEST_WIZARD_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex
        const isUnlocked = index <= maxUnlockedIndex

        return (
          <li key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isUnlocked}
              onClick={() => onSelect(index)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold transition",
                isCurrent && "bg-[#1c1b1b] text-white",
                !isCurrent && isUnlocked && "text-[#5d5f5f] hover:bg-[#f0eded]",
                !isUnlocked && "cursor-not-allowed text-[#adaaaa]",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black",
                  isCurrent && "bg-white text-[#1c1b1b]",
                  !isCurrent && isDone && "bg-emerald-500 text-white",
                  !isCurrent && !isDone && isUnlocked && "bg-[#e5e2e1] text-[#5d5f5f]",
                  !isUnlocked && "bg-[#f0eded] text-[#adaaaa]",
                )}
              >
                {isDone ? (
                  <Check className="size-3.5" />
                ) : !isUnlocked ? (
                  <Lock className="size-3" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>

            {index < CONTEST_WIZARD_STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "hidden h-px w-6 sm:block",
                  index < currentIndex ? "bg-emerald-400" : "bg-[#e5e2e1]",
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
