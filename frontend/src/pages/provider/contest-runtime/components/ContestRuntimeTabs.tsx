import type { ContestRuntimeTab } from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"

const tabs: Array<{ id: ContestRuntimeTab; label: string }> = [
  { id: "overview", label: "Tổng quan" },
  { id: "event-day", label: "Tiếp nhận thi đấu" },
  { id: "matches", label: "Nhánh đấu" },
  { id: "leaderboard", label: "Bảng xếp hạng" },
  { id: "audit", label: "Nhật ký" },
]

export function ContestRuntimeTabs({
  activeTab,
  onChange,
}: {
  activeTab: ContestRuntimeTab
  onChange: (tab: ContestRuntimeTab) => void
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-b border-[#e5e2e1] pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-bold transition-colors",
            activeTab === tab.id
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-[#e5e2e1] bg-white text-[#5d5f5f] hover:bg-[#fcf8f8] hover:text-[#1c1b1b]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
