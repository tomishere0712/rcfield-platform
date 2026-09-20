import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Coffee, Layers3, Pencil, Plus, Power, RefreshCw, Tags, Trash2, Utensils } from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { BackendCafe } from "@/features/cafes/types"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { menuApi, menuCategoryQueryKeys, menuQueryKeys } from "@/features/menu/api/menu.api"
import type { ComboUpsertBody, MenuItem, MenuListParams, MenuUpsertBody } from "@/features/menu/types"
import { UNCATEGORIZED_FILTER, UNCATEGORIZED_LABEL } from "@/features/menu/types"
import { MetricCard, Panel, PanelTitle, ProviderPageHeader, ProviderTable, StatusBadge } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderMenuItemFormDialog } from "@/pages/provider/components/ProviderMenuItemFormDialog"
import { ProviderMenuCategoryDialog } from "@/pages/provider/components/ProviderMenuCategoryDialog"
import { ProviderComboFormDialog } from "@/pages/provider/components/ProviderComboFormDialog"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

const availabilityOptions = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "true", label: "Đang bán" },
  { value: "false", label: "Tạm ẩn" },
] as const

import { cn } from "@/shared/lib/utils"

export function ProviderMenuPage({ cafeId: propCafeId }: { cafeId?: string }) {
  const queryClient = useQueryClient()
  const providerId = useAuthStore((state) => state.user?.id)
  const [selectedCafeId, setSelectedCafeId] = useState<string>(propCafeId ?? "")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedAvailability, setSelectedAvailability] = useState<(typeof availabilityOptions)[number]["value"]>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [comboDialogOpen, setComboDialogOpen] = useState(false)
  const [editingCombo, setEditingCombo] = useState<MenuItem | null>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const cafesQuery = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })

  const cafes = (cafesQuery.data?.data ?? []).filter((cafe) => !providerId || cafe.providerId === providerId)
  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId) ?? null

  useEffect(() => {
    if (propCafeId) {
      queueMicrotask(() => setSelectedCafeId(propCafeId))
    } else if (!selectedCafeId && cafes.length > 0) {
      queueMicrotask(() => setSelectedCafeId(cafes[0].id))
    }
  }, [cafes, selectedCafeId, propCafeId])

  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1))
  }, [selectedCafeId, selectedCategory, selectedAvailability])

  const menuParams: MenuListParams = useMemo(
    () => ({
      page: 1,
      limit: 100,
      category_id: selectedCategory === "all" ? undefined : selectedCategory,
      available: selectedAvailability === "all" ? undefined : selectedAvailability === "true",
    }),
    [selectedAvailability, selectedCategory],
  )

  const menuQuery = useQuery({
    queryKey: menuQueryKeys.list(selectedCafeId, menuParams),
    queryFn: () => menuApi.listMenuItems(selectedCafeId, menuParams),
    enabled: !!selectedCafeId,
  })

  const categoriesQuery = useQuery({
    queryKey: menuCategoryQueryKeys.list(selectedCafeId),
    queryFn: () => menuApi.listCategories(selectedCafeId),
    enabled: !!selectedCafeId,
  })

  const menuItems = menuQuery.data?.data ?? []
  const categories = categoriesQuery.data ?? []
  const totalPages = Math.ceil(menuItems.length / PAGE_SIZE)
  const paginatedMenuItems = menuItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const availableCount = menuItems.filter((item) => item.isAvailable).length
  const categoryCount = categories.length

  const saveMutation = useMutation({
    mutationFn: async ({ cafeId, item, values }: { cafeId: string; item: MenuItem | null; values: MenuUpsertBody }) => {
      debugProviderMenu("save start", { mode: item ? "update" : "create", cafeId, itemId: item?.id })
      return item ? menuApi.updateMenuItem(cafeId, item.id, values) : menuApi.createMenuItem(cafeId, values)
    },
    onSuccess: async (savedItem) => {
      await invalidateMenu(queryClient, savedItem.cafeId)
      toast.success(editingItem ? "Đã cập nhật món" : "Đã tạo món", { description: savedItem.name })
      setDialogOpen(false)
      setEditingItem(null)
    },
    onError: (error) => {
      debugProviderMenu("save failed", error)
      toast.error("Không thể lưu món", { description: "Vui lòng kiểm tra dữ liệu hoặc quyền quản lý cơ sở." })
    },
  })

  const saveComboMutation = useMutation({
    mutationFn: async ({ cafeId, combo, values }: { cafeId: string; combo: MenuItem | null; values: ComboUpsertBody }) => {
      return combo ? menuApi.updateCombo(cafeId, combo.id, values) : menuApi.createCombo(cafeId, values)
    },
    onSuccess: async (savedCombo) => {
      await invalidateMenu(queryClient, savedCombo.cafeId)
      toast.success(editingCombo ? "Đã cập nhật combo" : "Đã tạo combo", { description: savedCombo.name })
      setComboDialogOpen(false)
      setEditingCombo(null)
    },
    onError: () => {
      toast.error("Không thể lưu combo")
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (item: MenuItem) => {
      debugProviderMenu("toggle availability", { cafeId: item.cafeId, itemId: item.id, next: !item.isAvailable })
      return menuApi.updateMenuItem(item.cafeId, item.id, { is_available: !item.isAvailable })
    },
    onSuccess: async (savedItem) => {
      await invalidateMenu(queryClient, savedItem.cafeId)
      toast.success(savedItem.isAvailable ? "Đã bật bán món" : "Đã tạm ẩn món", { description: savedItem.name })
    },
    onError: (error) => {
      debugProviderMenu("toggle failed", error)
      toast.error("Không thể cập nhật trạng thái món")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (item: MenuItem) => {
      debugProviderMenu("delete item", { cafeId: item.cafeId, itemId: item.id })
      await menuApi.deleteMenuItem(item.cafeId, item.id)
      return item
    },
    onSuccess: async (deletedItem) => {
      await invalidateMenu(queryClient, deletedItem.cafeId)
      toast.success("Đã xóa món", { description: deletedItem.name })
    },
    onError: (error) => {
      debugProviderMenu("delete failed", error)
      toast.error("Không thể xóa món")
    },
  })

  const handleOpenCreate = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: MenuItem) => {
    if (item.isCombo) {
      setEditingCombo(item)
      setComboDialogOpen(true)
    } else {
      setEditingItem(item)
      setDialogOpen(true)
    }
  }

  const content = (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Tổng món" value={`${menuItems.length}`} helper={selectedCafe?.name ?? "Chọn cơ sở"} icon={<Utensils />} tone="neutral" />
        <MetricCard label="Đang bán" value={`${availableCount}`} helper={`${menuItems.length - availableCount} món tạm ẩn`} icon={<Coffee />} tone="success" />
        <MetricCard label="Danh mục" value={`${categoryCount}`} helper={selectedCafe ? "Danh mục của cơ sở này" : "Chọn cơ sở"} icon={<Layers3 />} tone="info" />
      </section>

      <Panel className="mt-4">
        <PanelTitle
          title="Danh sách món"
          subtitle={selectedCafe ? `Cơ sở: ${selectedCafe.name}` : "Chọn một cơ sở để quản lý menu"}
          action={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => void menuQuery.refetch()} disabled={!selectedCafeId || menuQuery.isFetching} className="rounded-lg">
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategoryDialogOpen(true)}
                disabled={!selectedCafeId}
                className="h-10 gap-2 rounded-lg border-[#c4c7c8] font-bold"
              >
                <Tags className="size-4" />
                Danh mục
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setEditingCombo(null); setComboDialogOpen(true) }}
                disabled={!selectedCafeId}
                className="h-10 gap-2 rounded-lg border-[#c4c7c8] font-bold"
              >
                <Layers3 className="size-4" />
                Tạo combo
              </Button>
              <Button type="button" onClick={handleOpenCreate} disabled={!selectedCafeId} className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
                <Plus className="size-4" />
                Thêm món
              </Button>
            </div>
          }
        />

        <div className={cn("mb-5 gap-3", propCafeId ? "flex flex-wrap" : "grid lg:grid-cols-3")}>
          {!propCafeId && (
            <Select value={selectedCafeId} onValueChange={setSelectedCafeId} disabled={cafesQuery.isLoading || cafes.length === 0}>
              <SelectTrigger className="h-11 rounded-lg border-[#c4c7c8] bg-[#f6f3f2] font-semibold">
                <SelectValue placeholder="Chọn cơ sở" />
              </SelectTrigger>
              <SelectContent>
                {cafes.map((cafe) => (
                  <SelectItem key={cafe.id} value={cafe.id}>
                    {cafe.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-11 min-w-[160px] rounded-lg border-[#c4c7c8] bg-[#f6f3f2] font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
              <SelectItem value={UNCATEGORIZED_FILTER}>{UNCATEGORIZED_LABEL}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedAvailability} onValueChange={(value) => setSelectedAvailability(value as typeof selectedAvailability)}>
            <SelectTrigger className="h-11 min-w-[160px] rounded-lg border-[#c4c7c8] bg-[#f6f3f2] font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availabilityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {cafesQuery.isLoading || menuQuery.isLoading ? (
          <MenuSkeleton />
        ) : cafesQuery.isError || menuQuery.isError ? (
          <RetryState onRetry={() => void Promise.all([cafesQuery.refetch(), menuQuery.refetch()])} />
        ) : !propCafeId && cafes.length === 0 ? (
          <EmptyState message="Provider chưa có cơ sở nào để quản lý menu." />
        ) : menuItems.length === 0 ? (
          <EmptyState message="Chưa có món nào theo bộ lọc hiện tại." />
        ) : (
          <div className="space-y-6">
            <ProviderTable
              columns={["Món", "Danh mục", "Giá", "Cơ sở", "Trạng thái", "Hành động"]}
              rows={paginatedMenuItems.map((item) => [
                <MenuNameCell key={`${item.id}-name`} item={item} />,
                item.categoryName ?? UNCATEGORIZED_LABEL,
                <PriceCell key={`${item.id}-price`} item={item} />,
                selectedCafe ? formatCafeName(selectedCafe) : "--",
                <StatusBadge key={`${item.id}-status`} status={item.isAvailable ? "Đang bán" : "Tạm ẩn"} />,
                <div key={`${item.id}-actions`} className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => handleOpenEdit(item)} className="rounded-lg border-[#c4c7c8]">
                    <Pencil className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => toggleMutation.mutate(item)} className="rounded-lg border-[#c4c7c8]">
                    <Power className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => deleteMutation.mutate(item)} className="rounded-lg border-red-200 text-red-600 hover:bg-red-50">
                    <Trash2 className="size-4" />
                  </Button>
                </div>,
              ])}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-6">
                <p className="text-xs font-bold text-[#747878]">
                  Hiển thị {Math.min((currentPage - 1) * PAGE_SIZE + 1, menuItems.length)} - {Math.min(currentPage * PAGE_SIZE, menuItems.length)} trong số {menuItems.length} món
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                  >
                    Trang trước
                  </Button>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const page = idx + 1
                    const isCurrent = currentPage === page
                    return (
                      <Button
                        key={page}
                        variant={isCurrent ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "h-8 w-8 rounded-lg text-xs font-bold",
                          isCurrent
                            ? "bg-[#1c1b1b] text-white hover:bg-[#313030]"
                            : "border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                        )}
                      >
                        {page}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="h-8 rounded-lg text-xs font-bold border-[#c4c7c8] text-[#444748] hover:bg-zinc-50"
                  >
                    Trang sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      <ProviderMenuCategoryDialog
        open={categoryDialogOpen}
        cafeId={selectedCafeId}
        categories={categories}
        isLoading={categoriesQuery.isLoading}
        onOpenChange={setCategoryDialogOpen}
      />

      <ProviderMenuItemFormDialog
        open={dialogOpen}
        item={editingItem}
        categories={categories}
        isPending={saveMutation.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingItem(null)
        }}
        onSubmit={async (values) => {
          if (!selectedCafeId) {
            toast.error("Vui lòng chọn cơ sở trước khi lưu món")
            return
          }
          await saveMutation.mutateAsync({ cafeId: selectedCafeId, item: editingItem, values })
        }}
      />

      <ProviderComboFormDialog
        open={comboDialogOpen}
        combo={editingCombo}
        menuItems={menuItems}
        categories={categories}
        isPending={saveComboMutation.isPending}
        onOpenChange={(open) => {
          setComboDialogOpen(open)
          if (!open) setEditingCombo(null)
        }}
        onSubmit={async (values) => {
          if (!selectedCafeId) {
            toast.error("Vui lòng chọn cơ sở trước khi lưu combo")
            return
          }
          await saveComboMutation.mutateAsync({ cafeId: selectedCafeId, combo: editingCombo, values })
        }}
      />
    </>
  )

  if (propCafeId) {
    return content
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Quản lý menu đồ ăn"
        description="Tạo, sửa, bật/tắt và xóa mềm món ăn/uống theo từng cơ sở provider."
      />
      {content}
    </ProviderShell>
  )
}

function MenuNameCell({ item }: { item: MenuItem }) {
  return (
    <div className="flex min-w-64 items-center gap-3">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="size-12 rounded-md object-cover" />
      ) : (
        <div className="grid size-12 place-items-center rounded-md bg-[#f6f3f2] text-[#747878]">
          <Utensils className="size-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-bold text-[#1c1b1b]">{item.name}</div>
        <div className="truncate text-xs font-semibold text-[#5d5f5f]">{item.description ?? "Chưa có mô tả"}</div>
      </div>
    </div>
  )
}

function PriceCell({ item }: { item: MenuItem }) {
  const variants = item.variants ?? []
  if (!variants.length) return <span>{formatMoney(item.price)}</span>
  const from = Math.min(...variants.map((variant) => Number(variant.price)))
  return (
    <div>
      <div className="font-semibold">Từ {formatMoney(from)}</div>
      <div className="text-xs text-[#747878]">{variants.length} lựa chọn</div>
    </div>
  )
}

function MenuSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-lg bg-[#f6f3f2]" />
      ))}
    </div>
  )
}

function RetryState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-[#c4c7c8] p-5">
      <p className="text-sm font-bold text-[#1c1b1b]">Không tải được dữ liệu menu.</p>
      <Button type="button" variant="outline" onClick={onRetry} className="mt-3 rounded-lg border-[#c4c7c8] font-bold">
        Tải lại
      </Button>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#c4c7c8] p-5 text-sm font-semibold text-[#5d5f5f]">
      {message}
    </div>
  )
}

function formatCafeName(cafe: BackendCafe) {
  return `${cafe.name} · ${cafe.district}`
}

function formatMoney(value: MenuItem["price"]) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return "--"
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(numberValue)
}

function debugProviderMenu(message: string, details?: unknown) {
  if (import.meta.env.DEV) {
    console.debug(`[ProviderMenuPage] ${message}`, details ?? "")
  }
}

async function invalidateMenu(queryClient: ReturnType<typeof useQueryClient>, cafeId: string) {
  await queryClient.invalidateQueries({ queryKey: menuQueryKeys.list(cafeId) })
  await queryClient.invalidateQueries({ queryKey: menuQueryKeys.all })
}
