/**
 * Dựng URL ảnh Cloudinary đã cắt và nén sẵn theo đúng khung sẽ hiển thị.
 *
 * Backend lưu ảnh gốc nguyên vẹn (`cloudinary.service.ts` upload không kèm
 * transformation nào). Mỗi màn hình có một khung khác nhau, nên thay vì ép một
 * kích thước lúc upload, ta để từng chỗ tự yêu cầu bản cắt của mình ngay trên
 * URL. Ảnh gốc chỉ cần đủ lớn và nằm ngang.
 *
 * Giải quyết hai triệu chứng:
 * - **Mờ**: `w_` trả đúng số pixel cần, `dpr` nhân đôi cho màn retina, `f_auto`
 *   đổi sang WebP/AVIF nếu trình duyệt hỗ trợ.
 * - **Cắt mất chủ thể**: `g_auto` để Cloudinary tự tìm vùng đáng chú ý thay vì
 *   cắt cứng vào giữa như `object-cover` của CSS.
 */

type CloudinaryOptions = {
  /** Chiều rộng hiển thị theo CSS pixel. Hàm tự nhân cho `dpr`. */
  width: number
  /** Tỉ lệ khung, ví dụ "16:9" hoặc "1:1". Bỏ trống thì giữ tỉ lệ gốc. */
  aspectRatio?: string
  /** Nhân cho màn hình mật độ cao. Mặc định 2. */
  dpr?: number
}

const CLOUDINARY_HOST = "res.cloudinary.com"
const UPLOAD_MARKER = "/upload/"

/** Cloudinary chèn `v<digits>` ngay sau /upload/ khi URL chưa có transformation. */
const VERSION_SEGMENT = /^v\d+$/

export function cloudinaryImage(
  url: string | null | undefined,
  { width, aspectRatio, dpr = 2 }: CloudinaryOptions,
): string | null {
  if (!url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // Không phải URL tuyệt đối (ảnh local, data URI…) — trả nguyên trạng.
    return url
  }

  // Provider có thể dán URL ảnh từ bất kỳ đâu vào ô banner, không riêng ảnh
  // upload qua hệ thống. Những URL đó không transform được, để nguyên.
  if (parsed.hostname !== CLOUDINARY_HOST) return url

  const uploadIndex = parsed.pathname.indexOf(UPLOAD_MARKER)
  if (uploadIndex < 0) return url

  const prefix = parsed.pathname.slice(0, uploadIndex + UPLOAD_MARKER.length)
  const rest = parsed.pathname.slice(uploadIndex + UPLOAD_MARKER.length)

  const segments = rest.split("/")
  // Nếu segment đầu không phải version thì URL đã mang transformation sẵn —
  // chèn thêm sẽ tạo chuỗi chained transformation khó đoán, nên bỏ qua.
  if (segments.length > 0 && segments[0] && !VERSION_SEGMENT.test(segments[0])) {
    return url
  }

  const transformation = [
    "f_auto",
    "q_auto",
    "c_fill",
    "g_auto",
    `w_${Math.round(width * dpr)}`,
    aspectRatio ? `ar_${aspectRatio.replace(":", ":")}` : null,
  ]
    .filter(Boolean)
    .join(",")

  parsed.pathname = `${prefix}${transformation}/${rest}`
  return parsed.toString()
}

/**
 * Tỉ lệ khung dùng lại được giữa các màn hình, để cùng một ảnh gốc cho ra bản
 * cắt nhất quán ở mọi nơi.
 */
export const IMAGE_RATIO = {
  /** Dải carousel ở trang khám phá — khung ngang dẹt. */
  rail: "5:2",
  /** Thẻ giải trong danh sách. */
  card: "16:9",
  /** Ảnh nền lớn ở trang chi tiết giải. */
  hero: "3:1",
  /** Ảnh nhỏ cạnh tên giải. */
  thumb: "1:1",
} as const

/** Kích thước tối thiểu để ảnh không bị vỡ ở khung lớn nhất (hero 3:1). */
export const BANNER_MIN_WIDTH = 1200

/** Kích thước khuyến nghị khi upload banner giải đấu. */
export const BANNER_RECOMMENDED = { width: 1600, height: 900 } as const
