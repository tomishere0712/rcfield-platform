import { Type } from '@google/genai';
import { AppDataSource } from '../../config/database';

export const definition = {
  name: 'get_menu',
  description:
    'Lấy thực đơn F&B tại chi nhánh. Gọi khi khách hỏi về đồ ăn, thức uống, menu, đồ uống có gì, giá đồ ăn bao nhiêu.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: [],
  },
};

interface MenuRow {
  name: string;
  description: string | null;
  price: string;
  category: string | null;
  is_available: boolean;
}

export async function handler(cafeId: string): Promise<string> {
  // Danh mục do Provider tự đặt tên — lấy tên thật thay vì mã enum cũ.
  // Món chưa gán danh mục xếp cuối (NULLS LAST) và gom vào nhóm "Chưa phân loại".
  const rows = await AppDataSource.query<MenuRow[]>(
    `SELECT mi.name, mi.description, mi.price, mc.name AS category, mi.is_available
     FROM menu_items mi
     LEFT JOIN menu_categories mc
       ON mc.id = mi.category_id AND mc.deleted_at IS NULL
     WHERE mi.cafe_id = $1 AND mi.deleted_at IS NULL
     ORDER BY mc.display_order ASC NULLS LAST, mc.created_at ASC NULLS LAST, mi.price ASC`,
    [cafeId],
  );

  if (!rows.length) {
    return JSON.stringify({ menu: [], message: 'Chi nhánh chưa cập nhật thực đơn.' });
  }

  // Group by category
  const grouped: Record<string, unknown[]> = {};
  for (const r of rows) {
    const cat = r.category ?? 'Chưa phân loại';
    if (!grouped[cat]) grouped[cat] = [];
    const item: Record<string, unknown> = {
      name: r.name,
      price: `${Math.round(parseFloat(r.price)).toLocaleString('vi-VN')}đ`,
    };
    if (r.description) item.description = r.description;
    if (!r.is_available) item.note = 'Tạm hết';
    grouped[cat].push(item);
  }

  return JSON.stringify({ menu: grouped });
}
