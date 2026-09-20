import { useEffect, useState } from "react"

import { cn } from "@/shared/lib/utils"

export type ContestNavItem = { id: string; label: string }

/**
 * Mục lục dính theo trang, thay cho hệ thống tab cũ.
 *
 * Trang giờ là một mạch cuộn liên tục nên người xem cần biết mình đang ở đâu và
 * nhảy nhanh tới phần quan tâm. `top` chừa chỗ cho header nổi của site (z-50),
 * còn thanh này ở z-30 nên luôn trượt xuống dưới header.
 */
export function ContestSectionNav({
  items,
  ctaLabel,
  onJump,
}: {
  items: ContestNavItem[]
  ctaLabel: string
  onJump: (sectionId: string) => void
}) {
  const activeId = useActiveSection(items)

  return (
    <nav className="sticky top-[72px] z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl md:top-[84px]">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6">
        <ul className="flex flex-1 items-center gap-1 overflow-x-auto py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    onJump(item.id)
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center whitespace-nowrap rounded-xl px-3.5 text-sm font-bold transition",
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </a>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={() => onJump("dang-ky")}
          className="hidden h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground transition hover:bg-brand-amber hover:text-accent-foreground active:scale-[0.98] lg:inline-flex"
        >
          {ctaLabel}
        </button>
      </div>
    </nav>
  )
}

/**
 * Xác định phần đang được đọc.
 *
 * `rootMargin` cắt bớt 150px phía trên (vùng bị hai thanh dính che) và 55% phía dưới,
 * nên phần được coi là "đang xem" là phần nằm ở khoảng 1/3 trên của màn hình —
 * gần với cảm nhận của người đọc hơn là lấy phần đầu tiên chạm viewport.
 */
function useActiveSection(items: ContestNavItem[]) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const itemKey = items.map((item) => item.id).join("|")

  useEffect(() => {
    const ids = itemKey ? itemKey.split("|") : []
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: "-150px 0px -55% 0px", threshold: 0 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [itemKey])

  return activeId ?? items[0]?.id ?? null
}
