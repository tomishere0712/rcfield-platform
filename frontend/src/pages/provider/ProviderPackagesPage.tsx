import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import type { ReactNode } from "react"
import {
  ArrowLeft,
  Boxes,
  Building2,
  Check,
  Copy,
  Edit3,
  PackagePlus,
  PauseCircle,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import {
  packageApi,
  type PackageApplicablePlayMode,
  type PackageBillingPeriod,
  type PackagePayload,
  type ProviderCafe,
  type RecurringPackage,
} from "@/features/packages/api/package.api"
import { DeleteConfirmationModal } from "@/pages/provider/components/DeleteConfirmationModal"
import { MetricCard, Panel, PanelTitle, ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { routePaths } from "@/app/router/route-paths"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"

type PackageFormState = {
  code: string
  name: string
  description: string
  slotCount: string
  billingPeriod: PackageBillingPeriod
  price: string
  benefits: string
  applicablePlayModes: PackageApplicablePlayMode[]
  isPopular: boolean
  isActive: boolean
}

const defaultForm: PackageFormState = {
  code: "",
  name: "",
  description: "",
  slotCount: "4",
  billingPeriod: "WEEK",
  price: "",
  benefits: "",
  applicablePlayModes: ["RENTAL", "BYOC"],
  isPopular: false,
  isActive: true,
}

export function ProviderPackagesPage({ cafeId: propCafeId }: { cafeId?: string }) {
  const formPanelRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState(propCafeId ?? "")
  const [packages, setPackages] = useState<RecurringPackage[]>([])
  const [sourcePackages] = useState<RecurringPackage[]>([])
  const [sourceCafeId, setSourceCafeId] = useState("")
  const [selectedSourcePackageId, setSelectedSourcePackageId] = useState("")
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([])
  const [editingPackage, setEditingPackage] = useState<RecurringPackage | null>(null)
  const [deleteMode, setDeleteMode] = useState<"single" | "selected" | "all" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringPackage | null>(null)
  const [form, setForm] = useState<PackageFormState>(defaultForm)
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"list" | "form" | "copy">("list")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId)
  const sourceCafes = cafes.filter((cafe) => cafe.id !== selectedCafeId)
  const existingCodes = useMemo(() => new Set(packages.map((item) => item.code.toUpperCase())), [packages])
  const selectedPackage = sourcePackages.find((item) => item.id === selectedSourcePackageId)
  const selectedPackageExists = selectedPackage ? existingCodes.has(selectedPackage.code.toUpperCase()) : false
  const selectedPackages = packages.filter((item) => selectedPackageIds.includes(item.id))
  const allPackagesSelected = packages.length > 0 && selectedPackageIds.length === packages.length
  const filteredPackages = packages.filter((item) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true
    return `${item.code} ${item.name} ${item.description ?? ""}`.toLowerCase().includes(keyword)
  })

  const stats = useMemo(() => {
    const active = packages.filter((item) => item.isActive).length
    const totalSlots = packages.filter((item) => item.isActive).reduce((total, item) => total + item.slotCount, 0)
    const popular = packages.find((item) => item.isPopular) ?? packages[0]
    return { active, totalSlots, popular }
  }, [packages])

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        setLoading(true)
        const data = await packageApi.listProviderCafes()
        if (!mounted) return
        setCafes(data)
        setSelectedCafeId((current) => propCafeId || current || searchParams.get("cafeId") || data[0]?.id || "")
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
  }, [searchParams, propCafeId])

  useEffect(() => {
    if (!selectedCafeId) {
      queueMicrotask(() => setPackages([]))
      return
    }

    let mounted = true

    async function loadPackages() {
      try {
        setLoading(true)
        const data = await packageApi.listByCafe(selectedCafeId)
        if (mounted) setPackages(data)
    } catch {
      toast.error("Không tải được danh sách gói của chi nhánh")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadPackages()
    return () => {
      mounted = false
    }
  }, [selectedCafeId])

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedPackageIds([])
      setDeleteMode(null)
      setDeleteTarget(null)
    })
    if (selectedCafeId && !propCafeId) setSearchParams({ cafeId: selectedCafeId }, { replace: true })
  }, [selectedCafeId, propCafeId, setSearchParams])

  const startCreate = () => {
    navigate(`${routePaths.providerPackageCreate}?cafeId=${selectedCafeId}`)
  }

  const startEdit = (item: RecurringPackage) => {
    navigate(`${routePaths.providerPackageEdit.replace(":packageId", item.id)}?cafeId=${selectedCafeId}`)
  }

  const startCopy = () => {
    navigate(`${routePaths.providerPackageCopy}?cafeId=${selectedCafeId}`)
  }

  const savePackage = async () => {
    if (!selectedCafeId) return
    const { isValid, errors: validationErrors } = validatePackageForm(form, packages, editingPackage?.id)
    if (!isValid) {
      setErrors(validationErrors)
      toast.error("Vui lòng kiểm tra lại các thông tin nhập liệu")
      return
    }
    setErrors({})

    try {
      setSaving(true)
      const payload = toPayload(form)
      if (editingPackage) {
        const updated = await packageApi.update(selectedCafeId, editingPackage.id, payload)
        setPackages((items) => items.map((item) => (item.id === updated.id ? updated : item)))
        toast.success("Đã cập nhật gói định kì")
      } else {
        const created = await packageApi.create(selectedCafeId, payload)
        setPackages((items) => [created, ...items])
        toast.success("Đã tạo gói định kì")
      }
      setMode("list")
      setEditingPackage(null)
      setForm(defaultForm)
    } catch (error) {
      toast.error("Không lưu được gói định kỳ", {
        description: getErrorMessage(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const copyPackage = async () => {
    if (!selectedCafeId || !selectedPackage || selectedPackageExists) return
    try {
      setCopying(true)
      const created = await packageApi.create(selectedCafeId, packageToPayload(selectedPackage))
      setPackages((items) => [created, ...items])
      toast.success("Đã thêm gói từ chi nhánh khác")
      setMode("list")
    } catch (error) {
      toast.error("Không thêm được gói từ chi nhánh khác", {
        description: getErrorMessage(error),
      })
    } finally {
      setCopying(false)
    }
  }

  const toggleActive = async (item: RecurringPackage) => {
    if (!selectedCafeId) return
    const updated = await packageApi.update(selectedCafeId, item.id, { is_active: !item.isActive })
    setPackages((items) => items.map((current) => (current.id === updated.id ? updated : current)))
    toast.success(updated.isActive ? "Đã bật gói" : "Đã tắt gói")
  }

  const togglePriority = async (item: RecurringPackage) => {
    if (!selectedCafeId) return
    try {
      const updated = await packageApi.update(selectedCafeId, item.id, { is_popular: !item.isPopular })
      setPackages((items) => items.map((current) => (current.id === updated.id ? updated : current)))
      toast.success(updated.isPopular ? "Đã đánh dấu gói ưu tiên" : "Đã bỏ gói ưu tiên")
    } catch (error) {
      toast.error("Không cập nhật được gói ưu tiên", {
        description: getErrorMessage(error),
      })
    }
  }

  const toggleSelection = (packageId: string) => {
    setSelectedPackageIds((ids) => (ids.includes(packageId) ? ids.filter((id) => id !== packageId) : [...ids, packageId]))
  }

  const toggleAll = () => {
    setSelectedPackageIds(allPackagesSelected ? [] : packages.map((item) => item.id))
  }

  const confirmDelete = async () => {
    if (!selectedCafeId || !deleteMode) return
    const ids =
      deleteMode === "single" && deleteTarget
        ? [deleteTarget.id]
        : deleteMode === "selected"
          ? selectedPackageIds
          : packages.map((item) => item.id)

    await Promise.all(ids.map((id) => packageApi.remove(selectedCafeId, id)))
    setPackages((items) => items.filter((item) => !ids.includes(item.id)))
    setSelectedPackageIds((currentIds) => currentIds.filter((id) => !ids.includes(id)))
    setDeleteMode(null)
    setDeleteTarget(null)
    toast.success(ids.length === 1 ? "Đã xóa gói" : `Đã xóa ${ids.length} gói`)
  }

  const content = (
    <section className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Đang hoạt động" value={String(stats.active)} helper="Theo chi nhánh đang chọn" icon={<Boxes />} tone="success" />
        <MetricCard label="Tổng slot" value={String(stats.totalSlots)} helper="Slot định kì đang bán" icon={<PackagePlus />} tone="info" />
        <MetricCard label="Gói nổi bật" value={stats.popular?.name ?? "--"} helper={stats.popular ? formatPackageCycle(stats.popular) : "Chưa có dữ liệu"} icon={<Building2 />} tone="neutral" />
      </section>

      {!propCafeId && (
        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">
              Chi nhánh áp dụng
            </Label>
            <select
              value={selectedCafeId}
              onChange={(event) => setSelectedCafeId(event.target.value)}
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

      {mode === "form" ? (
        <div ref={formPanelRef}>
          <PackageFormPanel
            form={form}
            errors={errors}
            editing={!!editingPackage}
            saving={saving}
            onCancel={() => {
              setMode("list")
              setErrors({})
            }}
            onSave={savePackage}
            onFieldChange={(field, value) => {
              setForm((current) => ({ ...current, [field]: value }))
              if (errors[field]) {
                setErrors((current) => ({ ...current, [field]: "" }))
              }
            }}
          />
        </div>
      ) : null}

      {mode === "copy" ? (
        <CopyPackagePanel
          targetCafe={selectedCafe}
          sourceCafes={sourceCafes}
          sourceCafeId={sourceCafeId}
          sourcePackages={sourcePackages}
          selectedPackageId={selectedSourcePackageId}
          selectedPackageExists={selectedPackageExists}
          copying={copying}
          onSourceCafeChange={setSourceCafeId}
          onPackageChange={setSelectedSourcePackageId}
          onCancel={() => setMode("list")}
          onCopy={copyPackage}
        />
      ) : null}

      <Panel>
        <PanelTitle
          title={selectedCafe ? `Danh sách gói định kì - ${selectedCafe.name}` : "Danh sách gói định kì"}
          subtitle="Mỗi gói chỉ thuộc chi nhánh đang chọn. Có thể import gói từ chi nhánh khác nếu chưa trùng mã."
          action={
            <div className="flex flex-nowrap items-center gap-2">
              <Button disabled={!selectedCafeId || sourceCafes.length === 0} variant="outline" onClick={startCopy} className="h-9 whitespace-nowrap rounded-lg bg-white font-bold">
                <Copy className="mr-2 size-4" />
                Thêm từ chi nhánh
              </Button>
              <Button disabled={!selectedCafeId} variant="outline" onClick={startCreate} className="h-9 whitespace-nowrap rounded-lg bg-white font-bold">
                <Plus className="mr-2 size-4" />
                Thêm gói
              </Button>
            </div>
          }
        />

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm font-bold text-[#1c1b1b]">
            <input type="checkbox" checked={allPackagesSelected} onChange={toggleAll} className="size-4 rounded border-[#c4c7c8] accent-orange-600" />
            Chọn tất cả ({selectedPackageIds.length}/{packages.length})
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#747878]" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm gói..." className="h-9 w-56 rounded-lg bg-white pl-9" />
            </div>
            <Button disabled={selectedPackageIds.length === 0} variant="outline" onClick={() => setDeleteMode("selected")} className="h-9 rounded-lg bg-white text-red-600 hover:bg-red-50 font-bold">
              <Trash2 className="mr-2 size-4" />
              Xóa đã chọn
            </Button>
            <Button disabled={packages.length === 0} variant="outline" onClick={() => setDeleteMode("all")} className="h-9 rounded-lg bg-white text-red-600 hover:bg-red-50 font-bold">
              <Trash2 className="mr-2 size-4" />
              Xóa hết
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] p-8 text-center text-sm font-semibold text-[#747878]">
            Đang tải dữ liệu gói...
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#c4c7c8] bg-[#fcf8f8] p-10 text-center">
            <PackagePlus className="mx-auto size-10 text-[#747878]" />
            <h3 className="mt-4 text-lg font-bold text-[#1c1b1b]">Chưa có gói phù hợp</h3>
            <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">Tạo gói định kì đầu tiên cho chi nhánh hoặc đổi từ khóa tìm kiếm.</p>
            <Button disabled={!selectedCafeId} onClick={startCreate} className="mt-5 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
              <Plus className="mr-2 size-4" />
              Tạo gói
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredPackages.map((item) => (
              <PackageRow
                key={item.id}
                item={item}
                selected={selectedPackageIds.includes(item.id)}
                onSelect={() => toggleSelection(item.id)}
                onEdit={() => startEdit(item)}
                onTogglePriority={() => void togglePriority(item)}
                onToggle={() => void toggleActive(item)}
                onDelete={() => {
                  setDeleteTarget(item)
                  setDeleteMode("single")
                }}
              />
            ))}
          </div>
        )}
      </Panel>

      <DeleteConfirmationModal
        isOpen={!!deleteMode}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteMode(null)
        }}
        onConfirm={() => void confirmDelete()}
        offerData={
          deleteMode === "selected"
            ? {
                title: "Xóa gói định kỳ?",
                message: "Các gói đã chọn sẽ bị xóa khỏi chi nhánh đang chọn. Nếu gói đã bán cho khách, bạn nên tắt hoạt động để giữ lịch sử.",
                confirmLabel: "Xóa gói",
                code: `Xóa ${selectedPackages.length} gói đã chọn`,
                description: `Các gói này sẽ bị xóa khỏi ${selectedCafe?.name ?? "chi nhánh đang chọn"}.`,
                details: "Kiểm tra lại danh sách trước khi xác nhận.",
                items: selectedPackages.map((item) => packageToDeleteItem(item)),
              }
            : deleteMode === "all"
              ? {
                  title: "Xóa gói định kỳ?",
                  message: "Toàn bộ gói trong danh sách hiện tại sẽ bị xóa khỏi chi nhánh đang chọn. Nếu gói đã bán cho khách, bạn nên tắt hoạt động để giữ lịch sử.",
                  confirmLabel: "Xóa gói",
                  code: `Xóa tất cả ${packages.length} gói`,
                  description: `Toàn bộ gói định kỳ của ${selectedCafe?.name ?? "chi nhánh đang chọn"} sẽ bị xóa.`,
                  details: "Thao tác này áp dụng cho toàn bộ danh sách hiện tại.",
                  items: packages.map((item) => packageToDeleteItem(item)),
                }
              : deleteTarget
                ? {
                    title: "Xóa gói định kỳ?",
                    message: "Gói này sẽ bị xóa khỏi chi nhánh đang chọn. Nếu gói đã bán cho khách, bạn nên tắt hoạt động để giữ lịch sử.",
                    confirmLabel: "Xóa gói",
                    ...packageToDeleteItem(deleteTarget),
                  }
                : null
        }
      />
    </section>
  )

  if (propCafeId) {
    return content
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Quản lý Gói & Bảng giá"
        description="Cấu hình các gói định kì theo tuần hoặc tháng, số lượng slot và chi nhánh áp dụng."
      />
      {content}
    </ProviderShell>
  )
}

export function ProviderPackageCreatePage() {
  return <ProviderPackageFormPage mode="create" />
}

export function ProviderPackageEditPage() {
  return <ProviderPackageFormPage mode="edit" />
}

function ProviderPackageFormPage({ mode }: { mode: "create" | "edit" }) {
  const navigate = useNavigate()
  const { packageId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState(searchParams.get("cafeId") ?? "")
  const [packages, setPackages] = useState<RecurringPackage[]>([])
  const [editingPackage, setEditingPackage] = useState<RecurringPackage | null>(null)
  const [form, setForm] = useState<PackageFormState>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = mode === "edit"

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        const data = await packageApi.listProviderCafes()
        if (!mounted) return
        const cafeId = data[0]?.id || ""
        setCafes(data)
        setSelectedCafeId((current) => current || cafeId)
      } catch {
        toast.error("Không tải được danh sách chi nhánh")
      }
    }

    void loadCafes()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedCafeId) return
    setSearchParams({ cafeId: selectedCafeId }, { replace: true })
  }, [selectedCafeId, setSearchParams])

  useEffect(() => {
    if (!selectedCafeId) {
      queueMicrotask(() => {
        setPackages([])
        setLoading(false)
      })
      return
    }

    let mounted = true

    async function loadPackages() {
      try {
        setLoading(true)
        const data = await packageApi.listByCafe(selectedCafeId)
        if (!mounted) return
        setPackages(data)
        if (isEdit) {
          const current = data.find((item) => item.id === packageId) ?? null
          setEditingPackage(current)
          if (current) {
            setForm(packageToForm(current))
          } else {
            toast.error("Không tìm thấy gói cần chỉnh sửa")
          }
        } else {
          setEditingPackage(null)
          setForm(defaultForm)
        }
      } catch {
        toast.error("Không tải được danh sách gói của chi nhánh")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadPackages()
    return () => {
      mounted = false
    }
  }, [selectedCafeId, isEdit, packageId])

  const goBack = () => {
    navigate(buildPackagesPath(selectedCafeId))
  }

  const savePackage = async () => {
    if (!selectedCafeId) return
    const { isValid, errors: validationErrors } = validatePackageForm(form, packages, editingPackage?.id)
    if (!isValid) {
      setErrors(validationErrors)
      toast.error("Vui lòng kiểm tra lại các thông tin nhập liệu")
      return
    }
    setErrors({})

    try {
      setSaving(true)
      if (isEdit && editingPackage) {
        await packageApi.update(selectedCafeId, editingPackage.id, toPayload(form))
        toast.success("Đã cập nhật gói định kỳ")
      } else {
        await packageApi.create(selectedCafeId, toPayload(form))
        toast.success("Đã tạo gói định kỳ")
      }
      goBack()
    } catch (error) {
      toast.error("Không lưu được gói định kỳ", {
        description: getErrorMessage(error),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={isEdit ? "Chỉnh sửa gói định kỳ" : "Tạo gói định kỳ"}
        description="Thiết lập số slot theo tuần hoặc tháng, giá bán và chi nhánh áp dụng."
      />

      <section className="space-y-4">
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách gói
          </Button>
        </div>

        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">Chi nhánh áp dụng</Label>
            <select
              value={selectedCafeId}
              onChange={(event) => setSelectedCafeId(event.target.value)}
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

        <PackageFormPanel
          form={form}
          errors={errors}
          editing={isEdit}
          saving={saving || loading}
          onCancel={goBack}
          onSave={savePackage}
          onFieldChange={(field, value) => {
            setForm((current) => ({ ...current, [field]: value }))
            if (errors[field]) {
              setErrors((current) => ({ ...current, [field]: "" }))
            }
          }}
        />
      </section>
    </ProviderShell>
  )
}

export function ProviderPackageCopyPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cafes, setCafes] = useState<ProviderCafe[]>([])
  const [selectedCafeId, setSelectedCafeId] = useState(searchParams.get("cafeId") ?? "")
  const [targetPackages, setTargetPackages] = useState<RecurringPackage[]>([])
  const [sourcePackages, setSourcePackages] = useState<RecurringPackage[]>([])
  const [sourceCafeId, setSourceCafeId] = useState("")
  const [selectedSourcePackageId, setSelectedSourcePackageId] = useState("")
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)

  const selectedCafe = cafes.find((cafe) => cafe.id === selectedCafeId)
  const sourceCafes = cafes.filter((cafe) => cafe.id !== selectedCafeId)
  const existingCodes = useMemo(() => new Set(targetPackages.map((item) => item.code.toUpperCase())), [targetPackages])
  const selectedPackage = sourcePackages.find((item) => item.id === selectedSourcePackageId)
  const selectedPackageExists = selectedPackage ? existingCodes.has(selectedPackage.code.toUpperCase()) : false

  useEffect(() => {
    let mounted = true

    async function loadCafes() {
      try {
        const data = await packageApi.listProviderCafes()
        if (!mounted) return
        const cafeId = selectedCafeId || data[0]?.id || ""
        const firstSourceCafeId = data.find((cafe) => cafe.id !== cafeId)?.id ?? ""
        setCafes(data)
        setSelectedCafeId(cafeId)
        setSourceCafeId(firstSourceCafeId)
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
  }, [selectedCafeId])

  useEffect(() => {
    if (!selectedCafeId) return
    setSearchParams({ cafeId: selectedCafeId }, { replace: true })
    queueMicrotask(() => {
      setSourceCafeId((current) => (current && current !== selectedCafeId ? current : cafes.find((cafe) => cafe.id !== selectedCafeId)?.id ?? ""))
    })
  }, [cafes, selectedCafeId, setSearchParams])

  useEffect(() => {
    if (!selectedCafeId) {
      queueMicrotask(() => setTargetPackages([]))
      return
    }

    let mounted = true

    async function loadTargetPackages() {
      const data = await packageApi.listByCafe(selectedCafeId)
      if (mounted) setTargetPackages(data)
    }

    void loadTargetPackages()
    return () => {
      mounted = false
    }
  }, [selectedCafeId])

  useEffect(() => {
    if (!sourceCafeId) {
      queueMicrotask(() => {
        setSourcePackages([])
        setSelectedSourcePackageId("")
      })
      return
    }

    let mounted = true

    async function loadSourcePackages() {
      const data = await packageApi.listByCafe(sourceCafeId)
      if (!mounted) return
      setSourcePackages(data)
      setSelectedSourcePackageId(data.find((item) => !existingCodes.has(item.code.toUpperCase()))?.id ?? data[0]?.id ?? "")
    }

    void loadSourcePackages()
    return () => {
      mounted = false
    }
  }, [sourceCafeId, existingCodes])

  const goBack = () => {
    navigate(buildPackagesPath(selectedCafeId))
  }

  const copyPackage = async () => {
    if (!selectedCafeId || !selectedPackage || selectedPackageExists) return
    try {
      setCopying(true)
      await packageApi.create(selectedCafeId, packageToPayload(selectedPackage))
      toast.success("Đã thêm gói từ chi nhánh khác")
      goBack()
    } catch (error) {
      toast.error("Không thêm được gói từ chi nhánh khác", {
        description: getErrorMessage(error),
      })
    } finally {
      setCopying(false)
    }
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Thêm gói từ chi nhánh"
        description="Import gói định kỳ từ chi nhánh khác nếu mã gói chưa trùng."
      />

      <section className="space-y-4">
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách gói
          </Button>
        </div>

        <Panel>
          <div className="space-y-3">
            <Label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">Chi nhánh áp dụng</Label>
            <select
              value={selectedCafeId}
              onChange={(event) => setSelectedCafeId(event.target.value)}
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

        <CopyPackagePanel
          targetCafe={selectedCafe}
          sourceCafes={sourceCafes}
          sourceCafeId={sourceCafeId}
          sourcePackages={sourcePackages}
          selectedPackageId={selectedSourcePackageId}
          selectedPackageExists={selectedPackageExists}
          copying={copying || loading}
          onSourceCafeChange={setSourceCafeId}
          onPackageChange={setSelectedSourcePackageId}
          onCancel={goBack}
          onCopy={copyPackage}
        />
      </section>
    </ProviderShell>
  )
}

function PackageFormPanel({
  form,
  errors = {},
  editing,
  saving,
  onFieldChange,
  onCancel,
  onSave,
}: {
  form: PackageFormState
  errors?: Record<string, string>
  editing: boolean
  saving: boolean
  onFieldChange: <K extends keyof PackageFormState>(field: K, value: PackageFormState[K]) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Panel className="border-orange-200">
      <PanelTitle
        title={editing ? "Chỉnh sửa gói định kỳ" : "Tạo gói định kỳ"}
        subtitle="Thiết lập số slot theo tuần hoặc tháng, giá bán và tiện ích hiển thị cho khách."
        action={
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-lg">
            <X className="size-5" />
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Mã gói" error={errors.code}>
          <Input
            value={form.code}
            onChange={(event) => onFieldChange("code", event.target.value.toUpperCase())}
            placeholder="PKG-M12"
            className={cn("h-11 rounded-lg bg-white font-mono font-bold placeholder:text-[#b7bbbd]", errors.code && "border-red-500 focus-visible:ring-red-500")}
          />
        </Field>
        <Field label="Tên gói" error={errors.name}>
          <Input
            value={form.name}
            onChange={(event) => onFieldChange("name", event.target.value)}
            placeholder="Gói Tháng Pro"
            className={cn("h-11 rounded-lg bg-white", errors.name && "border-red-500 focus-visible:ring-red-500")}
          />
        </Field>
        <Field label="Số lượng slot" error={errors.slotCount}>
          <Input
            type="number"
            min="1"
            value={form.slotCount}
            onChange={(event) => onFieldChange("slotCount", event.target.value)}
            className={cn("h-11 rounded-lg bg-white", errors.slotCount && "border-red-500 focus-visible:ring-red-500")}
          />
        </Field>
        <Field label="Chu kỳ">
          <select value={form.billingPeriod} onChange={(event) => onFieldChange("billingPeriod", event.target.value as PackageBillingPeriod)} className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold">
            <option value="WEEK">Theo tuần</option>
            <option value="MONTH">Theo tháng</option>
          </select>
        </Field>
        <Field label="Giá bán" error={errors.price}>
          <Input
            inputMode="numeric"
            value={form.price}
            onChange={(event) => onFieldChange("price", formatMoneyInput(event.target.value))}
            placeholder="1.380.000"
            className={cn("h-11 rounded-lg bg-white font-bold placeholder:text-[#b7bbbd]", errors.price && "border-red-500 focus-visible:ring-red-500")}
          />
        </Field>
        <Field label="Áp dụng cho">
          <select
            value={playModeSelectValue(form.applicablePlayModes)}
            onChange={(event) => onFieldChange("applicablePlayModes", playModeSelectToValue(event.target.value))}
            className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold"
          >
            <option value="RENTAL">Thuê xe của quán</option>
            <option value="BYOC">Xe tự mang</option>
            <option value="ALL">Thuê xe và xe tự mang</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Tiện ích">
            <Textarea
              value={form.benefits}
              onChange={(event) => onFieldChange("benefits", event.target.value)}
              placeholder={"Ví dụ:\n12 slot đặt sân mỗi tháng\nƯu tiên khung giờ cao điểm\n1 bàn pit riêng"}
              className="min-h-24 rounded-lg bg-white placeholder:text-[#b7bbbd]"
            />
            <p className="text-xs font-semibold text-[#747878]">Mỗi dòng sẽ hiển thị thành một tiện ích có dấu tick trong danh sách gói.</p>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Mô tả">
            <Textarea value={form.description} onChange={(event) => onFieldChange("description", event.target.value)} placeholder="Điều kiện áp dụng hoặc ghi chú nội bộ" className="min-h-24 rounded-lg bg-white" />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-3">
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Gói phổ biến</p>
            <p className="text-xs font-semibold text-[#747878]">Đánh dấu để nổi bật trên bảng giá.</p>
          </div>
          <Switch checked={form.isPopular} onCheckedChange={(checked) => onFieldChange("isPopular", checked)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[#e5e2e1] bg-[#f6f3f2] px-4 py-3">
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Đang hoạt động</p>
            <p className="text-xs font-semibold text-[#747878]">Tắt để ẩn khỏi khách nhưng vẫn giữ cấu hình.</p>
          </div>
          <Switch checked={form.isActive} onCheckedChange={(checked) => onFieldChange("isActive", checked)} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3 border-t border-[#e5e2e1] pt-5">
        <Button variant="outline" onClick={onCancel} className="rounded-lg bg-white font-bold">Hủy</Button>
        <Button disabled={saving} onClick={onSave} className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
          <Save className="mr-2 size-4" />
          {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Lưu gói"}
        </Button>
      </div>
    </Panel>
  )
}

function CopyPackagePanel({
  targetCafe,
  sourceCafes,
  sourceCafeId,
  sourcePackages,
  selectedPackageId,
  selectedPackageExists,
  copying,
  onSourceCafeChange,
  onPackageChange,
  onCancel,
  onCopy,
}: {
  targetCafe?: ProviderCafe
  sourceCafes: ProviderCafe[]
  sourceCafeId: string
  sourcePackages: RecurringPackage[]
  selectedPackageId: string
  selectedPackageExists: boolean
  copying: boolean
  onSourceCafeChange: (value: string) => void
  onPackageChange: (value: string) => void
  onCancel: () => void
  onCopy: () => void
}) {
  const selectedPackage = sourcePackages.find((item) => item.id === selectedPackageId)

  return (
    <Panel className="border-orange-200">
      <PanelTitle
        title="Thêm gói từ chi nhánh khác"
        subtitle={targetCafe ? `Sao chép gói định kì sang chi nhánh: ${targetCafe.name}` : "Chọn chi nhánh đích trước khi sao chép gói."}
        action={
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-lg">
            <X className="size-5" />
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Chi nhánh nguồn">
          <select value={sourceCafeId} onChange={(event) => onSourceCafeChange(event.target.value)} className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold">
            {sourceCafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>{cafe.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Gói đã tạo">
          <select value={selectedPackageId} onChange={(event) => onPackageChange(event.target.value)} disabled={sourcePackages.length === 0} className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold disabled:bg-[#f6f3f2]">
            {sourcePackages.length === 0 ? <option>Chi nhánh này chưa có gói</option> : null}
            {sourcePackages.map((item) => {
              const exists = item.code.toUpperCase() === selectedPackage?.code.toUpperCase() && selectedPackageExists
              return (
                <option key={item.id} value={item.id} disabled={exists}>
                  {item.code} - {item.name}{exists ? " (đã có)" : ""}
                </option>
              )
            })}
          </select>
        </Field>
      </div>

      {selectedPackage ? (
        <div className="mt-4 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">{selectedPackage.code}</span>
            <Badge className={cn("border font-bold", selectedPackage.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
              {selectedPackage.isActive ? "Đang bán" : "Đã tắt"}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-bold text-[#1c1b1b]">{selectedPackage.name}</p>
          <p className="mt-1 text-sm font-semibold text-[#5d5f5f]">{formatPackageCycle(selectedPackage)} · {formatMoney(selectedPackage.price)}</p>
          {selectedPackageExists ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              Mã gói này đã có ở chi nhánh đích, vui lòng chọn gói khác.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-3 border-t border-[#e5e2e1] pt-5">
        <Button variant="outline" onClick={onCancel} className="rounded-lg bg-white font-bold">Hủy</Button>
        <Button disabled={copying || !selectedPackageId || selectedPackageExists} onClick={onCopy} className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold">
          <Copy className="mr-2 size-4" />
          {copying ? "Đang thêm..." : "Thêm vào chi nhánh"}
        </Button>
      </div>
    </Panel>
  )
}

function PackageRow({
  item,
  selected,
  onSelect,
  onEdit,
  onTogglePriority,
  onToggle,
  onDelete,
}: {
  item: RecurringPackage
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onTogglePriority: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <article className={cn(
      "grid gap-4 rounded-lg border bg-white p-4 transition hover:bg-[#fcf8f8] lg:grid-cols-[auto_1.2fr_0.7fr_0.9fr_1.2fr_auto] lg:items-center",
      selected ? "border-orange-300 bg-orange-50/60" : "border-[#e5e2e1]",
      !item.isActive && "opacity-70"
    )}>
      <label className="flex items-center gap-2 self-start lg:self-center" aria-label={`Chọn gói ${item.code}`}>
        <input type="checkbox" checked={selected} onChange={onSelect} className="size-4 rounded border-[#c4c7c8] accent-orange-600" />
      </label>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#f6f3f2] px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">{item.code}</span>
          {item.isPopular ? <Badge className="border border-amber-200 bg-amber-50 font-bold text-amber-700">Gói ưu tiên</Badge> : null}
          <Badge className={cn("border font-bold", item.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
            {item.isActive ? "Đang bán" : "Đã tắt"}
          </Badge>
        </div>
        <p className="mt-2 text-base font-extrabold text-[#1c1b1b]">{item.name}</p>
        <p className="mt-1 line-clamp-2 text-xs font-semibold text-[#5d5f5f]">{item.description || "Chưa có mô tả"}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">Slot</p>
        <p className="mt-1 text-sm font-extrabold text-[#1c1b1b]">{item.slotCount} slot</p>
        <p className="mt-1 text-xs font-bold text-[#747878]">{periodLabel(item.billingPeriod)}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">Đơn giá</p>
        <p className="mt-1 text-sm font-extrabold text-[#1c1b1b]">{formatMoney(item.price)}</p>
      </div>
      <ul className="flex flex-col gap-1 text-sm font-semibold text-[#5d5f5f]">
        {item.benefits.length === 0 ? <li>Chưa có tiện ích</li> : item.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start">
            <Check className={cn("mr-1 mt-0.5 size-4 shrink-0", item.isActive ? "text-[#10b981]" : "text-[#747878]")} />
            {benefit}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onTogglePriority}
          className={cn(
            "rounded-lg bg-white",
            item.isPopular && "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
          )}
          title={item.isPopular ? "Bỏ gói ưu tiên" : "Đánh dấu gói ưu tiên"}
        >
          <Star className={cn("size-4", item.isPopular && "fill-current")} />
        </Button>
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

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-[#5d5f5f]">{label}</Label>
      {children}
      {error && <p className="text-xs font-semibold text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function buildPackagesPath(cafeId?: string) {
  return cafeId ? `/provider/cafes/${cafeId}?tab=packages` : routePaths.providerPackages
}

function toPayload(form: PackageFormState): PackagePayload {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    slot_count: Number(form.slotCount),
    billing_period: form.billingPeriod,
    price: parseMoneyInput(form.price),
    benefits: parseBenefits(form.benefits),
    applicable_play_modes: form.applicablePlayModes,
    is_popular: form.isPopular,
    is_active: form.isActive,
  }
}

function packageToPayload(item: RecurringPackage): PackagePayload {
  return {
    code: item.code,
    name: item.name,
    description: item.description,
    slot_count: item.slotCount,
    billing_period: item.billingPeriod,
    price: Number(item.price),
    benefits: item.benefits,
    applicable_play_modes: item.applicablePlayModes?.length ? item.applicablePlayModes : ["RENTAL", "BYOC"],
    is_popular: item.isPopular,
    is_active: item.isActive,
  }
}

function packageToForm(item: RecurringPackage): PackageFormState {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    slotCount: String(item.slotCount),
    billingPeriod: item.billingPeriod,
    price: formatMoneyInput(String(Math.round(Number(item.price)))),
    benefits: item.benefits.join("\n"),
    applicablePlayModes: item.applicablePlayModes?.length ? item.applicablePlayModes : ["RENTAL", "BYOC"],
    isPopular: item.isPopular,
    isActive: item.isActive,
  }
}

const createPackageFormSchema = (packages: RecurringPackage[], editingId?: string) =>
  z.object({
    code: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập mã gói")
      .regex(/^[A-Z0-9-]+$/i, "Mã gói chỉ gồm chữ, số và dấu gạch ngang")
      .refine(
        (code) =>
          !packages.some(
            (item) => item.id !== editingId && item.code.toUpperCase() === code.trim().toUpperCase()
          ),
        "Mã gói đã tồn tại ở chi nhánh này"
      ),
    name: z.string().trim().min(1, "Vui lòng nhập tên gói"),
    slotCount: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập số lượng slot")
      .refine((val) => {
        const num = Number(val)
        return !isNaN(num) && Number.isInteger(num) && num > 0
      }, "Số lượng slot phải là số nguyên lớn hơn 0"),
    price: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập giá bán")
      .refine((val) => {
        const price = parseMoneyInput(val)
        return !isNaN(price) && price > 0
      }, "Giá bán phải lớn hơn 0"),
  })

function validatePackageForm(form: PackageFormState, packages: RecurringPackage[], editingId?: string) {
  const schema = createPackageFormSchema(packages, editingId)
  const result = schema.safeParse(form)
  if (result.success) {
    return { isValid: true, errors: {} as Record<string, string> }
  }
  const errors: Record<string, string> = {}
  result.error.issues.forEach((err) => {
    if (err.path[0]) {
      errors[err.path[0].toString()] = err.message
    }
  })
  return { isValid: false, errors }
}

function packageToDeleteItem(item: RecurringPackage) {
  const isActive = item.isActive
  return {
    id: item.id,
    code: item.code,
    status: isActive ? "Đang bán" : "Đã tắt",
    statusClassName: isActive
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-600",
    description: item.description || item.name,
    details: `${item.slotCount} slot/${item.billingPeriod === "WEEK" ? "tuần" : "tháng"} · ${formatMoney(item.price)} · ${playModeLabel(item.applicablePlayModes)}`,
  }
}

function parseBenefits(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function playModeSelectValue(value: PackageApplicablePlayMode[]) {
  const modes = new Set(value)
  if (modes.has("RENTAL") && modes.has("BYOC")) return "ALL"
  if (modes.has("BYOC")) return "BYOC"
  return "RENTAL"
}

function playModeSelectToValue(value: string): PackageApplicablePlayMode[] {
  if (value === "ALL") return ["RENTAL", "BYOC"]
  if (value === "BYOC") return ["BYOC"]
  return ["RENTAL"]
}

function parseMoneyInput(value: string) {
  return Number(value.replace(/\D/g, ""))
}

function formatMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("vi-VN")
}

function formatPackageCycle(item: RecurringPackage) {
  return `${item.slotCount} slot/${item.billingPeriod === "WEEK" ? "tuần" : "tháng"}`
}

function periodLabel(period: PackageBillingPeriod) {
  return period === "WEEK" ? "Theo tuần" : "Theo tháng"
}

function playModeLabel(value: PackageApplicablePlayMode[]) {
  const modes = new Set(value)
  if (modes.has("RENTAL") && modes.has("BYOC")) return "Thuê xe và xe tự mang"
  if (modes.has("BYOC")) return "Xe tự mang"
  return "Rental"
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value))
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Array<{ message?: string }> } } }).response
    return response?.data?.message ?? response?.data?.errors?.map((item) => item.message).filter(Boolean).join(", ")
  }
  return undefined
}
