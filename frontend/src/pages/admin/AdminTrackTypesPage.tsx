import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GripVertical, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { adminTrackTypeApi, adminTrackTypeQueryKeys, trackTypeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { TrackType } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { getApiErrorInfo } from "@/shared/lib/utils"
import { AdminShell } from "./components/AdminShell"

type FormState = {
  code: string
  name: string
  description: string
  sort_order: string
  is_active: boolean
}

const emptyForm = (): FormState => ({
  code: "",
  name: "",
  description: "",
  sort_order: "0",
  is_active: true,
})

function initForm(item: TrackType): FormState {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    sort_order: String(item.sortOrder),
    is_active: item.isActive,
  }
}

export function AdminTrackTypesPage() {
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<{ mode: "create" | "edit"; item?: TrackType } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const { data: trackTypes = [], isLoading } = useQuery({
    queryKey: adminTrackTypeQueryKeys.all,
    queryFn: adminTrackTypeApi.listAll,
  })

  const createMutation = useMutation({
    mutationFn: adminTrackTypeApi.create,
    onSuccess: () => {
      toast.success("Đã thêm loại đường chạy")
      invalidate()
      setDialogState(null)
    },
    onError: (error: unknown) => {
      const msg = getApiErrorInfo(error).message || "Thêm thất bại"
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof adminTrackTypeApi.update>[1] }) =>
      adminTrackTypeApi.update(id, body),
    onSuccess: () => {
      toast.success("Đã cập nhật loại đường chạy")
      invalidate()
      setDialogState(null)
    },
    onError: (error: unknown) => {
      const msg = getApiErrorInfo(error).message || "Cập nhật thất bại"
      toast.error(msg)
    },
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: adminTrackTypeQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: trackTypeQueryKeys.all })
  }

  function openCreate() {
    setForm(emptyForm())
    setDialogState({ mode: "create" })
  }

  function openEdit(item: TrackType) {
    setForm(initForm(item))
    setDialogState({ mode: "edit", item })
  }

  function handleToggleActive(item: TrackType) {
    updateMutation.mutate({
      id: item.id,
      body: {
        is_active: !item.isActive,
      },
    })
  }

  function handleSave() {
    const sortOrder = parseInt(form.sort_order, 10)
    if (!form.code.trim()) {
      toast.error("Mã loại đường chạy không được để trống")
      return
    }
    if (!/^[A-Z0-9_]+$/.test(form.code.trim())) {
      toast.error("Mã chỉ được chứa chữ in hoa, số và dấu gạch dưới (VD: HILL_CLIMB)")
      return
    }
    if (!form.name.trim()) {
      toast.error("Tên loại đường chạy không được để trống")
      return
    }
    if (isNaN(sortOrder)) {
      toast.error("Thứ tự hiển thị phải là số nguyên")
      return
    }

    const body = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      sort_order: sortOrder,
      is_active: form.is_active,
    }

    if (dialogState?.mode === "edit" && dialogState.item) {
      updateMutation.mutate({ id: dialogState.item.id, body })
    } else {
      createMutation.mutate(body)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isEdit = dialogState?.mode === "edit"

  return (
    <AdminShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1b1b]">Quản lý Loại đường chạy</h1>
          <p className="mt-1 text-sm text-[#747878]">
            Thiết lập danh mục loại đường chạy (Track Types) hệ thống. Các thay đổi tại đây được đồng bộ tới bộ lọc Explore, trang đăng ký Sân chơi và Catalogue mẫu xe.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold shrink-0">
          <Plus className="size-4" />
          Thêm đường chạy
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f6f3f2]" />
          ))}
        </div>
      ) : trackTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#c4c7c8] bg-white p-12 text-center">
          <p className="text-sm font-medium text-[#747878]">Chưa có loại đường chạy nào. Bấm "Thêm đường chạy" để tạo.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#c4c7c8] bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e2e1] bg-[#f6f3f2]">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878]">Mã Code</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878]">Tên hiển thị</th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878] sm:table-cell">Mô tả</th>
                <th className="w-20 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-[#747878]">Thứ tự</th>
                <th className="w-24 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-[#747878]">Trạng thái</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {trackTypes.map((item) => (
                <tr key={item.id} className="border-b border-[#e5e2e1] last:border-0 hover:bg-[#fcf8f8]">
                  <td className="px-3 py-3 text-[#c4c7c8]">
                    <GripVertical className="size-4" />
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-[#f6f3f2] px-2 py-0.5 text-xs font-mono font-bold text-[#e05638]">
                      {item.code}
                    </code>
                  </td>
                  <td className="px-4 py-3 font-bold text-[#1c1b1b]">{item.name}</td>
                  <td className="hidden px-4 py-3 text-[#747878] sm:table-cell">
                    {item.description ?? <span className="italic text-[#c4c7c8]">Không có mô tả</span>}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-[#444748]">{item.sortOrder}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${item.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                        {item.isActive ? "Hoạt động" : "Tạm khóa"}
                      </span>
                      <Switch
                        size="sm"
                        checked={item.isActive}
                        onCheckedChange={() => handleToggleActive(item)}
                        disabled={updateMutation.isPending}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(item)}
                        title="Chỉnh sửa"
                      >
                        <Pencil className="size-4 text-[#747878]" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!dialogState} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Chỉnh sửa loại đường chạy" : "Thêm loại đường chạy mới"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Mã Code <span className="text-red-500">*</span></Label>
              <Input
                value={form.code}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "")
                  setForm((f) => ({ ...f, code: val }))
                }}
                placeholder="VD: DRIFT, HILL_CLIMB"
                maxLength={50}
                disabled={isSaving || isEdit}
                className="font-mono uppercase"
              />
              <p className="text-xs text-[#747878]">
                Mã định danh duy nhất (không được trùng lặp, chỉ dùng chữ hoa, số và dấu gạch dưới).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Tên hiển thị <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Leo dốc, Chướng ngại vật..."
                maxLength={100}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mô tả ngắn</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả đặc điểm loại đường chạy..."
                rows={2.5}
                maxLength={255}
                disabled={isSaving}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="space-y-1.5">
                <Label>Thứ tự hiển thị</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  placeholder="0"
                  disabled={isSaving}
                />
              </div>

              <div className="flex flex-col space-y-1.5 justify-end h-full">
                <Label className="mb-1">Trạng thái hoạt động</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
                    disabled={isSaving}
                  />
                  <span className="text-xs font-semibold text-[#444748]">
                    {form.is_active ? "Hoạt động" : "Tạm khóa"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState(null)} disabled={isSaving} className="font-bold">
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
              {isSaving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Thêm mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
