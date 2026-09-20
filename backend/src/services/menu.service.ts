import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { MenuItem } from '../models/menu-item.entity';
import { MenuItemComponent } from '../models/menu-item-component.entity';
import { MenuItemVariant } from '../models/menu-item-variant.entity';
import { AppError, UserRole } from '../types';
import { getCafeDetail, getManagedCafeOrThrow } from './cafe.service';
import { resolveCategoryOrThrow } from './menu-category.service';

interface Viewer {
  userId: string;
  role: UserRole;
}

/** Giá trị `category_id` đặc biệt để lọc riêng nhóm "Chưa phân loại". */
export const UNCATEGORIZED_FILTER = 'none';

export interface MenuListOptions {
  cafeId: string;
  viewer?: Viewer;
  page: number;
  limit: number;
  /** uuid của danh mục, hoặc 'none' cho nhóm "Chưa phân loại". */
  categoryId?: string;
  available?: boolean;
}

export interface CreateMenuItemBody {
  name: string;
  description?: string | null;
  price: number;
  category_id?: string | null;
  image_url?: string | null;
  is_available?: boolean;
  /** Optional final-price choices, e.g. size M/L. */
  variants?: MenuVariantInput[];
}

export type UpdateMenuItemBody = Partial<CreateMenuItemBody>;

export interface MenuVariantInput {
  name: string;
  price: number;
  is_available?: boolean;
}

export interface ComboComponentInput {
  item_id: string;
  /** A combo may pin a component to one sellable choice (e.g. size M). */
  variant_id?: string | null;
  quantity: number;
}

export interface CreateComboBody {
  name: string;
  description?: string | null;
  price: number;
  category_id?: string | null;
  image_url?: string | null;
  is_available?: boolean;
  components: ComboComponentInput[];
}

export type UpdateComboBody = Partial<CreateComboBody>;

/**
 * Hình dạng trả về cho client: bỏ quan hệ `category` (object lồng), thay bằng
 * `categoryName` phẳng đi kèm `categoryId` sẵn có.
 */
export type MenuItemWithComponents = Omit<MenuItem, 'category'> & {
  variants: Array<{
    id: string;
    name: string;
    price: string;
    displayOrder: number;
    isAvailable: boolean;
  }>;
  components?: Array<{
    itemId: string;
    name: string;
    variantId: string | null;
    variantName: string | null;
    variantPrice: string | null;
    quantity: number;
  }>;
  /** Tên danh mục Provider đặt; null = "Chưa phân loại". */
  categoryName: string | null;
};

/**
 * Chuyển quan hệ `category` đã load thành trường phẳng `categoryName`.
 *
 * Liệt kê tường minh từng trường thay vì spread rồi loại bỏ: nếu sau này entity
 * có thêm cột, TypeScript sẽ báo thiếu trường ở đây thay vì âm thầm đẩy cột mới
 * ra API công khai.
 */
function toResponseShape(item: MenuItem, categoryName: string | null): MenuItemWithComponents {
  return {
    id: item.id,
    cafeId: item.cafeId,
    name: item.name,
    description: item.description,
    price: item.price,
    categoryId: item.categoryId,
    categoryName,
    isCombo: item.isCombo,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
    variants: [],
  };
}

function mapLoadedItems(items: MenuItem[]): MenuItemWithComponents[] {
  return items.map((item) => toResponseShape(item, item.category?.name ?? null));
}

async function getMenuItemOrThrow(cafeId: string, itemId: string): Promise<MenuItem> {
  const item = await AppDataSource.getRepository(MenuItem)
    .createQueryBuilder('item')
    .leftJoinAndSelect('item.category', 'category')
    .where('item.id = :itemId', { itemId })
    .andWhere('item.cafe_id = :cafeId', { cafeId })
    .andWhere('item.deleted_at IS NULL')
    .getOne();

  if (!item) {
    throw new AppError('Món không tồn tại', 404, 'MENU_ITEM_NOT_FOUND');
  }

  return item;
}

