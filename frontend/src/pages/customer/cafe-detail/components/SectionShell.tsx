import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Khung chung cho mọi phần của trang chi tiết cơ sở.
 *
 * Trước đây mỗi phần tự quyết định cỡ tiêu đề (`text-lg` ở phần xe, `text-base`
 * ở phần mô tả) và tự bọc mình trong một thẻ có viền + đổ bóng. Kết quả là trang
 * thành một chồng hộp giống nhau, mắt không đọc ra được đâu là cấp trên cấp dưới.
 * Giờ tiêu đề dùng một cỡ duy nhất, còn ranh giới giữa các phần do đường kẻ mảnh
 * đảm nhiệm thay vì viền hộp.
 */
export function CafeSection({
  id,
  title,
  lead,
  action,
  children,
  className,
}: {
  id?: string
  title: string
  lead?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
          {lead ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              {lead}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** Đường kẻ ngăn hai phần — thay cho viền của thẻ. */
export function SectionRule() {
  return <div className="h-px bg-slate-200/80" />
}

/** Khối thông báo nhẹ (rỗng / lỗi), không dùng viền hộp đầy đủ. */
export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-slate-200 py-2 pl-4 text-sm font-medium text-slate-500">
      {children}
    </p>
  )
}
