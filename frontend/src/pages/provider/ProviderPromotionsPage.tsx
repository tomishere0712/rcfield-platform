import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  BadgePercent,
  Building2,
  CalendarClock,
  Copy,
  Edit3,
  HelpCircle,
  PauseCircle,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { routePaths } from "@/app/router/route-paths"
import {
  promotionApi,
  type DiscountType,
  type PromoApplicableTo,
  type Promotion,
  type PromotionPayload,
  type PromotionScheduleMode,
  type ProviderCafe,
} from "@/features/promotions/api/promotion.api"
import { DeleteConfirmationModal } from "@/pages/provider/components/DeleteConfirmationModal"
import { MetricCard, Panel, PanelTitle } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { cn } from "@/shared/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"

type PromotionFormState = {
  code: string
  description: string
  discountType: DiscountType
  discountValue: string
  maxDiscountAmount: string
  minOrderAmount: string
  maxUses: string
  maxUsesPerUser: string
  applicableTo: PromoApplicableTo
  scheduleMode: PromotionScheduleMode
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  weekdays: string[]
  isActive: boolean
  showOnCafePage: boolean
}

const defaultForm: PromotionFormState = {
  code: "",
  description: "",
  discountType: "PERCENT",
  discountValue: "10",
  maxDiscountAmount: "",
  minOrderAmount: "",
  maxUses: "",
  maxUsesPerUser: "1",
  applicableTo: "ALL",
  scheduleMode: "ONCE",
  startDate: toDateInputValue(new Date()),
  startTime: toTimeInputValue(new Date()),
  endDate: "",
  endTime: "",
  weekdays: [],
  isActive: true,
  showOnCafePage: true,
}

const scheduleModeOptions: Array<{ value: PromotionScheduleMode; label: string }> = [
  { value: "ONCE", label: "Không lặp" },
  { value: "DAILY", label: "Hằng ngày" },
  { value: "WEEKLY", label: "Theo thứ" },
]

const weekdayOptions = [
  { value: "MON", label: "T2" },
  { value: "TUE", label: "T3" },
  { value: "WED", label: "T4" },
  { value: "THU", label: "T5" },
  { value: "FRI", label: "T6" },
  { value: "SAT", label: "T7" },
  { value: "SUN", label: "CN" },
]

