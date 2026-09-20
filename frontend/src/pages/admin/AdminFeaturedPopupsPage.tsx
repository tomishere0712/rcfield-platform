import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { adminFeaturedPopupApi } from "@/features/admin/api/admin-featured-popups.api"
import type { FeaturedPopupItem } from "@/features/explore/api/featured-popup.api"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminSearchBar,
} from "@/pages/admin/components/AdminPrimitives"

const emptyForm = {
  title: "",
  subtitle: "",
  image_url: "",
  cta_label: "",
  cta_url: "",
  contest_id: "",
  starts_at: "",
  ends_at: "",
  priority: "100",
  is_active: true,
}

/**
 * Trạng thái THỰC TẾ của một popup, không chỉ cái công tắc `is_active`.
 *
 * Backend đòi đủ BỐN điều kiện mới đưa popup ra trước khách
 * (`getActiveFeaturedPopup`): bật công tắc, nội dung đã duyệt, đã tới ngày bắt
 * đầu, và chưa quá ngày hết hạn.
 *
 * Giao diện cũ chỉ đọc `is_active` nên một popup đã hết hạn vẫn hiện chữ "Đang
 * bật" — admin đọc xong tưởng nó đang chạy, trong khi khách không hề thấy gì.
 */
function getPopupState(popup: FeaturedPopupItem, now: number) {
  if (!popup.is_active) {
    return { label: "Đã tắt", className: "bg-zinc-100 text-zinc-600", live: false }
  }
  if (popup.review_status === "PENDING") {
    return { label: "Chờ duyệt nội dung", className: "bg-amber-100 text-amber-800", live: false }
  }
  if (popup.review_status === "REJECTED") {
    return { label: "Nội dung bị từ chối", className: "bg-rose-100 text-rose-700", live: false }
  }
  if (now < new Date(popup.starts_at).getTime()) {
    return { label: "Chưa tới lịch", className: "bg-sky-100 text-sky-700", live: false }
  }
  if (now > new Date(popup.ends_at).getTime()) {
    return { label: "Đã hết hạn", className: "bg-zinc-100 text-zinc-600", live: false }
  }
  return { label: "Đang hiển thị", className: "bg-emerald-100 text-emerald-700", live: true }
}

