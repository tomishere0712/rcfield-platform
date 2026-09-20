import { AppDataSource } from '../config/database';
import { MenuCategory } from '../models/menu-category.entity';
import { MenuItem } from '../models/menu-item.entity';
import { AppError, UserRole } from '../types';
import { getCafeDetail, getManagedCafeOrThrow } from './cafe.service';

/** Tối đa danh mục mỗi chi nhánh (FR-008). */
const MAX_CATEGORIES_PER_CAFE = 30;

interface Viewer {
  userId: string;
  role: UserRole;
}

export interface MenuCategoryResponse {
  id: string;
  cafeId: string;
  name: string;
  displayOrder: number;
  /**
   * Số món chưa xóa thuộc danh mục, TÍNH CẢ món đang tạm ngưng bán (FR-015).
   * Chỉ dùng cho màn quản lý của Provider — không dùng để quyết định ẩn danh mục
   * khỏi màn khách, vì danh mục toàn món tạm ẩn vẫn có itemCount > 0 (FR-021).
   */
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuCategoryBody {
  name: string;
}

export type UpdateMenuCategoryBody = CreateMenuCategoryBody;

function toResponse(category: MenuCategory, itemCount: number): MenuCategoryResponse {
  return {
    id: category.id,
    cafeId: category.cafeId,
    name: category.name,
    displayOrder: category.displayOrder,
    itemCount,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/** Đếm món chưa xóa của từng danh mục. Không lọc is_available (FR-015). */
async function countItemsByCategory(categoryIds: string[]): Promise<Map<string, number>> {
  if (!categoryIds.length) return new Map();

  const rows = await AppDataSource.query<{ category_id: string; count: string }[]>(
    `SELECT category_id, COUNT(*)::int AS count
       FROM menu_items
      WHERE category_id = ANY($1::uuid[])
        AND deleted_at IS NULL
      GROUP BY category_id`,
    [categoryIds],
  );

  return new Map(rows.map((row) => [row.category_id, Number(row.count)]));
}

async function getCategoryOrThrow(cafeId: string, categoryId: string): Promise<MenuCategory> {
  const category = await AppDataSource.getRepository(MenuCategory).findOne({
    where: { id: categoryId, cafeId },
  });

  // Danh mục của chi nhánh khác cũng trả 404 — không tiết lộ sự tồn tại (FR-005).
  if (!category) {
    throw new AppError('Danh mục không tồn tại', 404, 'CATEGORY_NOT_FOUND');
  }

  return category;
}

/**
 * Chặn trùng tên trong phạm vi chi nhánh, bỏ qua danh mục đã xóa mềm (FR-006).
 * Partial unique index ở DB là chốt cuối; hàm này chỉ để trả lỗi tiếng Việt rõ ràng.
 */
async function assertNameAvailable(
  cafeId: string,
  name: string,
  excludeCategoryId?: string,
): Promise<void> {
  const rows = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM menu_categories
      WHERE cafe_id = $1
        AND deleted_at IS NULL
        AND lower(btrim(name)) = lower(btrim($2))
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1`,
    [cafeId, name, excludeCategoryId ?? null],
  );

  if (rows.length) {
    throw new AppError(
      `Danh mục "${name}" đã tồn tại trong cơ sở này`,
      409,
      'CATEGORY_NAME_DUPLICATE',
    );
  }
}

/** Liệt kê danh mục của chi nhánh theo thứ tự hiển thị. Công khai (FR-017). */
export async function listCategories(
  cafeId: string,
  viewer?: Viewer,
): Promise<MenuCategoryResponse[]> {
  // Xác thực cafe tồn tại + hiển thị được với viewer hiện tại
  await getCafeDetail(cafeId, viewer);

  const categories = await AppDataSource.getRepository(MenuCategory)
    .createQueryBuilder('category')
    .where('category.cafe_id = :cafeId', { cafeId })
    .andWhere('category.deleted_at IS NULL')
    .orderBy('category.display_order', 'ASC')
    .addOrderBy('category.created_at', 'ASC')
    .getMany();

  const counts = await countItemsByCategory(categories.map((c) => c.id));
  return categories.map((category) => toResponse(category, counts.get(category.id) ?? 0));
}

/** Tạo danh mục mới, xếp xuống cuối danh sách. */
export async function createCategory(
  cafeId: string,
  viewer: Viewer,
  body: CreateMenuCategoryBody,
): Promise<MenuCategoryResponse> {
  await getManagedCafeOrThrow(cafeId, viewer);
  await assertNameAvailable(cafeId, body.name);

  const repo = AppDataSource.getRepository(MenuCategory);

  const total = await repo.count({ where: { cafeId } });
  if (total >= MAX_CATEGORIES_PER_CAFE) {
    throw new AppError(
      `Mỗi cơ sở chỉ được tạo tối đa ${MAX_CATEGORIES_PER_CAFE} danh mục`,
      409,
      'CATEGORY_LIMIT_EXCEEDED',
    );
  }

  const [{ next }] = await AppDataSource.query<[{ next: number }]>(
    `SELECT COALESCE(MAX(display_order), -1) + 1 AS next
       FROM menu_categories
      WHERE cafe_id = $1 AND deleted_at IS NULL`,
    [cafeId],
  );

  const category = await repo.save(
    repo.create({ cafeId, name: body.name, displayOrder: Number(next) }),
  );

  return toResponse(category, 0);
}

/** Đổi tên danh mục. */
export async function updateCategory(
  cafeId: string,
  categoryId: string,
  viewer: Viewer,
  body: UpdateMenuCategoryBody,
): Promise<MenuCategoryResponse> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const category = await getCategoryOrThrow(cafeId, categoryId);
  await assertNameAvailable(cafeId, body.name, categoryId);

  category.name = body.name;
  const saved = await AppDataSource.getRepository(MenuCategory).save(category);

  const counts = await countItemsByCategory([categoryId]);
  return toResponse(saved, counts.get(categoryId) ?? 0);
}

/**
 * Xóa mềm một danh mục RỖNG.
 *
 * ⚠️ Đoạn đếm dưới đây là guard DUY NHẤT thực thi FR-015. Khóa ngoại
 * `ON DELETE RESTRICT` không hỗ trợ gì ở đây vì xóa danh mục là UPDATE
 * (xóa mềm) chứ không phải DELETE, nên ràng buộc DB không bao giờ kích hoạt.
 */
export async function deleteCategory(
  cafeId: string,
  categoryId: string,
  viewer: Viewer,
): Promise<void> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const category = await getCategoryOrThrow(cafeId, categoryId);

  // KHÔNG lọc is_available — món tạm ngưng bán vẫn tính là món thuộc danh mục.
  const itemCount = await AppDataSource.getRepository(MenuItem).count({
    where: { categoryId },
  });

  if (itemCount > 0) {
    throw new AppError(
      `Danh mục "${category.name}" còn ${itemCount} món. Vui lòng chuyển các món sang danh mục khác trước khi xóa.`,
      409,
      'CATEGORY_NOT_EMPTY',
      { itemCount },
    );
  }

  category.deletedAt = new Date();
  await AppDataSource.getRepository(MenuCategory).save(category);
}

/**
 * Gán lại display_order = 0..N-1 theo đúng thứ tự mảng truyền vào.
 * Bắt buộc nhận đủ và đúng một lần mọi danh mục chưa xóa của chi nhánh —
 * ghi đè toàn bộ nên không thể lệch thứ tự khi hai tab cùng thao tác.
 */
export async function reorderCategories(
  cafeId: string,
  viewer: Viewer,
  categoryIds: string[],
): Promise<MenuCategoryResponse[]> {
  await getManagedCafeOrThrow(cafeId, viewer);

  const unique = new Set(categoryIds);
  if (unique.size !== categoryIds.length) {
    throw new AppError('Danh sách danh mục có id trùng lặp', 400, 'INVALID_CATEGORY_ORDER');
  }

  const repo = AppDataSource.getRepository(MenuCategory);
  const existing = await repo.find({ where: { cafeId } });

  const existingIds = new Set(existing.map((c) => c.id));
  const sameSize = existingIds.size === unique.size;
  const allKnown = categoryIds.every((id) => existingIds.has(id));
  if (!sameSize || !allKnown) {
    throw new AppError(
      'Danh sách sắp xếp phải chứa đầy đủ và đúng một lần mọi danh mục của cơ sở',
      400,
      'INVALID_CATEGORY_ORDER',
    );
  }

  await AppDataSource.transaction(async (manager) => {
    for (const [index, id] of categoryIds.entries()) {
      await manager.update(MenuCategory, { id }, { displayOrder: index });
    }
  });

  return listCategories(cafeId, viewer);
}

/**
 * Xác thực một danh mục dùng được cho món của chi nhánh này (FR-012).
 * Trả về null khi categoryId là null/undefined ("Chưa phân loại").
 * Trả về entity để nơi gọi lấy luôn tên mà không cần truy vấn thêm.
 */
export async function resolveCategoryOrThrow(
  cafeId: string,
  categoryId: string | null | undefined,
): Promise<MenuCategory | null> {
  if (categoryId === null || categoryId === undefined) return null;

  const category = await AppDataSource.getRepository(MenuCategory).findOne({
    where: { id: categoryId, cafeId },
  });

  if (!category) {
    throw new AppError('Danh mục không hợp lệ hoặc không thuộc cơ sở này', 400, 'INVALID_CATEGORY');
  }

  return category;
}
