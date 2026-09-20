import type { SortOption } from "@/shared/data/explore-data"

export interface FilterOption {
  value: string
  label: string
}

export const CITY_OPTIONS: FilterOption[] = [
  { value: "all", label: "Tất cả thành phố" },
  { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
  { value: "Hà Nội", label: "Hà Nội" },
  { value: "Đà Nẵng", label: "Đà Nẵng" },
  { value: "Hải Phòng", label: "Hải Phòng" },
  { value: "Cần Thơ", label: "Cần Thơ" },
]

export const PRICE_RANGE_OPTIONS: FilterOption[] = [
  { value: "all", label: "Mọi mức giá" },
  { value: "under100", label: "Dưới 100k / giờ" },
  { value: "100to200", label: "100k - 200k / giờ" },
  { value: "over200", label: "Trên 200k / giờ" },
]

export const FEATURE_OPTIONS: FilterOption[] = [
  { value: "all", label: "Tất cả tiện ích" },
  { value: "Serious Inspection", label: "Kiểm xe Serious Inspection" },
  { value: "Đồ ăn & Nước uống", label: "Dịch vụ đồ ăn & thức uống" },
  { value: "Hệ thống Đèn đêm", label: "Đèn chiếu sáng đêm" },
  { value: "Pit Lane chuyên nghiệp", label: "Khu kỹ thuật Pit Stop" },
  { value: "Mát lạnh Điều hòa", label: "Mát lạnh Điều hòa trong nhà" },
]

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popularity", label: "Độ phổ biến" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "rating", label: "Đánh giá cao nhất" },
]

export const PRICE_SLIDER_MIN = 0
export const PRICE_SLIDER_MAX = 24_000_000
export const PRICE_SLIDER_STEP = 100_000