async function attachVariants(items: MenuItemWithComponents[]): Promise<MenuItemWithComponents[]> {
  if (!items.length) return items;

  const rows = await AppDataSource.getRepository(MenuItemVariant)
    .createQueryBuilder('variant')
    .where('variant.menu_item_id = ANY(:itemIds)', { itemIds: items.map((item) => item.id) })
    .orderBy('variant.displayOrder', 'ASC')
    .addOrderBy('variant.createdAt', 'ASC')
    .getMany();

  const byItem = new Map<string, MenuItemWithComponents['variants']>();
  for (const row of rows) {
    if (!byItem.has(row.menuItemId)) byItem.set(row.menuItemId, []);
    byItem.get(row.menuItemId)!.push({
      id: row.id,
      name: row.name,
      price: row.price,
      displayOrder: row.displayOrder,
      isAvailable: row.isAvailable,
    });
  }

  return items.map((item) => ({ ...item, variants: byItem.get(item.id) ?? [] }));
}

async function attachComponents(
  items: MenuItemWithComponents[],
): Promise<MenuItemWithComponents[]> {
  const comboIds = items.filter((i) => i.isCombo).map((i) => i.id);
  if (!comboIds.length) return items;

  const rows = await AppDataSource.query<
    {
      combo_id: string;
      item_id: string;
      item_name: string;
      variant_id: string | null;
      variant_name: string | null;
      variant_price: string | null;
      quantity: number;
    }[]
  >(
    `SELECT mc.combo_id, mc.item_id, mi.name AS item_name,
            mc.variant_id, variant.name AS variant_name, variant.price::text AS variant_price,
            mc.quantity
       FROM menu_item_components mc
       JOIN menu_items mi ON mi.id = mc.item_id AND mi.deleted_at IS NULL
       LEFT JOIN menu_item_variants variant ON variant.id = mc.variant_id
      WHERE mc.combo_id = ANY($1::uuid[])
      ORDER BY mc.created_at ASC`,
    [comboIds],
  );

  const byCombo = new Map<string, NonNullable<MenuItemWithComponents['components']>>();
  for (const row of rows) {
    if (!byCombo.has(row.combo_id)) byCombo.set(row.combo_id, []);
    byCombo.get(row.combo_id)!.push({
      itemId: row.item_id,
      name: row.item_name,
      variantId: row.variant_id,
      variantName: row.variant_name,
      variantPrice: row.variant_price,
      quantity: row.quantity,
    });
  }

  return items.map((item) => ({
    ...item,
    components: item.isCombo ? (byCombo.get(item.id) ?? []) : undefined,
  }));
}

async function hydrateMenuItems(
  items: MenuItemWithComponents[],
): Promise<MenuItemWithComponents[]> {
  return attachComponents(await attachVariants(items));
}

function normalizeVariants(variants: MenuVariantInput[]): MenuVariantInput[] {
  const names = new Set<string>();
  return variants.map((variant) => {
    const name = variant.name.trim();
    const dedupeKey = name.toLocaleLowerCase('vi');
    if (names.has(dedupeKey)) {
      throw new AppError('Tên lựa chọn không được trùng nhau', 400, 'DUPLICATE_VARIANT_NAME');
    }
    names.add(dedupeKey);
    return { ...variant, name };
  });
}

async function replaceVariants(
  manager: EntityManager,
  menuItemId: string,
  variants: MenuVariantInput[],
): Promise<void> {
  const normalized = normalizeVariants(variants);
  const variantRepo = manager.getRepository(MenuItemVariant);
  await variantRepo.delete({ menuItemId });
  if (normalized.length) {
    await variantRepo.save(
      normalized.map((variant, displayOrder) =>
        variantRepo.create({
          menuItemId,
          name: variant.name,
          price: variant.price.toFixed(2),
          displayOrder,
          isAvailable: variant.is_available ?? true,
        }),
      ),
    );
  }
}

