import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { isAxiosError } from "axios"

import { menuApi, menuCategoryQueryKeys, menuQueryKeys } from "@/features/menu/api/menu.api"
import type { MenuCategory } from "@/features/menu/types"
import { Button } from "@/shared/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"

type ProviderMenuCategoryDialogProps = {
  open: boolean
  cafeId: string
  categories: MenuCategory[]
  isLoading: boolean
  onOpenChange: (open: boolean) => void
}

/** Rút thông báo lỗi tiếng Việt do backend trả về, kèm số món khi chặn xóa. */
function readApiError(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message) return message
  }
  return fallback
}

export function ProviderMenuCategoryDialog({
  open,
  cafeId,
  categories,
  isLoading,
  onOpenChange,
}: ProviderMenuCategoryDialogProps) {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: menuCategoryQueryKeys.list(cafeId) })
    // Đổi tên/xóa danh mục làm thay đổi categoryName và thứ tự của danh sách món
    await queryClient.invalidateQueries({ queryKey: menuQueryKeys.all })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => menuApi.createCategory(cafeId, { name }),
    onSuccess: async (category) => {
      await invalidate()
      setNewName("")
      toast.success("Đã tạo danh mục", { description: category.name })
    },
    onError: (error) => {
      toast.error("Không thể tạo danh mục", {
        description: readApiError(error, "Vui lòng kiểm tra lại tên danh mục."),
      })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      menuApi.updateCategory(cafeId, id, { name }),
    onSuccess: async (category) => {
      await invalidate()
      setEditingId(null)
      toast.success("Đã đổi tên danh mục", { description: category.name })
    },
    onError: (error) => {
      toast.error("Không thể đổi tên danh mục", {
        description: readApiError(error, "Vui lòng kiểm tra lại tên danh mục."),
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (category: MenuCategory) => menuApi.deleteCategory(cafeId, category.id),
    onSuccess: async () => {
      await invalidate()
      toast.success("Đã xóa danh mục")
    },
    onError: (error) => {
      // Backend trả 409 CATEGORY_NOT_EMPTY kèm số món còn lại trong message
      toast.error("Không thể xóa danh mục", {
        description: readApiError(error, "Danh mục có thể vẫn còn món."),
      })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (categoryIds: string[]) => menuApi.reorderCategories(cafeId, categoryIds),
    onSuccess: invalidate,
    onError: () => toast.error("Không thể sắp xếp lại danh mục"),
  })

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    const next = [...categories]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorderMutation.mutate(next.map((category) => category.id))
  }

  const busy =
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-xl overflow-y-auto rounded-xl bg-white p-0">
        <DialogHeader className="border-b border-[#e5e2e1] px-5 py-4">
          <DialogTitle className="text-xl font-bold text-[#1c1b1b]">Danh mục món</DialogTitle>
          <DialogDescription>
            Mỗi cơ sở có bộ danh mục riêng. Chỉ xóa được danh mục không còn món nào.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const name = newName.trim()
              if (name) createMutation.mutate(name)
            }}
            className="flex gap-2"
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Tên danh mục mới (vd: Cà phê)"
              maxLength={50}
              className="rounded-lg border-[#c4c7c8]"
            />
            <Button
              type="submit"
              disabled={busy || !newName.trim()}
              className="shrink-0 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
            >
              <Plus className="size-4" />
              Thêm
            </Button>
          </form>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-lg bg-[#f6f3f2]" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#c4c7c8] p-5 text-sm font-semibold text-[#5d5f5f]">
              Cơ sở chưa có danh mục nào. Tạo danh mục đầu tiên ở ô phía trên.
            </p>
          ) : (
            <ul className="space-y-2">
              {categories.map((category, index) => (
                <li
                  key={category.id}
                  className="flex items-center gap-2 rounded-lg border border-[#e5e2e1] p-3"
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Đưa ${category.name} lên trên`}
                      className="rounded p-0.5 text-[#747878] hover:bg-[#f6f3f2] disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={busy || index === categories.length - 1}
                      aria-label={`Đưa ${category.name} xuống dưới`}
                      className="rounded p-0.5 text-[#747878] hover:bg-[#f6f3f2] disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>

                  {editingId === category.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        maxLength={50}
                        autoFocus
                        className="h-9 rounded-lg border-[#c4c7c8]"
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        disabled={busy || !editingName.trim()}
                        onClick={() =>
                          renameMutation.mutate({ id: category.id, name: editingName.trim() })
                        }
                        aria-label="Lưu tên"
                        className="shrink-0 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        aria-label="Hủy đổi tên"
                        className="shrink-0 rounded-lg border-[#c4c7c8]"
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-[#1c1b1b]">{category.name}</p>
                        <p className="text-xs font-semibold text-[#747878]">
                          {category.itemCount > 0 ? `${category.itemCount} món` : "Chưa có món"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(category.id)
                          setEditingName(category.name)
                        }}
                        aria-label={`Đổi tên ${category.name}`}
                        className="shrink-0 rounded-lg border-[#c4c7c8]"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => deleteMutation.mutate(category)}
                        aria-label={`Xóa ${category.name}`}
                        className="shrink-0 rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
