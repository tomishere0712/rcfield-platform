import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil, Infinity as InfinityIcon, PackageCheck } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "./components/AdminShell"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { SubscriptionPlan, PlanName } from "@/features/subscriptions/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/ui/dialog"
import { Badge } from "@/shared/ui/badge"

const PLAN_COLORS: Record<PlanName, string> = {
  TRIAL:   "bg-slate-100 text-slate-700 border-slate-200",
  STARTER: "bg-blue-50  text-blue-700  border-blue-200",
  GROWTH:  "bg-violet-50 text-violet-700 border-violet-200",
  PRO:     "bg-orange-50 text-orange-700 border-orange-200",
}

const PLAN_LABELS: Record<PlanName, string> = {
  TRIAL:   "Trial",
  STARTER: "Starter",
  GROWTH:  "Growth",
  PRO:     "Pro",
}

function formatLimit(val: number) {
  return val === -1 ? "Không giới hạn" : val.toLocaleString()
}

function formatPrice(val: number) {
  return val === 0 ? "Miễn phí" : `${val.toLocaleString("vi-VN")} ₫/tháng`
}

interface EditState {
  plan: SubscriptionPlan
  branchLimit: string
  branchUnlimited: boolean
  aiQuota: string
  aiUnlimited: boolean
  channelLimit: string
  channelUnlimited: boolean
  price: string
}

function initEditState(plan: SubscriptionPlan): EditState {
  return {
    plan,
    branchLimit:      plan.branchLimit === -1 ? "" : String(plan.branchLimit),
    branchUnlimited:  plan.branchLimit === -1,
    aiQuota:          plan.aiQuotaPerMonth === -1 ? "" : String(plan.aiQuotaPerMonth),
    aiUnlimited:      plan.aiQuotaPerMonth === -1,
    channelLimit:     plan.channelLimit === -1 ? "" : String(plan.channelLimit),
    channelUnlimited: plan.channelLimit === -1,
    price:            String(plan.pricePerMonth),
  }
}

export function AdminSubscriptionPlansPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<EditState | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: subscriptionApi.listSubscriptionPlans,
  })

  const { mutate: updatePlan, isPending } = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof subscriptionApi.updateSubscriptionPlan>[1] }) =>
      subscriptionApi.updateSubscriptionPlan(id, body),
    onSuccess: () => {
      toast.success("Đã cập nhật gói")
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] })
      setEditing(null)
    },
    onError: () => toast.error("Cập nhật thất bại"),
  })

  function handleSave() {
    if (!editing) return
    const branchLimit      = editing.branchUnlimited  ? -1 : parseInt(editing.branchLimit, 10)
    const aiQuota          = editing.aiUnlimited       ? -1 : parseInt(editing.aiQuota, 10)
    const channelLimit     = editing.channelUnlimited  ? -1 : parseInt(editing.channelLimit, 10)
    const price            = parseFloat(editing.price)

    if (!editing.branchUnlimited && (isNaN(branchLimit) || branchLimit < 1)) {
      toast.error("Số chi nhánh phải là số nguyên dương")
      return
    }
    if (!editing.aiUnlimited && (isNaN(aiQuota) || aiQuota < 1)) {
      toast.error("AI quota phải là số nguyên dương")
      return
    }
    if (!editing.channelUnlimited && (isNaN(channelLimit) || channelLimit < 1)) {
      toast.error("Số kênh phải là số nguyên dương")
      return
    }
    if (isNaN(price) || price < 0) {
      toast.error("Giá phải là số không âm")
      return
    }

    updatePlan({
      id: editing.plan.id,
      body: {
        branch_limit:       branchLimit,
        ai_quota_per_month: aiQuota,
        channel_limit:      channelLimit,
        price_per_month:    price,
      },
    })
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1c1b1b]">Cấu hình gói đăng ký</h1>
        <p className="mt-1 text-sm text-[#747878]">Chỉnh giới hạn và giá cho từng gói. Tên gói và số lượng gói không thể thay đổi.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-[#f6f3f2]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={() => setEditing(initEditState(plan))} />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-orange-600" />
              Chỉnh sửa gói {editing && PLAN_LABELS[editing.plan.name]}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4 py-2">
              <LimitField
                label="Số chi nhánh"
                value={editing.branchLimit}
                unlimited={editing.branchUnlimited}
                disabled={isPending}
                onChange={(v) => setEditing((e) => e && { ...e, branchLimit: v })}
                onToggleUnlimited={(v) => setEditing((e) => e && { ...e, branchUnlimited: v, branchLimit: "" })}
              />
              <LimitField
                label="AI messages / tháng"
                value={editing.aiQuota}
                unlimited={editing.aiUnlimited}
                disabled={isPending}
                onChange={(v) => setEditing((e) => e && { ...e, aiQuota: v })}
                onToggleUnlimited={(v) => setEditing((e) => e && { ...e, aiUnlimited: v, aiQuota: "" })}
              />
              <LimitField
                label="Số kênh kết nối"
                value={editing.channelLimit}
                unlimited={editing.channelUnlimited}
                disabled={isPending}
                onChange={(v) => setEditing((e) => e && { ...e, channelLimit: v })}
                onToggleUnlimited={(v) => setEditing((e) => e && { ...e, channelUnlimited: v, channelLimit: "" })}
              />

              <div className="space-y-1.5">
                <Label>Giá / tháng (VND)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={editing.price}
                  disabled={isPending || editing.plan.isTrial}
                  onChange={(e) => setEditing((s) => s && { ...s, price: e.target.value })}
                  placeholder="0"
                />
                {editing.plan.isTrial && (
                  <p className="text-xs text-[#747878]">Gói Trial luôn miễn phí, không thể thay đổi.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isPending}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
              {isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

function PlanCard({ plan, onEdit }: { plan: SubscriptionPlan; onEdit: () => void }) {
  return (
    <div className={`relative rounded-xl border-2 p-5 flex flex-col gap-4 bg-white ${PLAN_COLORS[plan.name]}`}>
      <div className="flex items-start justify-between">
        <div>
          <Badge className={`text-xs font-bold ${PLAN_COLORS[plan.name]}`}>{plan.name}</Badge>
          <p className="mt-2 text-lg font-bold text-[#1c1b1b]">{formatPrice(plan.pricePerMonth)}</p>
        </div>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={onEdit} title="Chỉnh sửa">
          <Pencil className="size-4" />
        </Button>
      </div>

      <ul className="space-y-2 text-sm text-[#444748]">
        <LimitRow label="Chi nhánh" value={plan.branchLimit} />
        <LimitRow label="Tin nhắn (AI)/tháng" value={plan.aiQuotaPerMonth} />
        <LimitRow label="Kênh kết nối" value={plan.channelLimit} />
      </ul>
    </div>
  )
}

function LimitRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className="flex items-center gap-1 font-semibold">
        {value === -1 ? <InfinityIcon className="size-4" /> : null}
        {formatLimit(value)}
      </span>
    </li>
  )
}

function LimitField({
  label,
  value,
  unlimited,
  disabled,
  onChange,
  onToggleUnlimited,
}: {
  label: string
  value: string
  unlimited: boolean
  disabled: boolean
  onChange: (v: string) => void
  onToggleUnlimited: (v: boolean) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={value}
          disabled={disabled || unlimited}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập số..."
          className="flex-1"
        />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-[#444748]">
          <input
            type="checkbox"
            checked={unlimited}
            disabled={disabled}
            onChange={(e) => onToggleUnlimited(e.target.checked)}
            className="size-4 accent-orange-600"
          />
          <InfinityIcon className="size-3.5" />
        </label>
      </div>
    </div>
  )
}