async function validateComponentVariants(
  manager: EntityManager,
  components: ComboComponentInput[],
): Promise<void> {
  const selectedVariantIds = components
    .map((component) => component.variant_id)
    .filter((variantId): variantId is string => Boolean(variantId));
  if (!selectedVariantIds.length) return;

  const variants = await manager.getRepository(MenuItemVariant).findByIds(selectedVariantIds);
  if (variants.length !== selectedVariantIds.length) {
    throw new AppError('Lựa chọn trong combo không hợp lệ', 400, 'INVALID_COMBO_VARIANT');
  }
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const invalid = components.some((component) => {
    if (!component.variant_id) return false;
    const variant = variantById.get(component.variant_id);
    return !variant || variant.menuItemId !== component.item_id;
  });
  if (invalid) {
    throw new AppError('Lựa chọn không thuộc món của combo', 400, 'INVALID_COMBO_VARIANT');
  }
}

export async function listMenuItems(
  options: MenuListOptions,
): Promise<{ data: MenuItemWithComponents[]; total: number }> {
  const { cafeId, viewer, page, limit, categoryId, available } = options;
  const cafe = await getCafeDetail(cafeId, viewer);
  const canManage =
    viewer?.role === UserRole.ADMIN ||
    (viewer?.role === UserRole.PROVIDER && cafe.providerId === viewer.userId);

  const qb = AppDataSource.getRepository(MenuItem)
    .createQueryBuilder('item')
    .leftJoinAndSelect('item.category', 'category')
    .where('item.cafe_id = :cafeId', { cafeId })
    .andWhere('item.deleted_at IS NULL');

  if (categoryId === UNCATEGORIZED_FILTER) {
    qb.andWhere('item.category_id IS NULL');
  } else if (categoryId) {
    qb.andWhere('item.category_id = :categoryId', { categoryId });
  }

  if (!canManage) {
    qb.andWhere('item.is_available = true');
  } else if (available !== undefined) {
    qb.andWhere('item.is_available = :available', { available });
  }

  // Danh mục có tên trước, "Chưa phân loại" cuối cùng (FR-018, FR-019).
  // Món chưa phân loại không khớp LEFT JOIN nên display_order là NULL → NULLS LAST
  // đẩy chúng xuống cuối, không cần biểu thức boolean.
  const [data, total] = await qb
    .orderBy('category.displayOrder', 'ASC', 'NULLS LAST')
    .addOrderBy('category.createdAt', 'ASC', 'NULLS LAST')
    .addOrderBy('item.name', 'ASC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return { data: await hydrateMenuItems(mapLoadedItems(data)), total };
}

// ── Món phổ biến (social proof cho luồng đặt lịch) ────────────────────────────

/** Cửa sổ thời gian tính độ phổ biến. */
const POPULAR_WINDOW_DAYS = 90;

/**
 * Ngưỡng tối thiểu để một món được coi là "khách hay đặt".
 * Dưới ngưỡng này con số không có ý nghĩa thống kê và hiển thị ra sẽ thành
 * social proof gây hiểu nhầm — thà không hiện gì.
 */
const POPULAR_MIN_ORDERS = 3;

const POPULAR_LIMIT = 3;

export interface PopularMenuItem {
  menuItemId: string;
  /** Số lượt đặt (đếm theo booking riêng biệt) trong cửa sổ thời gian. */
  orderCount: number;
}

/**
 * Món được đặt nhiều nhất tại một chi nhánh, tính từ đơn F&B có thật.
 * Trả mảng rỗng khi chưa đủ dữ liệu — nơi gọi phải xử lý được trường hợp này.
 */
export async function getPopularMenuItems(cafeId: string): Promise<PopularMenuItem[]> {
  const rows = await AppDataSource.query<{ menu_item_id: string; order_count: string }[]>(
    `SELECT foi.menu_item_id, COUNT(DISTINCT fo.booking_id)::int AS order_count
       FROM fnb_order_items foi
       JOIN fnb_orders fo ON fo.id = foi.fnb_order_id
       JOIN bookings b    ON b.id = fo.booking_id
       JOIN menu_items mi ON mi.id = foi.menu_item_id
      WHERE b.cafe_id = $1
        AND fo.status <> 'CANCELLED'
        AND b.status <> 'CANCELLED'
        AND b.slot_start >= NOW() - ($2 || ' days')::interval
        AND mi.deleted_at IS NULL
        AND mi.is_available = true
        AND foi.menu_item_id IS NOT NULL
      GROUP BY foi.menu_item_id
     HAVING COUNT(DISTINCT fo.booking_id) >= $3
      ORDER BY order_count DESC, foi.menu_item_id ASC
      LIMIT $4`,
    [cafeId, String(POPULAR_WINDOW_DAYS), POPULAR_MIN_ORDERS, POPULAR_LIMIT],
  );

  return rows.map((row) => ({
    menuItemId: row.menu_item_id,
    orderCount: Number(row.order_count),
  }));
}

export async function createMenuItem(
  cafeId: string,
  viewer: Viewer,
  body: CreateMenuItemBody,
): Promise<MenuItemWithComponents> {
  await getManagedCafeOrThrow(cafeId, viewer);

  const category = await resolveCategoryOrThrow(cafeId, body.category_id);

  const saved = await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(MenuItem);
    const item = await repo.save(
      repo.create({
        cafeId,
        name: body.name,
        description: body.description ?? null,
        price: body.price.toFixed(2),
        categoryId: category?.id ?? null,
        isCombo: false,
        imageUrl: body.image_url ?? null,
        isAvailable: body.is_available ?? true,
      }),
    );
    if (body.variants !== undefined) await replaceVariants(manager, item.id, body.variants);
    return item;
  });

  const [result] = await hydrateMenuItems([toResponseShape(saved, category?.name ?? null)]);
  return result;
}

