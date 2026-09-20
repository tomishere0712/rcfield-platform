import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

type MenuVariantSeed = { name: string; price: number; isAvailable?: boolean };
type MenuSeedItem = {
  name: string;
  /** Keeps seed idempotent when an older menu used another display name. */
  legacyNames?: string[];
  description: string;
  price: number;
  category: 'Đồ uống' | 'Đồ ăn nhẹ';
  imageUrl: string;
  variants?: MenuVariantSeed[];
};
type ComboSeed = {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  components: Array<{ itemName: string; variantName?: string; quantity: number }>;
};

const menuSeeds: Record<string, MenuSeedItem[]> = {
  'rc-arena-ha-noi': [
    {
      name: 'Trà sữa trân châu đen',
      description: 'Trà oolong pha sữa tươi, trân châu nấu mềm và đá mát lạnh.',
      price: 35000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-tra-sua-tran-chau-den.png',
      variants: [
        { name: 'M', price: 35000 },
        { name: 'L', price: 45000 },
      ],
    },
    {
      name: 'Cà phê sữa đá',
      description: 'Cà phê phin Đà Lạt pha sữa đặc, đậm vị và thơm mùi rang xay.',
      price: 25000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-ca-phe-sua-da.png',
      variants: [
        { name: 'M', price: 25000 },
        { name: 'L', price: 30000 },
      ],
    },
    {
      name: 'Matcha latte đá',
      description: 'Matcha Uji xay mịn, hòa cùng sữa tươi béo nhẹ và đá viên.',
      price: 40000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-matcha-latte.png',
      variants: [
        { name: 'M', price: 40000 },
        { name: 'L', price: 50000 },
      ],
    },
    {
      name: 'Nước cam ép',
      description: 'Cam tươi ép nguyên chất, vị chua ngọt tự nhiên.',
      price: 30000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-nuoc-cam-ep.png',
      variants: [
        { name: 'M', price: 30000 },
        { name: 'L', price: 40000 },
      ],
    },
    {
      name: 'Nước ngọt lon',
      legacyNames: ['Pepsi / 7UP lon'],
      description: 'Nước ngọt lon ướp lạnh, chọn vị khi gọi món.',
      price: 15000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-nuoc-ngot-lon.png',
      variants: [
        { name: 'Pepsi', price: 15000 },
        { name: '7UP', price: 15000 },
      ],
    },
    {
      name: 'Nước suối',
      description: 'Nước suối đóng chai, phục vụ lạnh.',
      price: 10000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/arena-nuoc-suoi.png',
    },
    {
      name: 'Bánh mì que phô mai',
      description: 'Bánh mì nướng giòn, nhân phô mai mozzarella tan chảy.',
      price: 25000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/arena-banh-mi-que-pho-mai.png',
    },
    {
      name: 'Snack vị bò cay',
      description: 'Snack khoai tây lát mỏng vị bò nướng cay, gói 60g.',
      price: 20000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/arena-snack-vi-bo-cay.png',
    },
    {
      name: 'Khoai tây chiên bơ tỏi',
      description: 'Khoai tây wedges chiên vàng, áo bơ tỏi thơm, phục vụ nóng.',
      price: 35000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/arena-khoai-tay-chien-bo-toi.png',
    },
    {
      name: 'Xúc xích nướng (2 chiếc)',
      description: 'Hai chiếc xúc xích nướng than, kèm mù tạt và tương cà.',
      price: 35000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/arena-xuc-xich-nuong-2.png',
    },
    {
      name: 'Xúc xích nướng',
      description: 'Một chiếc xúc xích nướng than, kèm mù tạt và tương cà.',
      price: 20000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/arena-xuc-xich-nuong-1.png',
    },
  ],
  'rc-drift-club-sai-gon': [
    {
      name: 'Bạc xỉu đá',
      description: 'Cà phê Sài Gòn nhiều sữa, ít cà phê và đá mát lạnh.',
      price: 22000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/drift-bac-xiu-da.png',
      variants: [
        { name: 'M', price: 22000 },
        { name: 'L', price: 30000 },
      ],
    },
    {
      name: 'Cà phê đen đá',
      description: 'Robusta Tây Nguyên pha phin, đậm vị và thơm hương rang.',
      price: 18000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/drift-ca-phe-den-da.png',
      variants: [
        { name: 'M', price: 18000 },
        { name: 'L', price: 25000 },
      ],
    },
    {
      name: 'Sinh tố xoài',
      description: 'Xoài cát Hòa Lộc xay với sữa chua, vị chua ngọt dịu.',
      price: 35000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/drift-sinh-to-xoai.png',
      variants: [
        { name: 'M', price: 35000 },
        { name: 'L', price: 45000 },
      ],
    },
    {
      name: 'Trà đào cam sả',
      description: 'Trà đào cùng cam tươi và sả thơm, dùng lạnh.',
      price: 30000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/drift-tra-dao-cam-sa.png',
      variants: [
        { name: 'M', price: 30000 },
        { name: 'L', price: 40000 },
      ],
    },
    {
      name: 'Lon nước ngọt',
      description: 'Nước ngọt lon ướp lạnh.',
      price: 15000,
      category: 'Đồ uống',
      imageUrl: '/images/menu/drift-nuoc-ngot-lon.png',
    },
    {
      name: 'Bánh tráng trộn',
      description: 'Bánh tráng Tây Ninh trộn xoài, tôm khô và sa tế.',
      price: 25000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/drift-banh-trang-tron.png',
    },
    {
      name: 'Hột vịt lộn (2 trứng)',
      description: 'Hai hột vịt lộn ăn kèm rau răm và gừng muối.',
      price: 20000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/drift-hot-vit-lon.png',
    },
    {
      name: 'Bắp rang bơ (ly lớn)',
      description: 'Bắp rang bơ muối thơm, phần ly lớn 500ml.',
      price: 30000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/drift-bap-rang-bo-large.png',
    },
    {
      name: 'Khô mực nướng',
      description: 'Mực một nắng nướng than, dùng cùng tương me cay.',
      price: 45000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/drift-kho-muc-nuong.png',
    },
    {
      name: 'Bắp rang bơ',
      description: 'Bắp rang bơ muối thơm, phần thường.',
      price: 20000,
      category: 'Đồ ăn nhẹ',
      imageUrl: '/images/menu/drift-bap-rang-bo-regular.png',
    },
  ],
};

