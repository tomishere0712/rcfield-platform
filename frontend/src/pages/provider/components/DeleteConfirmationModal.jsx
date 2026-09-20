import { AlertTriangle, Trash2, X } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"

export function DeleteConfirmationModal({ isOpen, onClose, onConfirm, offerData }) {
  if (!isOpen || !offerData) return null
  const items = Array.isArray(offerData.items) ? offerData.items : []
  const title = offerData.title ?? "Xóa mã ưu đãi?"
  const message = offerData.message ?? (
    <>
      Nếu mã đã có lịch sử sử dụng, bạn nên chọn <span className="font-bold text-[#1c1b1b]">Tắt</span> thay vì xóa để giữ dữ liệu đối soát.
    </>
  )
  const confirmLabel = offerData.confirmLabel ?? "Xóa ưu đãi"

  const handleConfirm = () => {
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-offer-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl shadow-black/15"
      >
        <div className="flex items-start gap-4 border-b border-[#f0e7e5] px-5 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="delete-offer-title" className="text-xl font-extrabold tracking-tight text-[#1c1b1b]">
              {title}
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#5d5f5f]">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#747878] transition hover:bg-[#f6f3f2] hover:text-[#1c1b1b]"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-red-100 bg-red-50/70 p-4">
            {items.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-extrabold text-[#1c1b1b]">{offerData.code}</p>
                {items.map((item) => (
                  <div key={item.id ?? item.code} className="rounded-lg border border-red-100 bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#f6f3f2] px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b]">
                        {item.code}
                      </span>
                      {item.status ? (
                        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", item.statusClassName)}>
                          {item.status}
                        </span>
                      ) : null}
                    </div>
                    {item.description ? <p className="mt-2 text-sm font-semibold text-[#444748]">{item.description}</p> : null}
                    {item.details ? <p className="mt-2 text-xs font-bold uppercase tracking-wide text-[#747878]">{item.details}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white px-2.5 py-1 font-mono text-sm font-extrabold text-[#1c1b1b] shadow-sm">
                    {offerData.code}
                  </span>
                  {offerData.status ? (
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", offerData.statusClassName)}>
                      {offerData.status}
                    </span>
                  ) : null}
                </div>
                {offerData.description ? (
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#444748]">{offerData.description}</p>
                ) : null}
                {offerData.details ? (
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#747878]">{offerData.details}</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[#f0e7e5] bg-[#fcf8f8] px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-lg bg-white text-[#444748]">
            Hủy
          </Button>
          <Button type="button" onClick={handleConfirm} className="rounded-lg bg-red-600 text-white hover:bg-red-700">
            <Trash2 className="mr-2 size-4" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
