import { Type } from '@google/genai';
import { AppDataSource } from '../../config/database';
import { formatVnd } from './money';

export const definition = {
  name: 'get_vehicles',
  description:
    'Lấy danh sách loại xe RC cho thuê tại chi nhánh. Gọi khi khách hỏi có xe gì, xe nào phù hợp người mới, giá thuê xe bao nhiêu, xe loại nào.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: [],
  },
};

interface VehicleRow {
  name: string;
  description: string | null;
  tier: string;
  hourly_rate: string;
  security_deposit: string;
  available_count: string;
}

const TIER_LABEL: Record<string, string> = {
  STANDARD: 'Tiêu chuẩn',
  PREMIUM: 'Cao cấp',
  RESTRICTED: 'Giới hạn (cần kinh nghiệm)',
};

export async function handler(cafeId: string): Promise<string> {
  const rows = await AppDataSource.query<VehicleRow[]>(
    `SELECT vc.name, vc.description, vc.tier,
            vc.hourly_rate, vc.security_deposit,
            COUNT(v.id) FILTER (WHERE v.status = 'AVAILABLE') AS available_count
     FROM vehicle_catalogs vc
     LEFT JOIN vehicles v ON v.catalog_id = vc.id AND v.deleted_at IS NULL
     WHERE vc.cafe_id = $1 AND vc.deleted_at IS NULL
     GROUP BY vc.id, vc.name, vc.description, vc.tier, vc.hourly_rate, vc.security_deposit
     ORDER BY
       CASE vc.tier WHEN 'STANDARD' THEN 1 WHEN 'PREMIUM' THEN 2 ELSE 3 END,
       vc.hourly_rate ASC`,
    [cafeId],
  );

  if (!rows.length) {
    return JSON.stringify({ vehicles: [], message: 'Chi nhánh chưa có xe RC nào trong fleet.' });
  }

  const vehicles = rows.map((r) => {
    const available = parseInt(r.available_count, 10);
    const item: Record<string, unknown> = {
      name: r.name,
      tier: TIER_LABEL[r.tier] ?? r.tier,
      // Phí thuê xe tính theo giờ: rental_fee = hourly_rate × (số phút chơi / 60)
      hourlyRate: `${formatVnd(parseFloat(r.hourly_rate))}/giờ`,
      securityDeposit: 'Không yêu cầu cọc',
      available: available > 0 ? `${available} xe sẵn sàng` : 'Hết xe hiện tại',
    };
    if (r.description) item.description = r.description;
    return item;
  });

  return JSON.stringify({
    vehicles,
    note:
      'Đây là phí THUÊ XE, chưa bao gồm phí sân — hai khoản này cộng thêm với nhau. ' +
      'Khách thuê xe của quán trả: phí sân + phí thuê xe. Khách mang xe riêng (BYOC) chỉ trả phí sân. ' +
      'Dùng get_pricing để tra phí sân rồi cộng lại khi báo tổng cho khách.',
  });
}