const comboSeeds: Record<string, ComboSeed[]> = {
  'rc-arena-ha-noi': [
    {
      name: 'Combo Nạp năng lượng',
      description: 'Cà phê sữa đá size M kèm bánh mì que phô mai.',
      price: 45000,
      imageUrl: '/images/menu/arena-combo-nap-nang-luong.png',
      components: [
        { itemName: 'Cà phê sữa đá', variantName: 'M', quantity: 1 },
        { itemName: 'Bánh mì que phô mai', quantity: 1 },
      ],
    },
    {
      name: 'Combo Pit stop',
      description: 'Nước ngọt lon kèm khoai tây chiên bơ tỏi.',
      price: 45000,
      imageUrl: '/images/menu/arena-combo-pit-stop.png',
      components: [
        { itemName: 'Nước ngọt lon', quantity: 1 },
        { itemName: 'Khoai tây chiên bơ tỏi', quantity: 1 },
      ],
    },
    {
      name: 'Combo Khởi động',
      description: 'Nước cam ép kèm snack vị bò cay, đủ nhẹ để bắt đầu một lượt chạy.',
      price: 42000,
      imageUrl: '/images/menu/arena-combo-khoi-dong.png',
      components: [
        { itemName: 'Nước cam ép', variantName: 'M', quantity: 1 },
        { itemName: 'Snack vị bò cay', quantity: 1 },
      ],
    },
  ],
  'rc-drift-club-sai-gon': [
    {
      name: 'Combo Trước giờ chạy',
      description: 'Bạc xỉu đá size M kèm bắp rang bơ phần thường.',
      price: 39000,
      imageUrl: '/images/menu/drift-combo-truoc-gio-chay.png',
      components: [
        { itemName: 'Bạc xỉu đá', variantName: 'M', quantity: 1 },
        { itemName: 'Bắp rang bơ', quantity: 1 },
      ],
    },
    {
      name: 'Combo Kết phiên',
      description: 'Trà đào cam sả size M kèm hai hột vịt lộn.',
      price: 45000,
      imageUrl: '/images/menu/drift-combo-ket-phien.png',
      components: [
        { itemName: 'Trà đào cam sả', variantName: 'M', quantity: 1 },
        { itemName: 'Hột vịt lộn (2 trứng)', quantity: 1 },
      ],
    },
    {
      name: 'Combo Drift nhẹ',
      description: 'Trà đào cam sả size M kèm bánh tráng trộn, phù hợp trước giờ vào sân.',
      price: 48000,
      imageUrl: '/images/menu/drift-combo-drift-nhe.png',
      components: [
        { itemName: 'Trà đào cam sả', variantName: 'M', quantity: 1 },
        { itemName: 'Bánh tráng trộn', quantity: 1 },
      ],
    },
  ],
};