export function AdminFeaturedPopupsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [form, setForm] = useState(emptyForm)
  /*
    Mốc thời gian dùng chung cho mọi thẻ trong một lần render.

    Đặt trong state chứ không gọi `Date.now()` thẳng trong thân component: gọi
    thẳng làm việc dựng giao diện phụ thuộc đồng hồ, và React coi đó là hàm
    không thuần khiết.

    Nhịp lại mỗi 30 giây, nên popup hết hạn trong lúc admin đang mở trang sẽ tự
    đổi nhãn thay vì đứng nguyên cho tới khi tải lại.
  */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const { data: popups = [], isLoading } = useQuery({
    queryKey: ["admin-featured-popups"],
    queryFn: adminFeaturedPopupApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      adminFeaturedPopupApi.create({
        title: form.title,
        subtitle: form.subtitle || null,
        image_url: form.image_url || null,
        cta_label: form.cta_label,
        cta_url: form.cta_url || null,
        contest_id: form.contest_id || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        priority: Number(form.priority || 100),
        is_active: form.is_active,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-featured-popups"] })
      toast.success("Đã tạo popup nổi bật")
      setForm(emptyForm)
    },
    onError: () => {
      toast.error("Không thể tạo popup nổi bật")
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ popupId, isActive }: { popupId: string; isActive: boolean }) =>
      adminFeaturedPopupApi.update(popupId, { is_active: isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-featured-popups"] })
    },
  })

  const filtered = useMemo(
    () =>
      popups.filter((popup) =>
        [popup.title, popup.subtitle, popup.cta_label]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search.toLowerCase())),
      ),
    [popups, search],
  )

  return (
    <AdminShell>
      <AdminHeader
        title="Popup trang chủ"
        description="Quản trị popup giải đấu nổi bật hiển thị trên trang khám phá của khách hàng."
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <AdminPanel>
          <AdminPanelTitle
            title="Tạo popup mới"
            subtitle="Chỉ một popup active có priority cao nhất trong khoảng thời gian hiệu lực sẽ được hiển thị."
          />

          <div className="mt-6 grid gap-4">
            <Field label="Tiêu đề">
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
              />
            </Field>
            <Field label="Mô tả ngắn">
              <textarea
                value={form.subtitle}
                onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
                className="min-h-24 rounded-xl border border-[#e5e2e1] bg-white px-4 py-3 text-sm"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nhãn nút bấm">
                <input
                  value={form.cta_label}
                  onChange={(event) => setForm((current) => ({ ...current, cta_label: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                />
              </Field>
              <Field label="Đường dẫn nút bấm">
                <input
                  value={form.cta_url}
                  onChange={(event) => setForm((current) => ({ ...current, cta_url: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                  placeholder="https://..."
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ảnh popup">
                <input
                  value={form.image_url}
                  onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                  placeholder="https://..."
                />
              </Field>
              <Field label="Contest ID (tuỳ chọn)">
                <input
                  value={form.contest_id}
                  onChange={(event) => setForm((current) => ({ ...current, contest_id: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Bắt đầu">
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                />
              </Field>
              <Field label="Kết thúc">
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(event) => setForm((current) => ({ ...current, ends_at: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                />
              </Field>
              <Field label="Độ ưu tiên">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                  className="h-11 rounded-xl border border-[#e5e2e1] bg-white px-4 text-sm"
                />
              </Field>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] px-4 py-3 text-sm font-semibold text-[#444748]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Kích hoạt popup ngay sau khi tạo
            </label>
            <button
              type="button"
              disabled={
                createMutation.isPending ||
                !form.title.trim() ||
                !form.cta_label.trim() ||
                !form.starts_at ||
                !form.ends_at
              }
              onClick={() => void createMutation.mutateAsync()}
              className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMutation.isPending ? "Đang tạo..." : "Tạo featured popup"}
            </button>
          </div>
        </AdminPanel>

        <AdminPanel>
          <div className="mb-6">
            <AdminSearchBar
              placeholder="Tìm theo tiêu đề hoặc nhãn nút..."
              value={search}
              onChange={setSearch}
            />
          </div>
          <AdminPanelTitle
            title="Popup hiện có"
            subtitle={`${popups.filter((item) => getPopupState(item, now).live).length}/${popups.length} popup đang hiển thị với khách`}
          />

          <div className="mt-6 space-y-4">
            {isLoading ? (
              <div className="rounded-xl border border-[#e5e2e1] bg-white p-6 text-sm text-[#747878]">
                Đang tải danh sách popup...
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#e5e2e1] bg-white p-6 text-sm font-semibold text-[#747878]">
                Chưa có popup phù hợp bộ lọc.
              </div>
            ) : (
              filtered.map((popup) => (
                <article
                  key={popup.id}
                  className="rounded-2xl border border-[#e5e2e1] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold text-[#1c1b1b]">{popup.title}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getPopupState(popup, now).className}`}
                        >
                          {getPopupState(popup, now).label}
                        </span>
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                          Ưu tiên {popup.priority}
                        </span>
                      </div>
                      <p className="text-sm text-[#5d5f5f]">{popup.subtitle ?? "Chưa có mô tả ngắn."}</p>
                      <div className="grid gap-2 text-xs font-semibold text-[#747878] md:grid-cols-2">
                        <span>Hiệu lực: {new Date(popup.starts_at).toLocaleString("vi-VN")}</span>
                        <span>Hết hạn: {new Date(popup.ends_at).toLocaleString("vi-VN")}</span>
                        <span>Nút bấm: {popup.cta_label}</span>
                        <span title={popup.contest_id ?? undefined}>
                          Giải đấu: {popup.contest_id ? `${popup.contest_id.slice(0, 8)}…` : "Không gắn"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({
                          popupId: popup.id,
                          isActive: !popup.is_active,
                        })
                      }
                      className="rounded-xl border border-[#e5e2e1] px-4 py-2 text-sm font-bold text-[#444748] transition hover:bg-[#fcf8f8]"
                    >
                      {popup.is_active ? "Tắt popup" : "Bật popup"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </AdminPanel>
      </div>
    </AdminShell>
  )
}

/**
 * Nhãn nằm TRÊN ô nhập.
 *
 * Bản cũ dùng `block space-y-2`, nhưng `<span>` là inline còn `<input>` là
 * inline-block nên hai thứ nằm cạnh nhau trên cùng một dòng — `space-y-*` chỉ
 * thêm lề dọc chứ không ép xuống dòng. Ô nào trông đúng chỉ là nhờ khung hẹp
 * làm input tràn xuống, tức là đúng do tình cờ.
 *
 * `flex flex-col` ép xếp chồng thật, và trong ngữ cảnh flex thì con tự giãn
 * hết chiều ngang nên ô nhập không cần thêm `w-full`.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-[#747878]">{label}</span>
      {children}
    </label>
  )
}
