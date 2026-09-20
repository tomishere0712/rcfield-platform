/** Tiện ích dùng chung cho các tool của trợ lý AI: giờ Việt Nam và định dạng tiền. */

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayInVn(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Giờ:phút theo giờ Việt Nam của một mốc thời gian. */
export function toVnTimeString(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(11, 16);
}

/** Tiền Việt cho model đọc: 60000 → "60.000đ". Làm tròn vì không ai báo giá lẻ đồng. */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}