// Ảnh stock công khai, được crop tại CDN để danh sách menu tải nhẹ và đồng đều.
// Cùng một ảnh có thể dùng cho các món cùng nhóm trong seed demo; Provider vẫn
// có thể thay ảnh thật của quán bằng màn hình quản lý menu.
const STOCK_IMAGES = {
  coffee:
    'https://images.unsplash.com/photo-1471922597728-92f81bfe2445?auto=format&fit=crop&w=900&q=80',
  drink:
    'https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=900&q=80',
  juice:
    'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=900&q=80',
  fries:
    'https://images.unsplash.com/photo-1615485290836-4ebcebf44aaf?auto=format&fit=crop&w=900&q=80',
  snack:
    'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=900&q=80',
} as const;

function stockImageFor(seedPath: string): string {
  if (/(ca-phe|bac-xiu)/.test(seedPath)) return STOCK_IMAGES.coffee;
  if (/(nuoc-cam|sinh-to)/.test(seedPath)) return STOCK_IMAGES.juice;
  if (/(tra-sua|matcha|tra-dao|nuoc-ngot|nuoc-suoi)/.test(seedPath)) return STOCK_IMAGES.drink;
  if (/(khoai-tay|combo-pit-stop)/.test(seedPath)) return STOCK_IMAGES.fries;
  return STOCK_IMAGES.snack;
}

async function ensureCategory(
  cafeId: string,
  name: string,
  displayOrder: number,
): Promise<{ id: string }> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM menu_categories
      WHERE cafe_id = $1 AND lower(btrim(name)) = lower(btrim($2)) AND deleted_at IS NULL`,
    [cafeId, name],
  );
  if (existing) {
    await AppDataSource.query(`UPDATE menu_categories SET display_order = $2 WHERE id = $1`, [
      existing.id,
      displayOrder,
    ]);
    return existing;
  }
  const [created] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO menu_categories (cafe_id, name, display_order) VALUES ($1, $2, $3) RETURNING id`,
    [cafeId, name, displayOrder],
  );
  return created;
}

