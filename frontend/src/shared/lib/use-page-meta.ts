import { useEffect } from "react"

/**
 * Đặt tiêu đề, mô tả và thẻ chia sẻ theo từng trang.
 *
 * ── Vì sao tự viết thay vì thêm thư viện ─────────────────────────────────────
 * Việc cần làm chỉ là ghi vài thẻ vào `<head>` và dọn lại khi rời trang. Kéo
 * `react-helmet-async` về đổi lại một provider bọc toàn ứng dụng và thêm một
 * phụ thuộc phải bảo trì, cho khoảng năm mươi dòng này.
 *
 * ── Giới hạn cần biết ────────────────────────────────────────────────────────
 * Đây là SPA: các thẻ dưới đây chỉ xuất hiện SAU khi JavaScript chạy. Google có
 * chạy JavaScript nên vẫn đọc được, nhưng chậm hơn và kém chắc chắn hơn thẻ nằm
 * sẵn trong HTML.
 *
 * Quan trọng hơn: **trình thu thập của Zalo và Facebook không chạy JavaScript**.
 * Dán link một cơ sở lên Zalo vẫn ra tiêu đề mặc định trong `index.html`, không
 * ra tên cơ sở đó. Muốn sửa triệt để thì phải dựng sẵn HTML cho các trang công
 * khai — xem ghi chú ở cuối `docs/developer/seo.md`.
 */

export interface PageMeta {
  title: string
  description?: string
  /** Ảnh hiện khi chia sẻ link. Bỏ trống thì dùng ảnh mặc định của trang chủ. */
  image?: string
  /** Đường dẫn chuẩn, dạng tuyệt đối. Bỏ trống thì lấy URL hiện tại. */
  canonical?: string
}

const SITE_NAME = "RCField"

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement("meta")
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute("content", content)
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement("link")
    el.rel = "canonical"
    document.head.appendChild(el)
  }
  el.href = href
}

export function usePageMeta(meta: PageMeta | null) {
  const { title, description, image, canonical } = meta ?? {}

  useEffect(() => {
    if (!title) return

    const previousTitle = document.title
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`
    document.title = fullTitle

    upsertMeta('meta[property="og:title"]', "property", "og:title", fullTitle)
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle)

    if (description) {
      upsertMeta('meta[name="description"]', "name", "description", description)
      upsertMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        description,
      )
      upsertMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        description,
      )
    }

    if (image) {
      upsertMeta('meta[property="og:image"]', "property", "og:image", image)
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image)
    }

    const url = canonical ?? window.location.href.split("?")[0]
    upsertCanonical(url)
    upsertMeta('meta[property="og:url"]', "property", "og:url", url)

    // Chỉ khôi phục tiêu đề. Các thẻ mô tả để nguyên cho trang sau ghi đè: xoá
    // đi sẽ có một nhịp trang không có mô tả nào, đúng lúc bot có thể đang đọc.
    return () => {
      document.title = previousTitle
    }
  }, [title, description, image, canonical])
}
