import { describe, expect, it } from "vitest"

import { KB_POLL_INTERVAL_MS, kbRefetchInterval } from "./kb-polling"

/**
 * Tài liệu tri thức được xử lý ở phía sau, nên ngay sau khi tải lên nó ở
 * `PENDING`. Hai cách hỏng ngược nhau, và cả hai đều không thấy ngay:
 *
 *  · Không hỏi lại → màn hình treo ở "Đang xử lý" cho tới khi tự tải lại trang.
 *  · Hỏi mãi không dừng → mỗi tab đang mở gửi một lời gọi mỗi 5 giây, suốt cả
 *    ngày, cho một danh sách chẳng bao giờ đổi nữa.
 */
describe("kbRefetchInterval", () => {
  it("còn tài liệu đang xử lý thì hỏi lại", () => {
    expect(kbRefetchInterval([{ status: "PENDING" }])).toBe(KB_POLL_INTERVAL_MS)
    expect(kbRefetchInterval([{ status: "INDEXED" }, { status: "PENDING" }])).toBe(
      KB_POLL_INTERVAL_MS,
    )
  })

  it("xong hết thì DỪNG hẳn", () => {
    expect(kbRefetchInterval([{ status: "INDEXED" }])).toBe(false)
    expect(kbRefetchInterval([{ status: "INDEXED" }, { status: "FAILED" }])).toBe(false)
  })

  it("tài liệu lỗi không kéo dài việc hỏi lại — nó sẽ không tự đổi nữa", () => {
    expect(kbRefetchInterval([{ status: "FAILED" }])).toBe(false)
  })

  it("danh sách rỗng hoặc chưa tải xong thì không hỏi", () => {
    expect(kbRefetchInterval([])).toBe(false)
    expect(kbRefetchInterval(undefined)).toBe(false)
  })
})
