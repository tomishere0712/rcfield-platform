import { Type } from '@google/genai';
import { AppDataSource } from '../../config/database';

export const definition = {
  name: 'get_promotions',
  description:
    'Lấy danh sách chương trình khuyến mãi / ưu đãi đang hoạt động tại chi nhánh. Gọi khi khách hỏi về khuyến mãi, giảm giá, ưu đãi, mã giảm giá, có deal gì không.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: [],
  },
};

interface PromotionRow {
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: string;
  max_discount_amount: string | null;
  min_order_amount: string | null;
  expires_at: Date | null;
  schedule_mode: string;
  schedule_weekdays: string[];
}

function formatDiscount(row: PromotionRow): string {
  const value = parseFloat(row.discount_value);
  if (row.discount_type === 'PERCENTAGE') {
    const cap = row.max_discount_amount
      ? `, tối đa ${Math.round(parseFloat(row.max_discount_amount)).toLocaleString('vi-VN')}đ`
      : '';
    return `Giảm ${value}%${cap}`;
  }
  return `Giảm ${Math.round(value).toLocaleString('vi-VN')}đ`;
}

export async function handler(cafeId: string): Promise<string> {
  const rows = await AppDataSource.query<PromotionRow[]>(
    `SELECT code, description, discount_type, discount_value, max_discount_amount,
            min_order_amount, expires_at, schedule_mode, schedule_weekdays
     FROM promotions
     WHERE cafe_id = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [cafeId],
  );

  if (!rows.length) {
    return JSON.stringify({
      promotions: [],
      message: 'Hiện tại chi nhánh chưa có khuyến mãi nào.',
    });
  }

  const promotions = rows.map((r) => {
    const item: Record<string, unknown> = {
      code: r.code,
      discount: formatDiscount(r),
    };
    if (r.description) item.description = r.description;
    if (r.min_order_amount) {
      item.minOrderAmount = `Đơn tối thiểu ${Math.round(parseFloat(r.min_order_amount)).toLocaleString('vi-VN')}đ`;
    }
    if (r.expires_at) {
      const d = new Date(r.expires_at);
      item.expiresAt = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }
    if (r.schedule_mode !== 'ONCE' && r.schedule_weekdays.length) {
      item.applicableDays = r.schedule_weekdays.join(', ');
    }
    return item;
  });

  return JSON.stringify({ promotions });
}