export async function updateMenuItem(
  cafeId: string,
  itemId: string,
  viewer: Viewer,
  body: UpdateMenuItemBody,
): Promise<MenuItemWithComponents> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const item = await getMenuItemOrThrow(cafeId, itemId);

  if (item.isCombo)
    throw new AppError('Dùng endpoint combo để sửa combo', 400, 'USE_COMBO_ENDPOINT');

  if (body.name !== undefined) item.name = body.name;
  if (body.description !== undefined) item.description = body.description ?? null;
  if (body.price !== undefined) item.price = body.price.toFixed(2);
  if (body.category_id !== undefined) {
    const category = await resolveCategoryOrThrow(cafeId, body.category_id);
    item.categoryId = category?.id ?? null;
    item.category = category;
  }
  if (body.image_url !== undefined) item.imageUrl = body.image_url ?? null;
  if (body.is_available !== undefined) item.isAvailable = body.is_available;

  const categoryName = item.category?.name ?? null;
  const saved = await AppDataSource.transaction(async (manager) => {
    const result = await manager.getRepository(MenuItem).save(item);
    if (body.variants !== undefined) await replaceVariants(manager, item.id, body.variants);
    return result;
  });
  const [result] = await hydrateMenuItems([toResponseShape(saved, categoryName)]);
  return result;
}

export async function deleteMenuItem(
  cafeId: string,
  itemId: string,
  viewer: Viewer,
): Promise<void> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const item = await getMenuItemOrThrow(cafeId, itemId);
  item.deletedAt = new Date();
  await AppDataSource.getRepository(MenuItem).save(item);
}