async function upsertMenuItem(
  cafeId: string,
  categoryId: string,
  item: MenuSeedItem,
): Promise<{ id: string }> {
  const knownNames = [item.name, ...(item.legacyNames ?? [])];
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM menu_items
      WHERE cafe_id = $1 AND name = ANY($2::varchar[]) AND deleted_at IS NULL
      ORDER BY CASE WHEN name = $3 THEN 0 ELSE 1 END
      LIMIT 1`,
    [cafeId, knownNames, item.name],
  );
  const params = [
    item.name,
    item.description,
    item.price,
    categoryId,
    stockImageFor(item.imageUrl),
  ];
  let savedId = existing?.id;
  if (savedId) {
    await AppDataSource.query(
      `UPDATE menu_items
          SET name = $1, description = $2, price = $3, category_id = $4,
              image_url = $5, is_available = TRUE, is_combo = FALSE, updated_at = NOW()
        WHERE id = $6`,
      [...params, savedId],
    );
  } else {
    await AppDataSource.query(
      `INSERT INTO menu_items
         (cafe_id, name, description, price, category_id, image_url, is_available, is_combo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE)`,
      [cafeId, ...params],
    );
    const [created] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM menu_items WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, item.name],
    );
    savedId = created?.id;
  }
  if (!savedId) throw new Error(`Không thể lưu món ${item.name}`);

  await AppDataSource.query(`DELETE FROM menu_item_variants WHERE menu_item_id = $1`, [savedId]);
  for (const [displayOrder, variant] of (item.variants ?? []).entries()) {
    await AppDataSource.query(
      `INSERT INTO menu_item_variants (menu_item_id, name, price, display_order, is_available)
       VALUES ($1, $2, $3, $4, $5)`,
      [savedId, variant.name, variant.price, displayOrder, variant.isAvailable ?? true],
    );
  }
  return { id: savedId };
}

async function upsertCombo(cafeId: string, categoryId: string, combo: ComboSeed): Promise<void> {
  const [existing] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM menu_items WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1`,
    [cafeId, combo.name],
  );
  let savedId = existing?.id;
  if (savedId) {
    await AppDataSource.query(
      `UPDATE menu_items
          SET description = $1, price = $2, category_id = $3, image_url = $4,
              is_available = TRUE, is_combo = TRUE, updated_at = NOW()
        WHERE id = $5`,
      [combo.description, combo.price, categoryId, stockImageFor(combo.imageUrl), savedId],
    );
  } else {
    await AppDataSource.query(
      `INSERT INTO menu_items
         (cafe_id, name, description, price, category_id, image_url, is_available, is_combo)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)`,
      [
        cafeId,
        combo.name,
        combo.description,
        combo.price,
        categoryId,
        stockImageFor(combo.imageUrl),
      ],
    );
    const [created] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM menu_items WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [cafeId, combo.name],
    );
    savedId = created?.id;
  }
  if (!savedId) throw new Error(`Không thể lưu combo ${combo.name}`);

  await AppDataSource.query(`DELETE FROM menu_item_components WHERE combo_id = $1`, [savedId]);
  for (const component of combo.components) {
    const [item] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM menu_items
        WHERE cafe_id = $1 AND name = $2 AND deleted_at IS NULL AND is_combo = FALSE`,
      [cafeId, component.itemName],
    );
    if (!item) throw new Error(`Không tìm thấy món ${component.itemName} cho ${combo.name}`);
    const [variant] = component.variantName
      ? await AppDataSource.query<{ id: string }[]>(
          `SELECT id FROM menu_item_variants WHERE menu_item_id = $1 AND name = $2`,
          [item.id, component.variantName],
        )
      : [null];
    if (component.variantName && !variant) {
      throw new Error(`Không tìm thấy lựa chọn ${component.variantName} của ${component.itemName}`);
    }
    await AppDataSource.query(
      `INSERT INTO menu_item_components (combo_id, item_id, variant_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [savedId, item.id, variant?.id ?? null, component.quantity],
    );
  }
}

async function seedMenuForCafe(slug: string): Promise<void> {
  const [cafe] = await AppDataSource.query<{ id: string; name: string }[]>(
    `SELECT id, name FROM cafes WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  if (!cafe) {
    logger.warn('SeedMenu', `Skip ${slug} - cafe not found`);
    return;
  }

  const drink = await ensureCategory(cafe.id, 'Đồ uống', 0);
  const snack = await ensureCategory(cafe.id, 'Đồ ăn nhẹ', 1);
  const comboCategory = await ensureCategory(cafe.id, 'Combo tiết kiệm', 2);
  for (const item of menuSeeds[slug] ?? []) {
    await upsertMenuItem(cafe.id, item.category === 'Đồ uống' ? drink.id : snack.id, item);
  }
  for (const combo of comboSeeds[slug] ?? []) {
    await upsertCombo(cafe.id, comboCategory.id, combo);
  }
  logger.info(
    'SeedMenu',
    `${cafe.name}: synced ${(menuSeeds[slug] ?? []).length} món và ${(comboSeeds[slug] ?? []).length} combo`,
  );
}

async function ensureSeedProviderIsActive(): Promise<void> {
  const [provider] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM users WHERE email = 'provider@gmail.com' AND deleted_at IS NULL`,
  );
  if (!provider) return;

  const [profile] = await AppDataSource.query<{ user_id: string }[]>(
    `SELECT user_id FROM provider_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [provider.id],
  );
  if (profile) {
    await AppDataSource.query(
      `UPDATE provider_profiles SET registration_status = 'ACTIVE', updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [provider.id],
    );
  } else {
    await AppDataSource.query(
      `INSERT INTO provider_profiles (user_id, business_name, registration_status)
       VALUES ($1, $2, 'ACTIVE')`,
      [provider.id, 'RCField Seed Provider'],
    );
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await ensureSeedProviderIsActive();
  for (const slug of Object.keys(menuSeeds)) await seedMenuForCafe(slug);
  await AppDataSource.destroy();
  logger.info('SeedMenu', 'Done');
}

main().catch(async (err) => {
  logger.error('SeedMenu', 'Failed', err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
