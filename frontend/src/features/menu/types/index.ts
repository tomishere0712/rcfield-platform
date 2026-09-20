/** Nhãn hiển thị cho món chưa gán danh mục. */
export const UNCATEGORIZED_LABEL = 'Chưa phân loại'

/** Giá trị lọc đặc biệt để lấy riêng nhóm "Chưa phân loại". */
export const UNCATEGORIZED_FILTER = 'none'

export type MenuCategory = {
  id: string
  cafeId: string
  name: string
  displayOrder: number
  /**
   * Số món thuộc danh mục, TÍNH CẢ món tạm ngưng bán.
   * Chỉ dùng cho màn quản lý — không dùng để quyết định ẩn danh mục khỏi màn khách.
   */
  itemCount: number
  createdAt: string
  updatedAt: string
}

export type MenuCategoryUpsertBody = {
  name: string
}

/**
 * Món được đặt nhiều nhất tại chi nhánh, đếm từ đơn F&B có thật trong 90 ngày.
 * Backend chỉ trả về món đạt ngưỡng tối thiểu — mảng rỗng nghĩa là chưa đủ
 * dữ liệu, khi đó KHÔNG được hiển thị số liệu phỏng đoán nào.
 */
export type PopularMenuItem = {
  menuItemId: string
  orderCount: number
}

export type MenuComponent = {
  itemId: string
  name: string
  variantId: string | null
  variantName: string | null
  variantPrice: string | number | null
  quantity: number
}

export type MenuVariant = {
  id: string
  name: string
  price: string | number
  displayOrder: number
  isAvailable: boolean
}

export type MenuItem = {
  id: string
  cafeId: string
  name: string
  description: string | null
  price: string | number
  categoryId: string | null
  categoryName: string | null
  isCombo: boolean
  /** Older cached menu responses may omit this field; treat that as fixed-price. */
  variants?: MenuVariant[]
  components?: MenuComponent[]
  imageUrl: string | null
  isAvailable: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type MenuListParams = {
  page?: number
  limit?: number
  /** uuid danh mục, hoặc 'none' cho nhóm "Chưa phân loại". */
  category_id?: string
  available?: boolean
}

export type MenuUpsertBody = {
  name: string
  description?: string | null
  price: number
  category_id?: string | null
  image_url?: string | null
  is_available?: boolean
  variants?: Array<{ name: string; price: number; is_available?: boolean }>
}

export type ComboUpsertBody = {
  name: string
  description?: string | null
  price: number
  category_id?: string | null
  image_url?: string | null
  is_available?: boolean
  components: Array<{ item_id: string; variant_id?: string | null; quantity: number }>
}

/** A selected menu line. The key is stable for quantity updates and URL serialisation. */
export type FnbSelection = {
  menuItemId: string
  variantId?: string
  quantity: number
  notes?: string
}

export type FnbSelections = Record<string, FnbSelection>

export const fnbSelectionKey = (menuItemId: string, variantId?: string) =>
  variantId ? `${menuItemId}::${variantId}` : menuItemId

export const parseFnbSelectionKey = (key: string) => {
  const [menuItemId, variantId] = key.split("::")
  return { menuItemId, variantId: variantId || undefined }
}

export type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type MenuListResponse = ApiEnvelope<MenuItem[]> & {
  meta: {
    total: number
    page: number
    limit: number
  }
}
