export const RENTAL_INSPECTION_MIN_PHOTOS = 4;
export const RENTAL_INSPECTION_MAX_PHOTOS = 6;

/**
 * Biên bản nhận/trả xe của cơ sở cần đủ ảnh để đối chiếu tình trạng xe.
 * Ảnh xe tự mang được quản lý theo từng người chơi nên không dùng quy tắc này.
 */
export function hasValidRentalInspectionPhotoCount(photos: unknown): boolean {
  return (
    Array.isArray(photos) &&
    photos.length >= RENTAL_INSPECTION_MIN_PHOTOS &&
    photos.length <= RENTAL_INSPECTION_MAX_PHOTOS
  );
}
