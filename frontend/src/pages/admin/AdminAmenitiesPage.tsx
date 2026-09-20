import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { adminAmenityApi, adminAmenityQueryKeys, amenityQueryKeys } from "@/features/cafes/api/cafe.api"
import type { AmenityCatalogItem } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { AdminShell } from "./components/AdminShell"

type FormState = {
  title: string
  description: string
  icon: string
  sort_order: string
}

const emptyForm = (): FormState => ({ title: "", description: "", icon: "tool", sort_order: "0" })

function initForm(item: AmenityCatalogItem): FormState {
  return {
    title: item.title,
    description: item.description ?? "",
    icon: item.icon,
    sort_order: String(item.sortOrder),
  }
}

export function AdminAmenitiesPage() {
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<{ mode: "create" | "edit"; item?: AmenityCatalogItem } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const { data: amenities = [], isLoading } = useQuery({
    queryKey: adminAmenityQueryKeys.all,
    queryFn: adminAmenityApi.listAll,
  })

  const createMutation = useMutation({
    mutationFn: adminAmenityApi.create,
    onSuccess: () => {
      toast.success("Đã thêm tiện ích")
      invalidate()
      setDialogState(null)
    },
    onError: () => toast.error("Thêm tiện ích thất bại"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof adminAmenityApi.update>[1] }) =>
      adminAmenityApi.update(id, body),
    onSuccess: () => {
      toast.success("Đã cập nhật tiện ích")
      invalidate()
      setDialogState(null)
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  const removeMutation = useMutation({
    mutationFn: adminAmenityApi.remove,
    onSuccess: () => {
      toast.success("Đã xóa tiện ích")
      invalidate()
    },
    onError: () => toast.error("Xóa thất bại"),
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: adminAmenityQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: amenityQueryKeys.all })
  }

  function openCreate() {
    setForm(emptyForm())
    setDialogState({ mode: "create" })
  }

  function openEdit(item: AmenityCatalogItem) {
    setForm(initForm(item))
    setDialogState({ mode: "edit", item })
  }

  function handleSave() {
    const sortOrder = parseInt(form.sort_order, 10)
    if (!form.title.trim()) { toast.error("Tên tiện ích không được để trống"); return }
    if (!form.icon.trim()) { toast.error("Tên icon không được để trống"); return }
    if (isNaN(sortOrder)) { toast.error("Thứ tự phải là số nguyên"); return }

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim(),
      sort_order: sortOrder,
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
          <h1 className="text-2xl font-bold text-[#1c1b1b]">Trang thiết bị & Tiện ích</h1>
          <p className="mt-1 text-sm text-[#747878]">
            Quản lý danh mục tiện ích sử dụng toàn hệ thống. Provider chọn từ danh sách này khi cấu hình cơ sở.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold shrink-0">
          <Plus className="size-4" />
          Thêm tiện ích
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f6f3f2]" />
          ))}
        </div>
      ) : amenities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#c4c7c8] bg-white p-12 text-center">
          <p className="text-sm font-medium text-[#747878]">Chưa có tiện ích nào. Bấm "Thêm tiện ích" để tạo.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#c4c7c8] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5e2e1] bg-[#f6f3f2]">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878]">Tiêu đề</th>
                <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878] sm:table-cell">Mô tả</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#747878]">Biểu tượng</th>
                <th className="w-16 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-[#747878]">Thứ tự</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {amenities.map((item) => (
                <tr key={item.id} className="border-b border-[#e5e2e1] last:border-0 hover:bg-[#fcf8f8]">
                  <td className="px-3 py-3 text-[#c4c7c8]">
                    <GripVertical className="size-4" />
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#1c1b1b]">{item.title}</td>
                  <td className="hidden px-4 py-3 text-[#747878] sm:table-cell">
                    {item.description ?? <span className="italic text-[#c4c7c8]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-[#f6f3f2] px-1.5 py-0.5 text-xs font-mono text-[#444748]">{item.icon}</code>
                  </td>
                  <td className="px-4 py-3 text-center text-[#444748]">{item.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(item)}
                        title="Chỉnh sửa"
                      >
                        <Pencil className="size-4 text-[#747878]" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={removeMutation.isPending}
                            title="Xóa"
                          >
                            <Trash2 className="size-4 text-red-400 hover:text-red-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xóa tiện ích "{item.title}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tiện ích này sẽ bị xóa khỏi danh mục. Các cơ sở đã chọn tiện ích này sẽ không bị ảnh hưởng ngay, nhưng tiện ích sẽ không còn hiển thị nữa.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="font-bold">Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => removeMutation.mutate(item.id)}
                              className="font-bold"
                            >
                              Xóa
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
            <DialogTitle>{isEdit ? "Chỉnh sửa tiện ích" : "Thêm tiện ích mới"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Tiêu đề <span className="text-red-500">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="VD: Pit Area, Điều hòa, Live Stream..."
                maxLength={100}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mô tả ngắn</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả ngắn gọn (tuỳ chọn)..."
                rows={2}
                maxLength={255}
                disabled={isSaving}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mã biểu tượng <span className="text-red-500">*</span></Label>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="VD: tool, timer, wifi..."
                  maxLength={50}
                  disabled={isSaving}
                  className="font-mono"
                />
                <p className="text-xs text-[#747878]">Tên icon từ lucide-react hoặc tên tự định nghĩa</p>
              </div>

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
                <p className="text-xs text-[#747878]">Số nhỏ hơn hiển thị trước</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState(null)} disabled={isSaving} className="font-bold">
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
              {isSaving ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Thêm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