export function ProviderPromotionsPage({ cafeId: propCafeId }: { cafeId?: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCafeId = propCafeId || searchParams.get("cafeId") || ""
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState(propCafeId ?? "")
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null)
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([])
  const [deleteMode, setDeleteMode] = useState<"single" | "selected" | "all" | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editMode, setEditMode] = useState<"none" | "create" | "edit">("none")
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [form, setForm] = useState<PromotionFormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [now] = useState(() => Date.now())

  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId)
  const copySourceCafes = cafes.filter((cafe) => cafe.id !== selectedCafeId)
  const selectedPromotions = promotions.filter((promotion) => selectedPromotionIds.includes(promotion.id))
  const allPromotionsSelected = promotions.length > 0 && selectedPromotionIds.length === promotions.length

  const stats = useMemo(() => {
    const active = promotions.filter((promotion) => isPromotionLive(promotion, now)).length
    const expiringSoon = promotions.filter((promotion) => {
      if (!promotion.expiresAt || !promotion.isActive) return false
      const expiresAt = new Date(promotion.expiresAt).getTime()
      return expiresAt >= now && expiresAt <= now + 7 * 24 * 60 * 60 * 1000
    }).length
    const uses = promotions.reduce((total, promotion) => total + promotion.usesCount, 0)

    return { active, expiringSoon, uses }
  }, [now, promotions])

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        setLoading(true)
        const data = await promotionApi.listProviderCafes()
        if (!mounted) return
        setCafes(data)
        setSelectedCafeId((current) => {
          if (propCafeId) return propCafeId
          if (current) return current
          if (requestedCafeId && data.some((cafe) => cafe.id === requestedCafeId)) return requestedCafeId
          return data[0]?.id || ""
        })
      } catch {
        toast.error("Không tải được danh sách chi nhánh")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadCafes()
    return () => {
      mounted = false
    }
  }, [requestedCafeId, propCafeId])

  useEffect(() => {
    if (!selectedCafeId) {
      queueMicrotask(() => setPromotions([]))
      return
    }

    let mounted = true

    async function loadPromotions() {
      try {
        setLoading(true)
        const data = await promotionApi.listByCafe(selectedCafeId)
        if (mounted) setPromotions(data)
      } catch {
        toast.error("Không tải được ưu đãi của chi nhánh")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadPromotions()
    return () => {
      mounted = false
    }
  }, [selectedCafeId])

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedPromotionIds([])
      setDeleteTarget(null)
      setDeleteMode(null)
    })
    if (selectedCafeId && !propCafeId) {
      setSearchParams(selectedCafeId ? { cafeId: selectedCafeId } : {})
    }
  }, [selectedCafeId, propCafeId, setSearchParams])

  const startCreate = () => {
    setEditMode("create")
    setEditingPromotion(null)
    setForm(defaultForm)
  }

  const startEdit = (promotion: Promotion) => {
    setEditMode("edit")
    setEditingPromotion(promotion)
    setForm(promotionToForm(promotion))
  }

  const cancelEdit = () => {
    setEditMode("none")
    setEditingPromotion(null)
    setForm(defaultForm)
  }

  const savePromotion = async () => {
    if (!selectedCafeId) return
    const validationMessage = getPromotionFormError(form)
    if (validationMessage) {
      toast.error(validationMessage)
      return
    }
    try {
      setSaving(true)
      if (editMode === "create") {
        const saved = await promotionApi.create(selectedCafeId, toPayload(form))
        setPromotions((prev) => [saved, ...prev])
        toast.success("Đã tạo ưu đãi", { description: saved.code })
      } else if (editMode === "edit" && editingPromotion) {
        const saved = await promotionApi.update(selectedCafeId, editingPromotion.id, toPayload(form))
        setPromotions((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
        toast.success("Đã cập nhật ưu đãi", { description: saved.code })
      }
      cancelEdit()
    } catch (error) {
      toast.error("Không lưu được ưu đãi", { description: getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const startCopy = () => {
    navigate(`${routePaths.providerPromotionCopy}?cafeId=${selectedCafeId}`)
  }

  const togglePromotionSelection = (promotionId: string) => {
    setSelectedPromotionIds((ids) =>
      ids.includes(promotionId) ? ids.filter((id) => id !== promotionId) : [...ids, promotionId]
    )
  }

  const toggleAllPromotions = () => {
    setSelectedPromotionIds(allPromotionsSelected ? [] : promotions.map((promotion) => promotion.id))
  }

  const openSingleDelete = (promotion: Promotion) => {
    setDeleteTarget(promotion)
    setDeleteMode("single")
  }

  const openSelectedDelete = () => {
    if (selectedPromotionIds.length === 0) return
    setDeleteTarget(null)
    setDeleteMode("selected")
  }

  const openDeleteAll = () => {
    if (promotions.length === 0) return
    setDeleteTarget(null)
    setDeleteMode("all")
  }

  const toggleActive = async (promotion: Promotion) => {
    if (!selectedCafeId) return

    try {
      const updated = await promotionApi.update(selectedCafeId, promotion.id, {
        is_active: !promotion.isActive,
      })
      setPromotions((items) => items.map((item) => item.id === updated.id ? updated : item))
      toast.success(updated.isActive ? "Đã bật ưu đãi" : "Đã tắt ưu đãi")
    } catch (error) {
      toast.error("Không đổi được trạng thái ưu đãi", {
        description: getErrorMessage(error),
      })
    }
  }

  const deletePromotion = async (promotion: Promotion) => {
    if (!selectedCafeId) return
    try {
      await promotionApi.remove(selectedCafeId, promotion.id)
      setPromotions((items) => items.filter((item) => item.id !== promotion.id))
      toast.success("Đã xóa ưu đãi")
      setDeleteTarget(null)
    } catch (error) {
      toast.error("Không xóa được ưu đãi", {
        description: getErrorMessage(error),
      })
    }
  }

  const deletePromotions = async (ids: string[]) => {
    if (!selectedCafeId) return
    const uniqueIds = Array.from(new Set(ids))
    if (uniqueIds.length === 0) return

    try {
      setDeleting(true)
      await Promise.all(uniqueIds.map((id) => promotionApi.remove(selectedCafeId, id)))
      setPromotions((items) => items.filter((item) => !uniqueIds.includes(item.id)))
      setSelectedPromotionIds((items) => items.filter((id) => !uniqueIds.includes(id)))
      toast.success(uniqueIds.length === 1 ? "Đã xóa ưu đãi" : `Đã xóa ${uniqueIds.length} mã ưu đãi`)
      setDeleteTarget(null)
      setDeleteMode(null)
    } catch (error) {
      toast.error("Không xóa được ưu đãi", {
        description: getErrorMessage(error),
      })
    } finally {
      setDeleting(false)
    }
  }

  const confirmDelete = () => {
    if (deleteMode === "single" && deleteTarget) {
      void deletePromotions([deleteTarget.id])
      return
    }
    if (deleteMode === "selected") {
      void deletePromotions(selectedPromotionIds)
      return
    }
    if (deleteMode === "all") {
      void deletePromotions(promotions.map((promotion) => promotion.id))
    }
  }

  const content = (
    <section className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Đang hoạt động" value={String(stats.active)} helper="Theo chi nhánh đang chọn" icon={<BadgePercent />} tone="success" />
        <MetricCard label="Sắp hết hạn" value={String(stats.expiringSoon)} helper="Trong 7 ngày tới" icon={<CalendarClock />} tone={stats.expiringSoon ? "warning" : "neutral"} />
        <MetricCard label="Lượt dùng" value={String(stats.uses)} helper="Tổng lượt dùng mã" icon={<Building2 />} tone="info" />
      </section>

      {!propCafeId && (
        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">
              Chi nhánh áp dụng
            </Label>
            <select
              value={selectedCafeId}
              onChange={(event) => {
                const nextCafeId = event.target.value
                setSelectedCafeId(nextCafeId)
                setSearchParams(nextCafeId ? { cafeId: nextCafeId } : {})
              }}
              disabled={loading || cafes.length === 0}
              className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold disabled:bg-[#f6f3f2]"
            >
              {cafes.length === 0 ? <option>Chưa có chi nhánh</option> : null}
              {cafes.map((cafe) => (
                <option key={cafe.id} value={cafe.id}>
                  {cafe.name} - {cafe.district}, {cafe.city}
                </option>
              ))}
            </select>
          </div>
        </Panel>
      )}

      {editMode !== "none" && (
        <PromotionForm
          cafe={selectedCafe}
          form={form}
          editing={editingPromotion}
          saving={saving}
          onChange={setForm}
          onCancel={cancelEdit}
          onSave={() => void savePromotion()}
        />
      )}

      <Panel>
        <PanelTitle
          title={selectedCafe ? `Danh sách ưu đãi - ${selectedCafe.name}` : "Danh sách ưu đãi"}
          subtitle="Mỗi mã chỉ thuộc chi nhánh đang chọn. Dùng tắt hoạt động để giữ lịch sử lượt dùng."
          action={
            editMode === "none" ? (
              <div className="flex flex-nowrap items-center gap-2">
                <Button disabled={!selectedCafeId || copySourceCafes.length === 0} variant="outline" onClick={startCopy} className="h-9 whitespace-nowrap rounded-lg bg-white font-bold">
                  <Copy className="mr-2 size-4" />
                  Thêm từ chi nhánh
                </Button>
                <Button disabled={!selectedCafeId} variant="outline" onClick={startCreate} className="h-9 whitespace-nowrap rounded-lg bg-white font-bold">
                  <Plus className="mr-2 size-4" />
                  Thêm mã
                </Button>
              </div>
            ) : null
          }
        />

        {loading ? (
          <div className="rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] p-8 text-center text-sm font-semibold text-[#747878]">
            Đang tải dữ liệu ưu đãi...
          </div>
        ) : promotions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-10 text-center">
            <BadgePercent className="mx-auto size-10 text-[#747878]" />
            <h3 className="mt-4 text-lg font-bold text-[#1c1b1b]">Chi nhánh này chưa có ưu đãi</h3>
            <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">Tạo mã đầu tiên để khách hàng áp dụng khi đặt sân hoặc thuê xe.</p>
            <Button disabled={!selectedCafeId} onClick={startCreate} className="mt-5 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
              <Plus className="mr-2 size-4" />
              Tạo ưu đãi
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-col gap-3 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-sm font-bold text-[#1c1b1b]">
                <input
                  type="checkbox"
                  checked={allPromotionsSelected}
                  onChange={toggleAllPromotions}
                  className="size-4 rounded border-[#c4c7c8] accent-orange-600"
                />
                Chọn tất cả ({selectedPromotionIds.length}/{promotions.length})
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={selectedPromotionIds.length === 0} variant="outline" onClick={openSelectedDelete} className="h-9 rounded-lg bg-white text-red-600 hover:bg-red-50 font-bold">
                  <Trash2 className="mr-2 size-4" />
                  Xóa đã chọn
                </Button>
                <Button disabled={promotions.length === 0} variant="outline" onClick={openDeleteAll} className="h-9 rounded-lg bg-white text-red-600 hover:bg-red-50 font-bold">
                  <Trash2 className="mr-2 size-4" />
                  Xóa hết
                </Button>
              </div>
            </div>
            {promotions.map((promotion) => (
              <PromotionRow
                key={promotion.id}
                promotion={promotion}
                selected={selectedPromotionIds.includes(promotion.id)}
                onSelect={() => togglePromotionSelection(promotion.id)}
                onEdit={() => startEdit(promotion)}
                onToggle={() => void toggleActive(promotion)}
                onDelete={() => openSingleDelete(promotion)}
              />
            ))}
          </div>
        )}
      </Panel>

      <DeleteConfirmationModal
        isOpen={!!deleteMode}
        onClose={() => {
          if (deleting) return
          setDeleteTarget(null)
          setDeleteMode(null)
        }}
        onConfirm={confirmDelete}
        offerData={
          deleteMode === "selected"
            ? {
                code: `Xóa ${selectedPromotions.length} mã đã chọn`,
                description: `Các mã này sẽ bị xóa khỏi ${selectedCafe?.name ?? "chi nhánh đang chọn"}.`,
                details: "Kiểm tra lại danh sách trước khi xác nhận.",
                items: selectedPromotions.map((promotion) => promotionToDeleteItem(promotion)),
              }
            : deleteMode === "all"
              ? {
                  code: `Xóa tất cả ${promotions.length} mã`,
                  description: `Toàn bộ mã ưu đãi của ${selectedCafe?.name ?? "chi nhánh đang chọn"} sẽ bị xóa.`,
                  details: "Thao tác này áp dụng cho toàn bộ danh sách hiện tại.",
                  items: promotions.map((promotion) => promotionToDeleteItem(promotion)),
                }
              : deleteTarget
            ? {
                code: deleteTarget.code,
                status: getPromotionStatus(deleteTarget).label,
                statusClassName: getPromotionStatus(deleteTarget).className,
                description: deleteTarget.description || "Chưa có mô tả",
                details: `${formatDiscount(deleteTarget)} · Đã dùng ${deleteTarget.usesCount}/${deleteTarget.maxUses ?? "∞"}`,
              }
            : null
        }
      />

      <AlertDialog open={false} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md rounded-xl border border-[#e5e2e1] bg-white p-0 text-[#1c1b1b]">
          <div className="p-5">
            <AlertDialogHeader className="place-items-start text-left">
              <AlertDialogMedia className="mb-3 rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="size-6" />
              </AlertDialogMedia>
              <AlertDialogTitle className="text-xl font-extrabold">
                Xóa mã ưu đãi?
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm font-medium leading-6 text-[#5d5f5f]">
                Mã này sẽ bị xóa khỏi chi nhánh đang chọn. Nếu mã đã phát sinh lượt dùng, hệ thống sẽ không cho xóa và bạn nên tắt hoạt động để giữ lịch sử.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {deleteTarget ? (
              <div className="mt-5 rounded-lg border border-red-100 bg-red-50/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">
                    {deleteTarget.code}
                  </span>
                  <Badge className={cn("border font-bold", getPromotionStatus(deleteTarget).className)}>
                    {getPromotionStatus(deleteTarget).label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#444748]">
                  {deleteTarget.description || "Chưa có mô tả"}
                </p>
                <p className="mt-2 text-xs font-bold uppercase text-[#747878]">
                  {formatDiscount(deleteTarget)} · Đã dùng {deleteTarget.usesCount}/{deleteTarget.maxUses ?? "∞"}
                </p>
              </div>
            ) : null}
          </div>

          <AlertDialogFooter className="m-0 rounded-b-xl border-t border-[#e5e2e1] bg-[#fcf8f8] px-5 py-4">
            <AlertDialogCancel disabled={deleting} className="rounded-lg bg-white">
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget) void deletePromotion(deleteTarget)
              }}
              className="rounded-lg"
            >
              <Trash2 className="mr-2 size-4" />
              {deleting ? "Đang xóa..." : "Xóa ưu đãi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )

  if (propCafeId) {
    return content
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Ưu đãi theo chi nhánh"
        description="Chọn một chi nhánh bạn sở hữu để tạo, chỉnh sửa và theo dõi mã ưu đãi riêng cho chi nhánh đó."
      />
      {content}
    </ProviderShell>
  )
}

export function ProviderPromotionCreatePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCafeId = searchParams.get("cafeId") ?? ""
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState("")
  const [form, setForm] = useState<PromotionFormState>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId)

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        setLoading(true)
        const data = await promotionApi.listProviderCafes()
        if (!mounted) return
        setCafes(data)
        setSelectedCafeId((current) => {
          if (current) return current
          if (requestedCafeId && data.some((cafe) => cafe.id === requestedCafeId)) return requestedCafeId
          return data[0]?.id || ""
        })
      } catch {
        toast.error("Không tải được danh sách chi nhánh")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadCafes()
    return () => {
      mounted = false
    }
  }, [requestedCafeId])

  const goBack = () => {
    navigate(buildPromotionsPath(selectedCafeId || requestedCafeId))
  }

  const savePromotion = async () => {
    if (!selectedCafeId) return
    const validationMessage = getPromotionFormError(form)
    if (validationMessage) {
      toast.error(validationMessage)
      return
    }

    try {
      setSaving(true)
      const saved = await promotionApi.create(selectedCafeId, toPayload(form))
      toast.success("Đã tạo ưu đãi", { description: saved.code })
      navigate(buildPromotionsPath(selectedCafeId))
    } catch (error) {
      toast.error("Không lưu được ưu đãi", {
        description: getErrorMessage(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Thêm mã ưu đãi"
        description="Tạo mã ưu đãi mới cho một chi nhánh provider."
      />

      <div className="space-y-4">
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách ưu đãi
          </Button>
        </div>

        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">
              Chi nhánh áp dụng
            </Label>
            <select
              value={selectedCafeId}
              onChange={(event) => {
                const nextCafeId = event.target.value
                setSelectedCafeId(nextCafeId)
                setSearchParams(nextCafeId ? { cafeId: nextCafeId } : {})
              }}
              disabled={loading || cafes.length === 0}
              className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold disabled:bg-[#f6f3f2]"
            >
              {cafes.length === 0 ? <option>Chưa có chi nhánh</option> : null}
              {cafes.map((cafe) => (
                <option key={cafe.id} value={cafe.id}>
                  {cafe.name} - {cafe.district}, {cafe.city}
                </option>
              ))}
            </select>
          </div>
        </Panel>

        <PromotionForm
          cafe={selectedCafe}
          form={form}
          editing={null}
          saving={saving}
          onChange={setForm}
          onCancel={goBack}
          onSave={() => void savePromotion()}
        />
      </div>
    </ProviderShell>
  )
}

export function ProviderPromotionEditPage() {
  const navigate = useNavigate()
  const { promotionId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const requestedCafeId = searchParams.get("cafeId") ?? ""
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState("")
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [form, setForm] = useState<PromotionFormState>(defaultForm)
  const [loadingPromotion, setLoadingPromotion] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId)

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        const data = await promotionApi.listProviderCafes()
        if (!mounted) return
        setCafes(data)
        setSelectedCafeId((current) => {
          if (current) return current
          if (requestedCafeId && data.some((cafe) => cafe.id === requestedCafeId)) return requestedCafeId
          return data[0]?.id || ""
        })
      } catch {
        toast.error("Không tải được danh sách chi nhánh")
      }
    }

    void loadCafes()
    return () => {
      mounted = false
    }
  }, [requestedCafeId])

  useEffect(() => {
    if (!selectedCafeId || !promotionId) {
      queueMicrotask(() => setEditing(null))
      return
    }

    let mounted = true

    async function loadPromotion() {
      try {
        setLoadingPromotion(true)
        const data = await promotionApi.listByCafe(selectedCafeId)
        if (!mounted) return
        const promotion = data.find((item) => item.id === promotionId) ?? null
        setEditing(promotion)
        if (promotion) {
          setForm(promotionToForm(promotion))
        } else {
          toast.error("Không tìm thấy mã ưu đãi trong chi nhánh này")
        }
      } catch {
        toast.error("Không tải được mã ưu đãi")
      } finally {
        if (mounted) setLoadingPromotion(false)
      }
    }

    void loadPromotion()
    return () => {
      mounted = false
    }
  }, [promotionId, selectedCafeId])

  const goBack = () => {
    navigate(buildPromotionsPath(selectedCafeId || requestedCafeId))
  }

  const savePromotion = async () => {
    if (!selectedCafeId || !editing) return
    const validationMessage = getPromotionFormError(form)
    if (validationMessage) {
      toast.error(validationMessage)
      return
    }

    try {
      setSaving(true)
      const saved = await promotionApi.update(selectedCafeId, editing.id, toPayload(form))
      toast.success("Đã cập nhật ưu đãi", { description: saved.code })
      navigate(buildPromotionsPath(selectedCafeId))
    } catch (error) {
      toast.error("Không lưu được ưu đãi", {
        description: getErrorMessage(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={editing ? `Chỉnh sửa ${editing.code}` : "Chỉnh sửa ưu đãi"}
        description="Cập nhật thông tin mã ưu đãi của chi nhánh đang chọn."
      />

      <div className="space-y-4">
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách ưu đãi
          </Button>
        </div>

        {loadingPromotion ? (
          <div className="rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] p-8 text-center text-sm font-semibold text-[#747878]">
            Đang tải dữ liệu ưu đãi...
          </div>
        ) : editing ? (
          <PromotionForm
            cafe={selectedCafe}
            form={form}
            editing={editing}
            saving={saving}
            onChange={setForm}
            onCancel={goBack}
            onSave={() => void savePromotion()}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-10 text-center">
            <BadgePercent className="mx-auto size-10 text-[#747878]" />
            <h3 className="mt-4 text-lg font-bold text-[#1c1b1b]">Không tìm thấy ưu đãi</h3>
            <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">Vui lòng quay lại danh sách và chọn mã khác.</p>
          </div>
        )}
      </div>
    </ProviderShell>
  )
}

export function ProviderPromotionCopyPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCafeId = searchParams.get("cafeId") ?? ""
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [targetCafeId, setTargetCafeId] = useState("")
  const [targetPromotions, setTargetPromotions] = useState<Promotion[]>([])
  const [sourceCafeId, setSourceCafeId] = useState("")
  const [sourcePromotions, setSourcePromotions] = useState<Promotion[]>([])
  const [selectedPromotionId, setSelectedPromotionId] = useState("")
  const [loadingCafes, setLoadingCafes] = useState(true)
  const [loadingSourcePromotions, setLoadingSourcePromotions] = useState(false)
  const [copying, setCopying] = useState(false)

  const targetCafe = cafes.find((cafe) => cafe.id === targetCafeId)
  const sourceCafes = cafes.filter((cafe) => cafe.id !== targetCafeId)
  const sourceCafe = cafes.find((cafe) => cafe.id === sourceCafeId)
  const selectedPromotion = sourcePromotions.find((promotion) => promotion.id === selectedPromotionId)
  const existingCodes = useMemo(
    () => new Set(targetPromotions.map((promotion) => promotion.code.toUpperCase())),
    [targetPromotions]
  )

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        setLoadingCafes(true)
        const data = await promotionApi.listProviderCafes()
        if (!mounted) return
        const nextTargetCafeId =
          requestedCafeId && data.some((cafe) => cafe.id === requestedCafeId)
            ? requestedCafeId
            : data[0]?.id || ""
        setCafes(data)
        setTargetCafeId((current) => current || nextTargetCafeId)
        setSourceCafeId((current) => current || data.find((cafe) => cafe.id !== nextTargetCafeId)?.id || "")
      } catch {
        toast.error("Không tải được danh sách chi nhánh")
      } finally {
        if (mounted) setLoadingCafes(false)
      }
    }

    void loadCafes()
    return () => {
      mounted = false
    }
  }, [requestedCafeId])

  useEffect(() => {
    if (!targetCafeId) {
      queueMicrotask(() => setTargetPromotions([]))
      return
    }

    let mounted = true

    async function loadTargetPromotions() {
      try {
        const data = await promotionApi.listByCafe(targetCafeId)
        if (mounted) setTargetPromotions(data)
      } catch {
        toast.error("Không tải được ưu đãi của chi nhánh đích")
      }
    }

    void loadTargetPromotions()
    return () => {
      mounted = false
    }
  }, [targetCafeId])

  useEffect(() => {
    if (!sourceCafeId) {
      queueMicrotask(() => {
        setSourcePromotions([])
        setSelectedPromotionId("")
      })
      return
    }

    let mounted = true

    async function loadSourcePromotions() {
      try {
        setLoadingSourcePromotions(true)
        const data = await promotionApi.listByCafe(sourceCafeId)
        if (!mounted) return
        setSourcePromotions(data)
        setSelectedPromotionId((current) => current || data[0]?.id || "")
      } catch {
        toast.error("Không tải được mã ưu đãi của chi nhánh nguồn")
      } finally {
        if (mounted) setLoadingSourcePromotions(false)
      }
    }

    void loadSourcePromotions()
    return () => {
      mounted = false
    }
  }, [sourceCafeId])

  const goBack = () => {
    navigate(buildPromotionsPath(targetCafeId || requestedCafeId))
  }

  const copyPromotionToTargetCafe = async () => {
    if (!targetCafeId || !selectedPromotion) return
    if (existingCodes.has(selectedPromotion.code.toUpperCase())) {
      toast.error("Mã ưu đãi này đã có ở chi nhánh đang chọn")
      return
    }

    try {
      setCopying(true)
      const saved = await promotionApi.create(targetCafeId, promotionToPayload(selectedPromotion))
      toast.success(`Đã thêm mã ${saved.code} vào ${targetCafe?.name ?? "chi nhánh đang chọn"}`)
      navigate(buildPromotionsPath(targetCafeId))
    } catch (error) {
      toast.error("Không sao chép được mã ưu đãi", {
        description: getErrorMessage(error),
      })
    } finally {
      setCopying(false)
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Thêm mã từ chi nhánh"
        description="Sao chép một mã ưu đãi đã có từ chi nhánh khác sang chi nhánh đang chọn."
      />

      <div className="space-y-4">
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách ưu đãi
          </Button>
        </div>

        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">
              Chi nhánh áp dụng
            </Label>
            <select
              value={targetCafeId}
              onChange={(event) => {
                const nextCafeId = event.target.value
                setTargetCafeId(nextCafeId)
                setSourceCafeId(cafes.find((cafe) => cafe.id !== nextCafeId)?.id || "")
                setSelectedPromotionId("")
                setSearchParams(nextCafeId ? { cafeId: nextCafeId } : {})
              }}
              disabled={loadingCafes || cafes.length === 0}
              className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold disabled:bg-[#f6f3f2]"
            >
              {cafes.length === 0 ? <option>Chưa có chi nhánh</option> : null}
              {cafes.map((cafe) => (
                <option key={cafe.id} value={cafe.id}>
                  {cafe.name} - {cafe.district}, {cafe.city}
                </option>
              ))}
            </select>
          </div>
        </Panel>

        <CopyPromotionPanel
          targetCafe={targetCafe}
          sourceCafes={sourceCafes}
          sourceCafeId={sourceCafeId}
          sourceCafe={sourceCafe}
          promotions={sourcePromotions}
          existingCodes={existingCodes}
          selectedPromotionId={selectedPromotionId}
          loading={loadingSourcePromotions}
          copying={copying}
          onSourceCafeChange={(value) => {
            setSourceCafeId(value)
            setSelectedPromotionId("")
          }}
          onPromotionChange={setSelectedPromotionId}
          onCancel={goBack}
          onCopy={() => void copyPromotionToTargetCafe()}
        />
      </div>
    </ProviderShell>
  )
}

function getPromotionFormInlineErrors(form: PromotionFormState) {
  const errors: Record<string, string> = {}

  if (!form.code.trim()) {
    errors.code = "Vui lòng nhập mã ưu đãi"
  }

  if (!form.discountValue.trim()) {
    errors.discountValue = "Vui lòng nhập giá trị giảm"
  } else if (Number(form.discountValue) <= 0) {
    errors.discountValue = "Giá trị giảm phải lớn hơn 0"
  } else if (form.discountType === "PERCENT" && Number(form.discountValue) > 100) {
    errors.discountValue = "Phần trăm giảm giá không thể lớn hơn 100"
  }

  if (form.maxDiscountAmount.trim() && Number(form.maxDiscountAmount) <= 0) {
    errors.maxDiscountAmount = "Giảm tối đa phải lớn hơn 0"
  }

  if (form.minOrderAmount.trim() && Number(form.minOrderAmount) <= 0) {
    errors.minOrderAmount = "Đơn tối thiểu phải lớn hơn 0"
  }

  if (form.maxUses.trim() && Number(form.maxUses) <= 0) {
    errors.maxUses = "Tổng lượt dùng phải lớn hơn 0"
  }

  if (!form.maxUsesPerUser.trim()) {
    errors.maxUsesPerUser = "Vui lòng nhập lượt dùng mỗi khách"
  } else if (Number(form.maxUsesPerUser) <= 0) {
    errors.maxUsesPerUser = "Lượt dùng mỗi khách phải lớn hơn 0"
  }

  if (!form.startDate) {
    errors.startDate = "Vui lòng chọn ngày bắt đầu"
  }

  if (!form.startTime) {
    errors.startTime = "Vui lòng chọn giờ bắt đầu"
  }

  if (form.scheduleMode !== "ONCE") {
    if (!form.endDate) {
      errors.endDate = "Vui lòng chọn ngày cuối áp dụng"
    }
    if (!form.endTime) {
      errors.endTime = "Vui lòng chọn giờ kết thúc"
    }
  } else {
    if (form.endDate && !form.endTime) {
      errors.endTime = "Vui lòng chọn giờ kết thúc"
    } else if (!form.endDate && form.endTime) {
      errors.endDate = "Vui lòng chọn ngày kết thúc"
    }
  }

  if (form.scheduleMode === "WEEKLY" && form.weekdays.length === 0) {
    errors.weekdays = "Vui lòng chọn ít nhất một ngày trong tuần"
  }

  if (form.startDate && form.startTime) {
    const startsAt = composeLocalDateTime(form.startDate, form.startTime)
    if (Number.isNaN(startsAt.getTime())) {
      errors.startDate = "Vui lòng chọn thời gian bắt đầu hợp lệ"
    }

    if (form.endDate && form.endTime) {
      const expiresAt = composeLocalDateTime(form.endDate, form.endTime)
      if (!Number.isNaN(expiresAt.getTime()) && !Number.isNaN(startsAt.getTime())) {
        if (expiresAt.getTime() <= startsAt.getTime()) {
          errors.endDate = "Thời gian kết thúc phải sau thời gian bắt đầu"
          errors.endTime = "Thời gian kết thúc phải sau thời gian bắt đầu"
        }
      }
    }
  }

  return errors
}

function PromotionForm({
  cafe,
  form,
  editing,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  cafe?: ProviderCafe
  form: PromotionFormState
  editing: Promotion | null
  saving: boolean
  onChange: (form: PromotionFormState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [showErrors, setShowErrors] = useState(false)
  const errors = useMemo(() => getPromotionFormInlineErrors(form), [form])

  const setField = <K extends keyof PromotionFormState>(key: K, value: PromotionFormState[K]) => {
    onChange({ ...form, [key]: value })
  }
  const minStartDate = toDateInputValue(new Date())
  const minEndDate = form.startDate || minStartDate
  const handleStartDateChange = (value: string) => {
    onChange({
      ...form,
      startDate: value,
      endDate: form.endDate && value && form.endDate < value ? "" : form.endDate,
    })
  }
  const handleEndDateChange = (value: string) => {
    setField("endDate", value && value < minEndDate ? minEndDate : value)
  }
  const toggleWeekday = (weekday: string) => {
    setField(
      "weekdays",
      form.weekdays.includes(weekday)
        ? form.weekdays.filter((item) => item !== weekday)
        : [...form.weekdays, weekday]
    )
  }

  const handleSaveClick = () => {
    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setShowErrors(true)
      const firstError = Object.values(errors)[0]
      toast.error(firstError)
      return
    }
    onSave()
  }

  return (
    <Panel className="border-orange-200">
      <PanelTitle
        title={editing ? `Chỉnh sửa ${editing.code}` : "Tạo ưu đãi mới"}
        subtitle={cafe ? `Áp dụng cho chi nhánh: ${cafe.name}` : "Chọn chi nhánh trước khi tạo ưu đãi."}
        action={
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-lg">
            <X className="size-5" />
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Mã ưu đãi" error={showErrors ? errors.code : undefined} tooltip="Chuỗi ký tự khách nhập khi thanh toán để được giảm giá. Chỉ dùng chữ in hoa, số, dấu gạch ngang hoặc gạch dưới. Ví dụ: SUMMER20, DRIFT-10K">
          <Input aria-invalid={showErrors && !!errors.code} value={form.code} onChange={(event) => setField("code", event.target.value.toUpperCase())} placeholder="EX: DRIFTNIGHT20" className="h-11 rounded-lg bg-white font-mono font-bold" />
        </Field>
        <Field label="Phạm vi áp dụng" error={showErrors ? errors.applicableTo : undefined} tooltip="Giới hạn mã chỉ dùng cho một hình thức chơi. Tất cả — áp dụng cho cả thuê xe lẫn mang xe cá nhân.">
          <select aria-invalid={showErrors && !!errors.applicableTo} value={form.applicableTo} onChange={(event) => setField("applicableTo", event.target.value as PromoApplicableTo)} className={cn("h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold", showErrors && errors.applicableTo && "border-destructive focus-visible:border-destructive")}>
            <option value="ALL">Tất cả booking</option>
            <option value="RENTAL">Thuê xe</option>
            <option value="BYOC">Mang xe cá nhân</option>
          </select>
        </Field>
        <Field label="Loại giảm giá" error={showErrors ? errors.discountType : undefined} tooltip="Phần trăm — giảm theo % tổng đơn (slot + thuê xe). Số tiền cố định — trừ thẳng một khoản VND cố định không phụ thuộc giá trị đơn.">
          <select
            aria-invalid={showErrors && !!errors.discountType}
            value={form.discountType}
            onChange={(event) => {
              const nextType = event.target.value as DiscountType
              if (nextType === "FIXED") {
                onChange({
                  ...form,
                  discountType: nextType,
                  maxDiscountAmount: "",
                })
              } else {
                setField("discountType", nextType)
              }
            }}
            className={cn("h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold", showErrors && errors.discountType && "border-destructive focus-visible:border-destructive")}
          >
            <option value="PERCENT">Phần trăm</option>
            <option value="FIXED">Số tiền cố định</option>
          </select>
        </Field>
        <Field label={form.discountType === "PERCENT" ? "Giá trị giảm (%)" : "Giá trị giảm (VND)"} error={showErrors ? errors.discountValue : undefined} tooltip={form.discountType === "PERCENT" ? "Phần trăm giảm trên tổng đơn, từ 1–100. Ví dụ: nhập 20 để giảm 20% tổng tiền booking." : "Số tiền giảm cố định tính bằng VND. Ví dụ: nhập 50000 để giảm 50.000đ."}>
          {form.discountType === "PERCENT" ? (
            <Input aria-invalid={showErrors && !!errors.discountValue} type="number" min="0" value={form.discountValue} onChange={(event) => setField("discountValue", event.target.value)} className="h-11 rounded-lg bg-white font-bold" />
          ) : (
            <FormattedNumberInput aria-invalid={showErrors && !!errors.discountValue} value={form.discountValue} onChange={(val) => setField("discountValue", val)} className="h-11 rounded-lg bg-white font-bold" />
          )}
        </Field>
        <Field label="Giảm tối đa" error={showErrors ? errors.maxDiscountAmount : undefined} tooltip="Chỉ dùng khi loại giảm là Phần trăm. Giới hạn số tiền giảm tối đa tính bằng VND. Ví dụ: giảm 30% nhưng không quá 100.000đ — để trống nếu không giới hạn.">
          <FormattedNumberInput
            aria-invalid={showErrors && !!errors.maxDiscountAmount}
            value={form.maxDiscountAmount}
            onChange={(val) => setField("maxDiscountAmount", val)}
            placeholder={form.discountType === "FIXED" ? "Không áp dụng cho số tiền cố định" : "Bỏ trống nếu không giới hạn"}
            className="h-11 rounded-lg bg-white disabled:cursor-not-allowed disabled:bg-[#f6f3f2] disabled:text-[#747878]"
            disabled={form.discountType === "FIXED"}
          />
        </Field>
        <Field label="Đơn tối thiểu" error={showErrors ? errors.minOrderAmount : undefined} tooltip="Tổng tiền booking tối thiểu (VND) để mã được chấp nhận. Booking thấp hơn mức này sẽ không áp dụng được — để trống nếu không yêu cầu.">
          <FormattedNumberInput aria-invalid={showErrors && !!errors.minOrderAmount} value={form.minOrderAmount} onChange={(val) => setField("minOrderAmount", val)} placeholder="Bỏ trống nếu không yêu cầu" className="h-11 rounded-lg bg-white" />
        </Field>
        <Field label="Tổng lượt dùng" error={showErrors ? errors.maxUses : undefined} tooltip="Số lần tối đa mã có thể được sử dụng bởi tất cả khách cộng lại. Khi đạt giới hạn, mã tự khóa — để trống nếu không giới hạn.">
          <Input aria-invalid={showErrors && !!errors.maxUses} type="number" min="1" value={form.maxUses} onChange={(event) => setField("maxUses", event.target.value)} placeholder="Không giới hạn" className="h-11 rounded-lg bg-white" />
        </Field>
        <Field label="Lượt dùng mỗi khách" error={showErrors ? errors.maxUsesPerUser : undefined} tooltip="Số lần tối đa một khách hàng có thể dùng mã này. Đặt là 1 để mỗi khách chỉ dùng được một lần duy nhất.">
          <Input aria-invalid={showErrors && !!errors.maxUsesPerUser} type="number" min="1" value={form.maxUsesPerUser} onChange={(event) => setField("maxUsesPerUser", event.target.value)} className="h-11 rounded-lg bg-white" />
        </Field>
        <div className="space-y-4 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4 md:col-span-2">
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Thời gian áp dụng</p>
            <p className="mt-1 text-xs font-semibold text-[#747878]">
              Chọn ngày, giờ và kiểu lặp cho mã ưu đãi.
            </p>
          </div>

          <Field label="Kiểu thời gian" error={showErrors ? errors.scheduleMode : undefined} tooltip="Không lặp — mã chạy một lần trong khoảng ngày giờ xác định. Hằng ngày — mã lặp lại theo khung giờ mỗi ngày. Theo thứ — mã chỉ áp dụng vào những ngày trong tuần được chọn.">
            <div className="grid gap-2 sm:grid-cols-3">
              {scheduleModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setField("scheduleMode", option.value)}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-bold transition",
                    form.scheduleMode === option.value
                      ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm"
                      : "border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2]"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ngày bắt đầu" error={showErrors ? errors.startDate : undefined} tooltip="Ngày mã bắt đầu có hiệu lực. Trước ngày này khách chưa dùng được.">
              <Input aria-invalid={showErrors && !!errors.startDate} type="date" min={minStartDate} value={form.startDate} onChange={(event) => handleStartDateChange(event.target.value)} className="h-11 rounded-lg bg-white" />
            </Field>
            <Field label="Giờ bắt đầu" error={showErrors ? errors.startTime : undefined} tooltip="Giờ trong ngày mã bắt đầu nhận. Với lịch lặp, đây là giờ mở đầu khung áp dụng mỗi ngày.">
              <Input aria-invalid={showErrors && !!errors.startTime} type="time" value={form.startTime} onChange={(event) => setField("startTime", event.target.value)} className="h-11 rounded-lg bg-white" />
            </Field>
            <Field label={form.scheduleMode === "ONCE" ? "Ngày kết thúc" : "Ngày cuối áp dụng"} error={showErrors ? errors.endDate : undefined} tooltip={form.scheduleMode === "ONCE" ? "Ngày mã hết hạn. Sau ngày này khách không dùng được nữa — để trống nếu không có ngày hết hạn." : "Ngày cuối cùng mã còn hoạt động. Sau ngày này lịch lặp sẽ dừng."}>
              <Input aria-invalid={showErrors && !!errors.endDate} type="date" min={minEndDate} value={form.endDate} onChange={(event) => handleEndDateChange(event.target.value)} className="h-11 rounded-lg bg-white" />
            </Field>
            <Field label={form.scheduleMode === "ONCE" ? "Giờ kết thúc" : "Giờ kết thúc mỗi lần"} error={showErrors ? errors.endTime : undefined} tooltip={form.scheduleMode === "ONCE" ? "Giờ trong ngày mã hết hạn." : "Giờ đóng cửa khung áp dụng mỗi ngày. Booking bắt đầu sau giờ này sẽ không được giảm."}>
              <Input aria-invalid={showErrors && !!errors.endTime} type="time" value={form.endTime} onChange={(event) => setField("endTime", event.target.value)} className="h-11 rounded-lg bg-white" />
            </Field>
          </div>

          {form.scheduleMode === "WEEKLY" ? (
            <Field label="Ngày trong tuần" error={showErrors ? errors.weekdays : undefined}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {weekdayOptions.map((weekday) => (
                  <label
                    key={weekday.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-bold transition",
                      form.weekdays.includes(weekday.value)
                        ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm"
                        : "border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(weekday.value)}
                      onChange={() => toggleWeekday(weekday.value)}
                      className="sr-only"
                    />
                    {weekday.label}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <Field label="Mô tả" error={showErrors ? errors.description : undefined}>
            <Textarea aria-invalid={showErrors && !!errors.description} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Điều kiện áp dụng hoặc ghi chú nội bộ" className="min-h-24 rounded-lg bg-white" />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-3 md:col-span-2">
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Đang hoạt động</p>
            <p className="text-xs font-semibold text-[#747878]">Tắt để giữ mã nhưng không cho khách sử dụng.</p>
          </div>
          <Switch checked={form.isActive} onCheckedChange={(checked) => setField("isActive", checked)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-3 md:col-span-2">
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Hiển thị trên trang chi tiết cà phê</p>
            <p className="text-xs font-semibold text-[#747878]">Tắt để mã chỉ áp dụng khi khách nhập, không hiển thị banner quảng cáo.</p>
          </div>
          <Switch checked={form.showOnCafePage} onCheckedChange={(checked) => setField("showOnCafePage", checked)} />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-[#e5e2e1] pt-5">
        <Button variant="outline" onClick={onCancel} className="rounded-lg bg-white font-bold">Hủy</Button>
        <Button disabled={saving} onClick={handleSaveClick} className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
          <Save className="mr-2 size-4" />
          {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Lưu ưu đãi"}
        </Button>
      </div>
    </Panel>
  )
}

function CopyPromotionPanel({
  targetCafe,
  sourceCafes,
  sourceCafeId,
  sourceCafe,
  promotions,
  existingCodes,
  selectedPromotionId,
  loading,
  copying,
  onSourceCafeChange,
  onPromotionChange,
  onCancel,
  onCopy,
}: {
  targetCafe?: ProviderCafe
  sourceCafes: ProviderCafe[]
  sourceCafeId: string
  sourceCafe?: ProviderCafe
  promotions: Promotion[]
  existingCodes: Set<string>
  selectedPromotionId: string
  loading: boolean
  copying: boolean
  onSourceCafeChange: (value: string) => void
  onPromotionChange: (value: string) => void
  onCancel: () => void
  onCopy: () => void
}) {
  const selectedPromotion = promotions.find((promotion) => promotion.id === selectedPromotionId)
  const selectedPromotionExists = selectedPromotion ? existingCodes.has(selectedPromotion.code.toUpperCase()) : false

  return (
    <Panel className="border-orange-200">
      <PanelTitle
        title="Thêm mã từ chi nhánh khác"
        subtitle={targetCafe ? `Sao chép mã ưu đãi sang chi nhánh: ${targetCafe.name}` : "Chọn chi nhánh đích trước khi sao chép mã."}
        action={
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-lg">
            <X className="size-5" />
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Chi nhánh nguồn">
          <select
            value={sourceCafeId}
            onChange={(event) => onSourceCafeChange(event.target.value)}
            className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold"
          >
            {sourceCafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>
                {cafe.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mã đã tạo">
          <select
            value={selectedPromotionId}
            onChange={(event) => onPromotionChange(event.target.value)}
            disabled={loading || promotions.length === 0}
            className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold disabled:bg-[#f6f3f2]"
          >
            {loading ? <option>Đang tải mã ưu đãi...</option> : null}
            {!loading && promotions.length === 0 ? <option>Chi nhánh này chưa có mã</option> : null}
            {!loading
              ? promotions.map((promotion) => {
                  const exists = existingCodes.has(promotion.code.toUpperCase())
                  return (
                  <option key={promotion.id} value={promotion.id} disabled={exists}>
                    {promotion.code} - {formatDiscount(promotion)}{exists ? " (đã có)" : ""}
                  </option>
                  )
                })
              : null}
          </select>
        </Field>
      </div>

      {selectedPromotion ? (
        <div className="mt-4 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">
              {selectedPromotion.code}
            </span>
            <Badge className={cn("border font-bold", getPromotionStatus(selectedPromotion).className)}>
              {getPromotionStatus(selectedPromotion).label}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-bold text-[#1c1b1b]">
            {sourceCafe?.name} {"->"} {targetCafe?.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#5d5f5f]">
            {selectedPromotion.description || "Chưa có mô tả"}
          </p>
          <p className="mt-3 text-xs font-bold uppercase text-[#747878]">
            {formatDiscount(selectedPromotion)} · {applicableLabel(selectedPromotion.applicableTo)}
          </p>
          {selectedPromotionExists ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              Mã này đã có ở chi nhánh đích, vui lòng chọn mã khác.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-3 border-t border-[#e5e2e1] pt-5">
        <Button variant="outline" onClick={onCancel} className="rounded-lg bg-white font-bold">Hủy</Button>
        <Button disabled={copying || !selectedPromotionId || !targetCafe || selectedPromotionExists} onClick={onCopy} className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
          <Copy className="mr-2 size-4" />
          {copying ? "Đang thêm..." : "Thêm vào chi nhánh"}
        </Button>
      </div>
    </Panel>
  )
}

function FieldTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/tip ml-1 align-middle">
      <HelpCircle className="size-3.5 text-[#9ca3af] cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg bg-[#1c1b1b] px-3 py-2 text-center text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1c1b1b]" />
      </span>
    </span>
  )
}

function Field({ label, children, error, tooltip }: { label: string; children: React.ReactNode; error?: string; tooltip?: string }) {
  return (
    <div className="space-y-2">
      <Label className="font-sans text-xs font-bold uppercase tracking-wider text-[#1c1b1b]">
        {label}
        {tooltip && <FieldTooltip text={tooltip} />}
      </Label>
      {children}
      {error && (
        <p className="text-xs font-bold text-red-600 animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </p>
      )}
    </div>
  )
}

function PromotionRow({
  promotion,
  selected,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: {
  promotion: Promotion
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const status = getPromotionStatus(promotion)

  return (
    <article className={cn(
      "grid gap-4 rounded-lg border bg-white p-4 transition hover:bg-[#fcf8f8] lg:grid-cols-[auto_1.2fr_1fr_1fr_auto] lg:items-center",
      selected ? "border-orange-300 bg-orange-50/60" : "border-[#e5e2e1]"
    )}>
      <label className="flex items-center gap-2 self-start lg:self-center" aria-label={`Chọn mã ${promotion.code}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="size-4 rounded border-[#c4c7c8] accent-orange-600"
        />
      </label>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#f6f3f2] px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">
            {promotion.code}
          </span>
          <Badge className={cn("border font-bold", status.className)}>{status.label}</Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-xs font-semibold text-[#5d5f5f]">
          {promotion.description || "Chưa có mô tả"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">Giá trị</p>
        <p className="mt-1 text-sm font-extrabold text-[#1c1b1b]">{formatDiscount(promotion)}</p>
        <p className="mt-1 text-xs font-bold text-[#747878]">{applicableLabel(promotion.applicableTo)}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#747878]">
          {promotion.showOnCafePage ? "🟢 Hiển thị banner" : "⚪ Ẩn banner"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">Lượt dùng</p>
        <p className="mt-1 text-sm font-extrabold text-[#1c1b1b]">
          {promotion.usesCount}/{promotion.maxUses ?? "∞"}
        </p>
        <p className="mt-1 text-xs font-bold text-[#747878]">Mỗi khách: {promotion.maxUsesPerUser}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="icon" onClick={onEdit} className="rounded-lg bg-white">
          <Edit3 className="size-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onToggle} className="rounded-lg bg-white">
          <PauseCircle className="size-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onDelete} className="rounded-lg bg-white text-red-600 hover:bg-red-50">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  )
}

function toPayload(form: PromotionFormState): PromotionPayload {
  const startsAt = composeLocalDateTime(form.startDate, form.startTime)
  const expiresAt = form.endDate && form.endTime ? composeLocalDateTime(form.endDate, form.endTime) : null

  return {
    code: form.code.trim().toUpperCase(),
    description: form.description.trim() || null,
    discount_type: form.discountType,
    discount_value: Number(form.discountValue),
    max_discount_amount: optionalNumber(form.maxDiscountAmount),
    min_order_amount: optionalNumber(form.minOrderAmount),
    max_uses: optionalNumber(form.maxUses),
    max_uses_per_user: Number(form.maxUsesPerUser || 1),
    applicable_to: form.applicableTo,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    schedule_mode: form.scheduleMode,
    schedule_start_time: form.startTime || null,
    schedule_end_time: form.endTime || null,
    schedule_weekdays: form.scheduleMode === "WEEKLY" ? form.weekdays : [],
    is_active: form.isActive,
    show_on_cafe_page: form.showOnCafePage,
  }
}

function promotionToPayload(promotion: Promotion): PromotionPayload {
  return {
    code: promotion.code,
    description: promotion.description,
    discount_type: promotion.discountType,
    discount_value: Number(promotion.discountValue),
    max_discount_amount: promotion.maxDiscountAmount === null ? null : Number(promotion.maxDiscountAmount),
    min_order_amount: promotion.minOrderAmount === null ? null : Number(promotion.minOrderAmount),
    max_uses: promotion.maxUses,
    max_uses_per_user: promotion.maxUsesPerUser,
    applicable_to: promotion.applicableTo,
    starts_at: promotion.startsAt,
    expires_at: promotion.expiresAt,
    schedule_mode: promotion.scheduleMode,
    schedule_start_time: normalizeTimeInput(promotion.scheduleStartTime),
    schedule_end_time: normalizeTimeInput(promotion.scheduleEndTime),
    schedule_weekdays: promotion.scheduleWeekdays,
    is_active: promotion.isActive,
    show_on_cafe_page: promotion.showOnCafePage,
  }
}

function promotionToForm(promotion: Promotion): PromotionFormState {
  const start = splitDateTimeInput(new Date(promotion.startsAt))
  const end = promotion.expiresAt ? splitDateTimeInput(new Date(promotion.expiresAt)) : null

  return {
    code: promotion.code,
    description: promotion.description ?? "",
    discountType: promotion.discountType,
    discountValue: numberInputValue(promotion.discountValue),
    maxDiscountAmount: numberInputValue(promotion.maxDiscountAmount),
    minOrderAmount: numberInputValue(promotion.minOrderAmount),
    maxUses: promotion.maxUses?.toString() ?? "",
    maxUsesPerUser: promotion.maxUsesPerUser.toString(),
    applicableTo: promotion.applicableTo,
    scheduleMode: promotion.scheduleMode ?? "ONCE",
    startDate: start.date,
    startTime: normalizeTimeInput(promotion.scheduleStartTime) ?? start.time,
    endDate: end?.date ?? "",
    endTime: normalizeTimeInput(promotion.scheduleEndTime) ?? end?.time ?? "",
    weekdays: promotion.scheduleWeekdays ?? [],
    isActive: promotion.isActive,
    showOnCafePage: promotion.showOnCafePage,
  }
}

function promotionToDeleteItem(promotion: Promotion) {
  return {
    id: promotion.id,
    code: promotion.code,
    status: getPromotionStatus(promotion).label,
    statusClassName: getPromotionStatus(promotion).className,
    description: promotion.description || "Chưa có mô tả",
    details: `${formatDiscount(promotion)} · Đã dùng ${promotion.usesCount}/${promotion.maxUses ?? "∞"}`,
  }
}

interface FormattedNumberInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string
  onChange: (val: string) => void
}

function FormattedNumberInput({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: FormattedNumberInputProps) {
  const format = (str: string) => {
    const clean = str.replace(/\D/g, "")
    if (!clean) return ""
    return new Intl.NumberFormat("en-US").format(Number(clean))
  }

  const displayValue = format(value)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const clean = raw.replace(/\D/g, "")
    onChange(clean)
  }

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  )
}

function getPromotionFormError(form: PromotionFormState) {
  if (!form.code.trim()) return "Vui lòng nhập mã ưu đãi"
  if (!form.discountValue.trim() || Number(form.discountValue) <= 0) {
    return "Giá trị giảm phải lớn hơn 0"
  }
  if (!form.maxUsesPerUser.trim() || Number(form.maxUsesPerUser) <= 0) {
    return "Lượt dùng mỗi khách phải lớn hơn 0"
  }
  if (!form.startDate) return "Vui lòng chọn ngày bắt đầu"
  if (!form.startTime) return "Vui lòng chọn giờ bắt đầu"
  if (form.scheduleMode !== "ONCE" && !form.endDate) return "Vui lòng chọn ngày cuối áp dụng"
  if (form.scheduleMode !== "ONCE" && !form.endTime) return "Vui lòng chọn giờ kết thúc"
  if (form.scheduleMode === "WEEKLY" && form.weekdays.length === 0) {
    return "Vui lòng chọn ít nhất một ngày trong tuần"
  }
  if ((form.endDate && !form.endTime) || (!form.endDate && form.endTime)) {
    return "Vui lòng chọn đủ ngày và giờ kết thúc"
  }
  const startsAt = composeLocalDateTime(form.startDate, form.startTime)
  const expiresAt = form.endDate && form.endTime ? composeLocalDateTime(form.endDate, form.endTime) : null
  if (Number.isNaN(startsAt.getTime())) return "Vui lòng chọn thời gian bắt đầu hợp lệ"
  if (expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    return "Thời gian kết thúc phải sau thời gian bắt đầu"
  }
  return null
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null
}

function splitDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  }
}

function toDateInputValue(date: Date) {
  return splitDateTimeInput(date).date
}

function toTimeInputValue(date: Date) {
  return splitDateTimeInput(date).time
}

function composeLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}`)
}

function normalizeTimeInput(value?: string | null) {
  return value ? value.slice(0, 5) : null
}

function numberInputValue(value: string | null) {
  return value === null ? "" : String(Number(value))
}

function isPromotionLive(promotion: Promotion, now = Date.now()) {
  if (!promotion.isActive) return false
  if (new Date(promotion.startsAt).getTime() > now) return false
  if (promotion.expiresAt && new Date(promotion.expiresAt).getTime() < now) return false
  if (promotion.maxUses !== null && promotion.usesCount >= promotion.maxUses) return false
  return true
}

function getPromotionStatus(promotion: Promotion) {
  if (!promotion.isActive) return { label: "Đã tắt", className: "border-slate-200 bg-slate-50 text-slate-600" }
  if (new Date(promotion.startsAt).getTime() > Date.now()) return { label: "Sắp chạy", className: "border-blue-200 bg-blue-50 text-blue-700" }
  if (promotion.expiresAt && new Date(promotion.expiresAt).getTime() < Date.now()) return { label: "Hết hạn", className: "border-red-200 bg-red-50 text-red-700" }
  if (promotion.maxUses !== null && promotion.usesCount >= promotion.maxUses) return { label: "Hết lượt", className: "border-amber-200 bg-amber-50 text-amber-700" }
  return { label: "Đang chạy", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
}

function formatDiscount(promotion: Promotion) {
  if (promotion.discountType === "PERCENT") {
    const cap = promotion.maxDiscountAmount ? `, tối đa ${formatMoney(promotion.maxDiscountAmount)}` : ""
    return `${Number(promotion.discountValue)}%${cap}`
  }
  return formatMoney(promotion.discountValue)
}

function formatMoney(value: string) {
  return `${Number(value).toLocaleString("vi-VN")} đ`
}

function applicableLabel(value: PromoApplicableTo) {
  return {
    ALL: "Tất cả booking",
    RENTAL: "Thuê xe",
    BYOC: "Mang xe cá nhân",
  }[value]
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    return response?.data?.message
  }
  return undefined
}

function buildPromotionsPath(cafeId?: string) {
  return cafeId ? `/provider/cafes/${cafeId}?tab=promotions` : routePaths.providerPromotions
}
