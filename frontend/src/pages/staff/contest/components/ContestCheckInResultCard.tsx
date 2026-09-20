import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { contestApi } from "@/features/contests/api/contest.api"
import type { ContestRegistration } from "@/features/contests/types"
import {
  formatContestDateTime,
  getRegistrationDisplayName,
  getRegistrationSubtitle,
} from "@/features/contests/lib/contest-runtime"
import {
  getPaymentStatusLabel,
  getRegistrationStatusLabel,
} from "@/features/contests/lib/contest-status"
import {
  StaffBadge,
  StaffButton,
  StaffCard,
} from "@/pages/staff/components/StaffUI"

export function ContestCheckInResultCard({
  registration,
  onCheckIn,
  isPending,
}: {
  registration: ContestRegistration | null
  onCheckIn: (payload: {
    rentalVehicleId?: string
    byocConfirmed?: boolean
  }) => void
  isPending?: boolean
}) {
  const [rentalVehicleId, setRentalVehicleId] = useState<string | null>(null)
  const [byocConfirmed, setByocConfirmed] = useState(false)

  // Reset trạng thái xác nhận khi tra cứu sang đăng ký khác để lựa chọn của
  // người trước không rò rỉ sang người sau.
  const registrationId = registration?.id
  useEffect(() => {
    queueMicrotask(() => {
      setRentalVehicleId(null)
      setByocConfirmed(false)
    })
  }, [registrationId])

  const isByoc = registration?.vehicleSource === "BYOC"
  // VĐV thuê xe của quán thì nhân viên chọn đúng một chiếc để giao ngay tại quầy.
  // Đăng ký cũ chưa từng chọn dòng xe thì không có gì để giao.
  const needsHandover = !isByoc && Boolean(registration?.rentalCatalogId)

  const handoverUnitsQuery = useQuery({
    queryKey: ["contests", "handover-units", registration?.id],
    queryFn: () => contestApi.listHandoverUnits(registration!.id),
    enabled:
      Boolean(registration?.id) &&
      needsHandover &&
      registration?.status !== "CHECKED_IN",
  })
  const handoverUnits = handoverUnitsQuery.data ?? []
  const isCheckedIn = registration?.status === "CHECKED_IN"
  const byocDeclaration = (registration?.metadata?.byoc_declaration ??
    null) as {
    vehicle_name?: string | null
    vehicle_brand?: string | null
    vehicle_class?: string | null
    notes?: string | null
    photos?: string[] | null
  } | null

  // Ảnh khách tự chụp lúc đăng ký. Không có nó thì nhân viên chỉ đối chiếu được
  // bằng tên xe gõ tay — không đủ căn cứ để nói chiếc xe trước mặt có đúng chiếc
  // đã khai hay không.
  const declaredPhotos = (byocDeclaration?.photos ?? []).filter(Boolean)

  const canCheckIn =
    (!needsHandover || Boolean(rentalVehicleId)) &&
    (!isByoc || byocConfirmed)

  const handleCheckIn = () => {
    if (!registration) return
    if (isByoc) {
      onCheckIn({ byocConfirmed })
    } else {
      onCheckIn(rentalVehicleId ? { rentalVehicleId } : {})
    }
  }

  return (
    <StaffCard className="space-y-4">
      <h3 className="text-base font-extrabold text-[#1c1b1b]">
        Kết quả tra cứu
      </h3>
      {registration ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-[#1c1b1b]">
              {getRegistrationDisplayName(registration)}
            </p>
            <StaffBadge
              variant={
                registration.status === "CHECKED_IN"
                  ? "info"
                  : registration.status === "CONFIRMED"
                    ? "success"
                    : registration.status === "CANCELLED"
                      ? "error"
                      : "warning"
              }
            >
              {getRegistrationStatusLabel(registration.status)}
            </StaffBadge>
            <StaffBadge
              variant={
                registration.paymentStatus === "MARKED_PAID" ||
                registration.paymentStatus === "WAIVED"
                  ? "success"
                  : registration.paymentStatus === "PENDING_REVIEW"
                    ? "info"
                    : "warning"
              }
            >
              {getPaymentStatusLabel(registration.paymentStatus)}
            </StaffBadge>
            <StaffBadge variant={isByoc ? "warning" : "info"}>
              {isByoc ? "Xe cá nhân (BYOC)" : "Xe thuê"}
            </StaffBadge>
          </div>
          <div className="space-y-2 text-sm font-semibold text-[#4c4a49]">
            <p>
              Ngườ thi đấu:{" "}
              {getRegistrationSubtitle(registration) ??
                `Mã đăng ký ${registration.id.slice(0, 8)}`}
            </p>
            <p>Mã điểm danh: {registration.checkInCode ?? "--"}</p>
            <p>
              Đã điểm danh lúc:{" "}
              {formatContestDateTime(registration.checkedInAt)}
            </p>
            <p>
              Trạng thái thanh toán:{" "}
              {getPaymentStatusLabel(registration.paymentStatus)}
            </p>
          </div>

          {isCheckedIn ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <StaffBadge variant="info">Đã điểm danh</StaffBadge>
              <p className="mt-2 text-sm font-semibold text-blue-800">
                Đăng ký này đã được điểm danh. Không thể điểm danh lại.
              </p>
            </div>
          ) : (
            <>
              {isByoc ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
                  <h4 className="text-sm font-extrabold text-amber-900">
                    Xác nhận xe cá nhân (BYOC)
                  </h4>
                  <div className="grid gap-2 text-sm text-amber-800">
                    <p>
                      <span className="font-semibold">Tên xe:</span>{" "}
                      {byocDeclaration?.vehicle_name ?? "--"}
                    </p>
                    <p>
                      <span className="font-semibold">Hãng:</span>{" "}
                      {byocDeclaration?.vehicle_brand ?? "--"}
                    </p>
                    <p>
                      <span className="font-semibold">Class:</span>{" "}
                      {byocDeclaration?.vehicle_class ?? "--"}
                    </p>
                    {byocDeclaration?.notes ? (
                      <p>
                        <span className="font-semibold">Ghi chú:</span>{" "}
                        {byocDeclaration.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-xs font-extrabold text-amber-900 uppercase tracking-wide">
                      Ảnh khách nộp lúc đăng ký
                    </h5>
                    {declaredPhotos.length ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {declaredPhotos.map((url, index) => (
                            <a
                              key={`${url}-${index}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block size-24 overflow-hidden rounded-lg border border-amber-300 bg-white transition hover:border-amber-500"
                              title="Mở ảnh gốc để xem rõ"
                            >
                              <img
                                src={url}
                                alt={`Ảnh xe khách nộp ${index + 1}`}
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            </a>
                          ))}
                        </div>
                        <p className="text-xs text-amber-700">
                          Đối chiếu chiếc xe trước mặt với ảnh này trước khi
                          tick xác nhận. Bấm vào ảnh để xem cỡ lớn.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-amber-800">
                        Khách không nộp ảnh nào lúc đăng ký — không có gì để đối
                        chiếu.
                      </p>
                    )}
                  </div>

                  <label className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={byocConfirmed}
                      onChange={(e) => setByocConfirmed(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Tôi xác nhận xe cá nhân đã kiểm tra đạt chuẩn thi đấu và
                      đúng như khai báo.
                    </span>
                  </label>

                  {isByoc && !canCheckIn ? (
                    <p className="text-xs text-amber-700">
                      Cần tick xác nhận xe đạt chuẩn trước khi điểm danh.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {needsHandover ? (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <h4 className="text-sm font-extrabold text-sky-900">
                    Giao xe cho VĐV
                  </h4>
                  <p className="text-xs text-sky-800">
                    Chọn chiếc xe bạn giao tận tay. Hệ thống lưu lại để chụp ảnh
                    nhận - trả xe và tính hư hỏng khi kết thúc.
                  </p>
                  {handoverUnitsQuery.isLoading ? (
                    <p className="text-sm text-sky-800">
                      Đang tải danh sách xe...
                    </p>
                  ) : handoverUnits.length === 0 ? (
                    <p className="text-sm font-semibold text-red-700">
                      Không còn xe rảnh thuộc dòng VĐV đã đặt. Hãy kiểm tra lại
                      kho xe.
                    </p>
                  ) : (
                    <select
                      className="h-11 w-full rounded-lg border border-sky-300 bg-white px-3 text-sm"
                      value={rentalVehicleId ?? ""}
                      onChange={(event) =>
                        setRentalVehicleId(event.target.value || null)
                      }
                    >
                      <option value="">-- Chọn xe để giao --</option>
                      {handoverUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {[unit.identifier ?? unit.id.slice(0, 8), unit.color]
                            .filter(Boolean)
                            .join(" · ")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : null}

              <StaffButton
                onClick={handleCheckIn}
                disabled={isPending || !canCheckIn}
              >
                {isPending ? "Đang điểm danh..." : "Xác nhận điểm danh"}
              </StaffButton>
            </>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-[#6b7280]">
          Chưa có kết quả tra cứu.
        </p>
      )}
    </StaffCard>
  )
}
