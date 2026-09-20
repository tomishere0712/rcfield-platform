import { useState } from "react"
import { UserCog } from "lucide-react"
import { toast } from "sonner"

import { getErrorMessage } from "@/features/contests/lib/contest-runtime"
import type { useContestWorkspace } from "@/features/contests/hooks/useContestWorkspace"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Button } from "@/shared/ui/button"

type WorkspaceHook = ReturnType<typeof useContestWorkspace>

/**
 * Phân công nhân sự vận hành giải — và chỉ có thế.
 *
 * Màn này từng gánh ba việc không liên quan: gán staff, loại người chơi khỏi
 * giải, và cấm người chơi. Chính cái nhãn tab "Kỷ luật / Nhân sự" đã tố cáo
 * điều đó. Phân công trả lời "ai được vận hành giải", còn kỷ luật trả lời "xử
 * lý người chơi nào" — hai câu hỏi khác nhau, xảy ra ở hai thời điểm khác nhau.
 *
 * Hai việc kỷ luật đã chuyển sang màn Người chơi, nơi có sẵn danh sách người
 * thật. Nhờ đó ô "User ID" bắt provider gõ tay một chuỗi UUID cũng biến mất.
 */
export function ContestStaffPanel({ workspace }: { workspace: WorkspaceHook }) {
  const [selectedStaffId, setSelectedStaffId] = useState("")

  const assignments = workspace.staffAssignmentsQuery.data ?? []
  // Vài nhân viên một giải — lọc thẳng còn rẻ hơn chi phí ghi nhớ, mà `?? []`
  // vốn tạo mảng mới mỗi lần render nên useMemo ở đây chẳng ghi nhớ được gì.
  const assignedIds = new Set(assignments.map((item) => item.staff_id))
  const availableStaff = (workspace.staffOptionsQuery.data ?? []).filter(
    (item) => !assignedIds.has(item.id),
  )

  const handleAssign = async () => {
    if (!selectedStaffId) return
    try {
      await workspace.assignStaffMutation.mutateAsync(selectedStaffId)
      toast.success("Đã phân công nhân viên")
      setSelectedStaffId("")
    } catch (error) {
      toast.error("Không phân công được", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleUnassign = async (staffId: string) => {
    try {
      await workspace.unassignStaffMutation.mutateAsync(staffId)
      toast.success("Đã bỏ phân công")
    } catch (error) {
      toast.error("Không bỏ phân công được", {
        description: getErrorMessage(error).message,
      })
    }
  }

  return (
    <Panel className="max-w-3xl">
      <PanelTitle
        title="Nhân sự vận hành giải"
        subtitle="Nhân viên được phân công mới thấy giải này và mới điểm danh, nhập kết quả được."
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select
          className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-[#f6f3f2]"
          value={selectedStaffId}
          disabled={availableStaff.length === 0}
          onChange={(event) => setSelectedStaffId(event.target.value)}
        >
          <option value="">
            {availableStaff.length === 0
              ? "Đã phân công hết nhân viên hiện có"
              : "Chọn nhân viên"}
          </option>
          {availableStaff.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.fullName}
              {staff.email ? ` · ${staff.email}` : ""}
            </option>
          ))}
        </select>
        <Button
          className="h-10 rounded-lg bg-[#1c1b1b] px-5 text-sm font-bold text-white hover:bg-[#313030] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedStaffId || workspace.assignStaffMutation.isPending}
          onClick={() => void handleAssign()}
        >
          Phân công
        </Button>
      </div>

      <div className="mt-5">
        {assignments.length === 0 ? (
          <p className="border-l-2 border-amber-300 bg-amber-50/60 py-2.5 pl-4 text-sm font-semibold leading-6 text-[#1c1b1b]">
            Chưa phân công ai. Trong ngày thi, nhân viên sẽ không tìm thấy giải
            này trong danh sách của họ.
          </p>
        ) : (
          <ul>
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex items-center justify-between gap-3 border-b border-[#f0eded] py-3 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f0eded] text-[#5d5f5f]">
                    <UserCog className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1c1b1b]">
                      {assignment.staff?.full_name ?? "Nhân viên"}
                    </p>
                    <p className="text-xs font-semibold text-[#747878]">
                      {assignment.staff?.email ?? "Chưa có email"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-8 shrink-0 rounded-lg px-3 text-xs font-bold text-[#747878] hover:bg-[#f6f3f2]"
                  onClick={() => void handleUnassign(assignment.staff_id)}
                >
                  Bỏ phân công
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
