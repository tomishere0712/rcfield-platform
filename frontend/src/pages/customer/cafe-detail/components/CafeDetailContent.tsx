import { BadgeCheck } from "lucide-react"
import type {
  AmenityCatalogItem,
  CafeProviderBusiness,
} from "@/features/cafes/types"
import { AmenityIcon } from "@/features/cafes/lib/amenity-icon"
import { cafeRules, cafeAmenities } from "../cafe-detail-data"
import { CafeRatingAggregate } from "@/features/booking-review/components/CafeRatingAggregate"
import { CafeReviewList } from "@/features/booking-review/components/CafeReviewList"

import { CafeSection } from "./SectionShell"

type AmenityLike = { id?: string; title: string; description?: string | null; icon?: string }

/** Giới thiệu cơ sở + trang thiết bị, gộp làm một mạch đọc thay vì hai khối rời. */
export function CafeAboutSection({
  description,
  amenities,
}: {
  description: string
  amenities?: AmenityCatalogItem[]
}) {
  const displayAmenities: AmenityLike[] =
    amenities && amenities.length > 0 ? amenities : cafeAmenities

  return (
    <CafeSection title="Về cơ sở này">
      <p className="max-w-3xl whitespace-pre-line text-base leading-8 text-slate-700">
        {description}
      </p>

      {displayAmenities.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">
            Trang thiết bị & tiện ích
          </h3>
          <ul className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayAmenities.map((item) => (
              <AmenityItem key={item.id ?? item.title} item={item} />
            ))}
          </ul>
        </div>
      )}
    </CafeSection>
  )
}

export function CafeReviewsSection({ cafeId }: { cafeId: string }) {
  return (
    <CafeSection title="Đánh giá từ người chơi">
      <div className="space-y-5">
        <CafeRatingAggregate cafeId={cafeId} />
        <CafeReviewList cafeId={cafeId} />
      </div>
    </CafeSection>
  )
}

export function CafeRulesSection({ rules }: { rules?: string[] }) {
  const displayRules = rules && rules.length > 0 ? rules : cafeRules

  return (
    <CafeSection
      title="Quy định cơ sở"
      lead="Đọc trước để buổi chơi diễn ra suôn sẻ."
    >
      <ol className="max-w-3xl space-y-3">
        {displayRules.map((rule, index) => (
          <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
              {index + 1}
            </span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
    </CafeSection>
  )
}

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "Hộ kinh doanh cá thể",
  BUSINESS: "Doanh nghiệp",
}

/**
 * Thông tin doanh nghiệp vận hành chi nhánh.
 *
 * Đặt cuối trang, cạnh quy định cơ sở: khách không đọc mục này để chọn quán,
 * họ tìm tới nó khi cần biết mình đang giao dịch với pháp nhân nào — lúc đối
 * chiếu hoá đơn, hoặc khi có chuyện cần khiếu nại.
 *
 * Chỉ hiện những trường có dữ liệu. Hồ sơ khai thiếu thì bày ra một hàng trống
 * ghi "—" chỉ làm chi nhánh trông cẩu thả chứ không giúp ai.
 */
export function CafeBusinessSection({
  business,
}: {
  business?: CafeProviderBusiness | null
}) {
  if (!business) return null

  const rows = [
    ["Tên doanh nghiệp", business.business_name],
    ["Tên pháp lý", business.business_legal_name],
    ["Mã số thuế", business.tax_code],
    ["Địa chỉ đăng ký kinh doanh", business.business_address],
    ["Email liên hệ", business.business_email],
    [
      "Loại hình",
      business.business_type
        ? (BUSINESS_TYPE_LABEL[business.business_type] ?? business.business_type)
        : null,
    ],
  ].filter((row): row is [string, string] => Boolean(row[1]))

  if (rows.length === 0) return null

  return (
    <CafeSection
      title="Thông tin doanh nghiệp"
      lead="Đơn vị chịu trách nhiệm vận hành chi nhánh này."
    >
      <dl className="max-w-3xl divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-6"
          >
            <dt className="shrink-0 text-sm text-slate-500 sm:w-56">{label}</dt>
            <dd className="text-sm font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      {business.tax_verified && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <BadgeCheck className="size-3.5" />
          Mã số thuế đã đối chiếu với dữ liệu Cục Thuế
        </p>
      )}
    </CafeSection>
  )
}

/**
 * Một tiện ích.
 *
 * Icon suy ra từ `item.icon` trong dữ liệu. Bản cũ hardcode `<Wrench />` cho mọi
 * tiện ích nên cả lưới ra một dãy cờ-lê giống hệt nhau, đọc xong không nhớ được gì.
 */
function AmenityItem({ item }: { item: AmenityLike }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <AmenityIcon keyword={item.icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-900">{item.title}</span>
        {item.description && (
          <span className="mt-0.5 block text-sm leading-6 text-slate-500">
            {item.description}
          </span>
        )}
      </span>
    </li>
  )
}
