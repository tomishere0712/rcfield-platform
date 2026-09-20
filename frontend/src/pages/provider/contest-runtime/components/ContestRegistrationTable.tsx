import type { ContestRegistration } from "@/features/contests/types"
import {
  formatContestDateTime,
  getByocDeclaration,
  getRegistrationDisplayName,
  getRegistrationSubtitle,
} from "@/features/contests/lib/contest-runtime"
import { journeyStatusAddsDetail } from "@/features/contests/lib/contest-status"
import {
  JourneyStatusBadge,
  PaymentStatusBadge,
  RegistrationStatusBadge,
} from "@/features/contests/components"
import {
  RegistrationRowActions,
  type RegistrationActionKind,
} from "./RegistrationRowActions"

export function ContestRegistrationTable({
  registrations,
  onAction,
  onCheckIn,
  resolveCheckInBlock,
}: {
  registrations: ContestRegistration[]
  onAction: (
    kind: RegistrationActionKind,
    registration: ContestRegistration,
  ) => void
  onCheckIn?: (registration: ContestRegistration) => void
  /** Trả về lý do khoá nút điểm danh của riêng hàng đó, hoặc undefined nếu cho bấm. */
  resolveCheckInBlock?: (
    registration: ContestRegistration,
  ) => string | undefined
}) {
  return (
    <div className="divide-y divide-[#e5e2e1] rounded-xl border border-[#e5e2e1]">
      {registrations.map((registration) => (
        <RegistrationRow
          key={registration.id}
          registration={registration}
          onAction={onAction}
          onCheckIn={onCheckIn}
          checkInBlockedReason={resolveCheckInBlock?.(registration)}
        />
      ))}

      {registrations.length === 0 ? (
        <div className="p-8 text-center text-sm font-semibold text-[#747878]">
          Không có đăng ký phù hợp bộ lọc.
        </div>
      ) : null}
    </div>
  )
}

function RegistrationRow({
  registration,
  onAction,
  onCheckIn,
  checkInBlockedReason,
}: {
  registration: ContestRegistration
  onAction: (
    kind: RegistrationActionKind,
    registration: ContestRegistration,
  ) => void
  onCheckIn?: (registration: ContestRegistration) => void
  checkInBlockedReason?: string
}) {
  const declaration =
    registration.vehicleSource === "BYOC"
      ? getByocDeclaration(registration)
      : null

  // Một dòng thông tin thay cho bốn thẻ lồng nhau. Lệ phí bỏ hẳn: huy hiệu
  // thanh toán đã nói xong chuyện, còn con số thì giải nào cũng như nhau và đã
  // nằm ở phần tổng quan.
  const facts = [
    registration.checkInCode ? `Mã ${registration.checkInCode}` : null,
    declaration
      ? [
          declaration.vehicle_name,
          declaration.vehicle_brand,
          declaration.vehicle_class,
        ]
          .filter(Boolean)
          .join(" · ") || "Chưa khai báo xe"
      : "Thuê xe của quán",
    registration.checkedInAt
      ? `Điểm danh ${formatContestDateTime(registration.checkedInAt)}`
      : null,
  ].filter(Boolean) as string[]

  return (
    <article className="flex flex-col gap-3 p-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-extrabold text-[#1c1b1b]">
            {getRegistrationDisplayName(registration)}
          </p>
          <RegistrationStatusBadge status={registration.status} />
          <PaymentStatusBadge status={registration.paymentStatus} />
          {journeyStatusAddsDetail(registration.customerJourneyStatus) ? (
            <JourneyStatusBadge status={registration.customerJourneyStatus} />
          ) : null}
        </div>

        <p className="mt-0.5 text-xs font-semibold text-[#747878]">
          {getRegistrationSubtitle(registration) ??
            `Mã đăng ký ${registration.id.slice(0, 8)}`}
        </p>

        <p className="mt-1.5 text-xs font-semibold text-[#5d5f5f]">
          {facts.join("  ·  ")}
        </p>

        {declaration ? (
          <ByocPhotoStrip
            photos={declaration.photos}
            notes={declaration.notes}
          />
        ) : null}
      </div>

      <RegistrationRowActions
        registration={registration}
        onAction={onAction}
        onCheckIn={onCheckIn}
        checkInBlockedReason={checkInBlockedReason}
      />
    </article>
  )
}

/**
 * Ảnh xe VĐV nộp — căn cứ duy nhất để nói xe đạt hay không đạt chuẩn, nên phải
 * nhìn thấy ngay trên hàng chứ không giấu sau một cú bấm.
 */
function ByocPhotoStrip({
  photos,
  notes,
}: {
  photos: string[]
  notes: string | null
}) {
  if (photos.length === 0) {
    return (
      <p className="mt-2 text-xs font-semibold text-amber-700">
        Không có ảnh xe — không đủ căn cứ để duyệt đạt chuẩn.
      </p>
    )
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {photos.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Mở ảnh kích thước đầy đủ"
            className="block size-14 overflow-hidden rounded-lg border border-[#e5e2e1] hover:border-[#1c1b1b]"
          >
            <img
              src={url}
              alt="Ảnh xe cá nhân do VĐV nộp"
              className="size-full object-cover"
            />
          </a>
        ))}
      </div>
      {notes ? (
        <p className="text-xs font-semibold text-[#747878]">{notes}</p>
      ) : null}
    </div>
  )
}
