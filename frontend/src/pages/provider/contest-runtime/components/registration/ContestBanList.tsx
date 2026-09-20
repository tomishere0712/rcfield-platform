import { ShieldBan } from "lucide-react"

import type { ContestBanItem } from "@/features/contests/types"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"

/**
 * Danh sách người đang bị cấm, đặt ngay dưới danh sách người chơi.
 *
 * Ẩn hẳn khi chưa cấm ai: phần lớn giải sẽ không bao giờ dùng tới, và một khối
 * trống mang chữ "Chưa có lệnh cấm nào" chỉ tổ làm màn hình dài thêm.
 */
export function ContestBanList({
  bans,
  onLift,
}: {
  bans: ContestBanItem[]
  onLift: (banId: string) => void
}) {
  if (bans.length === 0) return null

  return (
    <Panel>
      <PanelTitle
        title={`Đang bị cấm (${bans.filter((ban) => !ban.lifted_at).length})`}
        subtitle="Người trong danh sách này không đăng ký được cho tới khi bạn gỡ lệnh cấm."
      />
      <ul className="space-y-2">
        {bans.map((ban) => {
          const active = !ban.lifted_at
          return (
            <li
              key={ban.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0eded] py-3 last:border-0"
            >
              <div className="flex min-w-0 gap-3">
                <span
                  className={
                    active
                      ? "mt-0.5 shrink-0 text-red-600"
                      : "mt-0.5 shrink-0 text-[#adaaaa]"
                  }
                >
                  <ShieldBan className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1c1b1b]">
                    {ban.user?.full_name ?? ban.user?.email ?? "Không rõ tên"}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[#5d5f5f]">
                    {ban.reason}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#747878]">
                    {ban.scope_type === "PROVIDER"
                      ? "Mọi giải của bạn"
                      : "Chỉ giải này"}
                    {" · "}
                    {ban.expires_at
                      ? `đến ${new Date(ban.expires_at).toLocaleDateString("vi-VN")}`
                      : "không thời hạn"}
                  </p>
                </div>
              </div>

              {active ? (
                <Button
                  variant="outline"
                  className="h-8 shrink-0 rounded-lg border-[#c4c7c8] px-3 text-xs font-bold text-[#1c1b1b] hover:bg-[#f6f3f2]"
                  onClick={() => onLift(ban.id)}
                >
                  Gỡ cấm
                </Button>
              ) : (
                <Badge className="shrink-0 border border-[#e5e2e1] bg-[#f6f3f2] text-[#747878]">
                  Đã gỡ
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
