import { Type } from '@google/genai';
import { AppDataSource } from '../../config/database';

export const definition = {
  name: 'get_packages',
  description:
    'Lấy danh sách gói chơi / gói thẻ đang bán tại chi nhánh. Gọi khi khách hỏi về gói chơi, thẻ tháng, gói buổi, mua gói, giá gói.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: [],
  },
};

interface PackageRow {
  name: string;
  description: string | null;
  price: string;
  slot_count: number;
  valid_days: number;
  benefits: string[];
  applicable_play_modes: string[];
  is_popular: boolean;
}

export async function handler(cafeId: string): Promise<string> {
  const [rows, cafeRows] = await Promise.all([
    AppDataSource.query<PackageRow[]>(
      `SELECT name, description, price, slot_count, valid_days, benefits,
              applicable_play_modes, is_popular
       FROM packages
       WHERE cafe_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL
       ORDER BY price ASC`,
      [cafeId],
    ),
    AppDataSource.query<{ slot_fee_rate: string }[]>(
      `SELECT slot_fee_rate FROM cafes WHERE id = $1`,
      [cafeId],
    ),
  ]);

  if (!rows.length) {
    return JSON.stringify({ packages: [], message: 'Chi nhánh hiện chưa có gói chơi nào.' });
  }

  const singleSessionPrice = cafeRows[0] ? parseFloat(cafeRows[0].slot_fee_rate) : null;

  const packages = rows.map((r) => {
    const totalPrice = parseFloat(r.price);
    const pricePerSlot = totalPrice / r.slot_count;

    const item: Record<string, unknown> = {
      name: r.name,
      totalPrice: `${Math.round(totalPrice).toLocaleString('vi-VN')}đ`,
      slots: r.slot_count,
      pricePerSlot: `${Math.round(pricePerSlot).toLocaleString('vi-VN')}đ/buổi`,
      validDays: `${r.valid_days} ngày kể từ ngày kích hoạt`,
    };

    if (singleSessionPrice !== null && singleSessionPrice > pricePerSlot) {
      const savingsPerSlot = singleSessionPrice - pricePerSlot;
      const savingsPct = Math.round((savingsPerSlot / singleSessionPrice) * 100);
      item.savingsVsSingleSession = `Tiết kiệm ${Math.round(savingsPerSlot).toLocaleString('vi-VN')}đ/buổi (${savingsPct}% so với đặt lẻ)`;
    }

    if (r.description) item.description = r.description;
    if (r.benefits.length) item.benefits = r.benefits;
    if (r.applicable_play_modes.length) {
      const modeLabels: Record<string, string> = { RENTAL: 'thuê xe', BYOC: 'mang xe riêng' };
      item.applicableModes = r.applicable_play_modes.map((m) => modeLabels[m] ?? m).join(', ');
    }
    if (r.is_popular) item.popular = true;
    return item;
  });

  const context: Record<string, unknown> = { packages };
  if (singleSessionPrice !== null) {
    context.singleSessionPrice = `${Math.round(singleSessionPrice).toLocaleString('vi-VN')}đ/buổi (đặt lẻ)`;
    context.hint =
      'Dùng pricePerSlot và savingsVsSingleSession để tư vấn gói phù hợp với tần suất chơi của khách.';
  }
  return JSON.stringify(context);
}