export async function createCombo(
  cafeId: string,
  viewer: Viewer,
  body: CreateComboBody,
): Promise<MenuItemWithComponents> {
  await getManagedCafeOrThrow(cafeId, viewer);

  // Validate all component items belong to this cafe
  const componentIds = body.components.map((c) => c.item_id);
  const existingItems = await AppDataSource.getRepository(MenuItem).find({
    where: componentIds.map((id) => ({ id, cafeId })),
  });
  if (existingItems.length !== componentIds.length) {
    throw new AppError('Một hoặc nhiều món trong combo không hợp lệ', 400, 'INVALID_COMBO_ITEMS');
  }
  const hasComboInComponents = existingItems.some((i) => i.isCombo);
  if (hasComboInComponents) {
    throw new AppError('Không thể thêm combo vào trong combo', 400, 'COMBO_IN_COMBO');
  }

  // Provider tự gán danh mục cho combo giống món lẻ — hệ thống KHÔNG tự gán (FR-013)
  const category = await resolveCategoryOrThrow(cafeId, body.category_id);

  const combo = await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(MenuItem);
    const created = await itemRepo.save(
      itemRepo.create({
        cafeId,
        name: body.name,
        description: body.description ?? null,
        price: body.price.toFixed(2),
        categoryId: category?.id ?? null,
        isCombo: true,
        imageUrl: body.image_url ?? null,
        isAvailable: body.is_available ?? true,
      }),
    );

    await validateComponentVariants(manager, body.components);
    const compRepo = manager.getRepository(MenuItemComponent);
    await compRepo.save(
      body.components.map((c) =>
        compRepo.create({
          comboId: created.id,
          itemId: c.item_id,
          variantId: c.variant_id ?? null,
          quantity: c.quantity,
        }),
      ),
    );

    return created;
  });

  const [result] = await hydrateMenuItems([toResponseShape(combo, category?.name ?? null)]);
  return result;
}

export async function updateCombo(
  cafeId: string,
  itemId: string,
  viewer: Viewer,
  body: UpdateComboBody,
): Promise<MenuItemWithComponents> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const combo = await getMenuItemOrThrow(cafeId, itemId);
  if (!combo.isCombo) throw new AppError('Món này không phải combo', 400, 'NOT_A_COMBO');

  if (body.category_id !== undefined) {
    const category = await resolveCategoryOrThrow(cafeId, body.category_id);
    combo.categoryId = category?.id ?? null;
    combo.category = category;
  }
  const categoryName = combo.category?.name ?? null;

  const updated = await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(MenuItem);

    if (body.name !== undefined) combo.name = body.name;
    if (body.description !== undefined) combo.description = body.description ?? null;
    if (body.price !== undefined) combo.price = body.price.toFixed(2);
    if (body.image_url !== undefined) combo.imageUrl = body.image_url ?? null;
    if (body.is_available !== undefined) combo.isAvailable = body.is_available;
    await itemRepo.save(combo);

    if (body.components !== undefined) {
      const componentIds = body.components.map((c) => c.item_id);
      const existingItems = await manager.getRepository(MenuItem).find({
        where: componentIds.map((id) => ({ id, cafeId })),
      });
      if (existingItems.length !== componentIds.length) {
        throw new AppError(
          'Một hoặc nhiều món trong combo không hợp lệ',
          400,
          'INVALID_COMBO_ITEMS',
        );
      }
      if (existingItems.some((i) => i.isCombo)) {
        throw new AppError('Không thể thêm combo vào trong combo', 400, 'COMBO_IN_COMBO');
      }

      await validateComponentVariants(manager, body.components);
      const compRepo = manager.getRepository(MenuItemComponent);
      await compRepo.delete({ comboId: combo.id });
      await compRepo.save(
        body.components.map((c) =>
          compRepo.create({
            comboId: combo.id,
            itemId: c.item_id,
            variantId: c.variant_id ?? null,
            quantity: c.quantity,
          }),
        ),
      );
    }

    return combo;
  });

  const [result] = await hydrateMenuItems([toResponseShape(updated, categoryName)]);
  return result;
}
