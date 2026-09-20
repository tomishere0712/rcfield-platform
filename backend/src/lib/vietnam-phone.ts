/**
 * Số điện thoại Việt Nam.
 *
 * Trước đây mỗi schema tự viết lại regex `^(84|0[3|5|7|8|9])([0-9]{8})$`, và bản
 * đó thủng hai chỗ: dấu `|` nằm trong lớp ký tự nên được hiểu là một ký tự thường
 * (chuỗi "0|12345678" lọt qua), còn nhánh `84` thì bỏ luôn phần kiểm đầu số và
 * thiếu một chữ số. Gom về một chỗ để sửa một lần là xong.
 */

/** Đầu số di động đang lưu hành: 03, 05, 07, 08, 09 — tổng 10 chữ số. */
const MOBILE = /^0(3|5|7|8|9)\d{8}$/;

/** Số cố định: mã vùng 02x rồi 8 chữ số, ví dụ 028 6262 7788. */
const LANDLINE = /^02\d{9}$/;

/**
 * Đưa về dạng chuẩn bắt đầu bằng 0: bỏ khoảng trắng, chấm, gạch, ngoặc mà người
 * dùng hay gõ, và quy tiền tố quốc tế +84 / 84 về 0.
 */
export function normalizeVietnamPhone(raw: string): string {
  const cleaned = (raw ?? '').replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) return `0${cleaned.slice(3)}`;
  // Chỉ coi là mã quốc gia khi phần còn lại đủ dài cho một số nội địa; số bắt
  // đầu bằng 084… của người dùng thì giữ nguyên.
  if (cleaned.startsWith('84') && cleaned.length >= 11) return `0${cleaned.slice(2)}`;
  return cleaned;
}

/** Số di động — dùng cho mọi số liên lạc cá nhân. */
export function isVietnamMobile(raw: string): boolean {
  return MOBILE.test(normalizeVietnamPhone(raw));
}

/** Di động hoặc cố định — dùng cho số liên lạc của chi nhánh. */
export function isVietnamPhone(raw: string): boolean {
  const value = normalizeVietnamPhone(raw);
  return MOBILE.test(value) || LANDLINE.test(value);
}
