import { describe, expect, it } from "vitest"
import { buildWsUrl } from "./useWebSocket"

/**
 * Sự cố production: WebSocket không bao giờ kết nối được, trong khi máy lập
 * trình chạy tốt.
 *
 * Nguyên nhân là cắt chuỗi bằng biểu thức `apiUrl.replace(/\/api.*$/, "")`.
 * Trên máy lập trình, chuỗi `/api` đầu tiên là phần đường dẫn nên cắt đúng.
 * Trên production, tên miền là `api.rcfield.site` — chuỗi `/api` đầu tiên nằm
 * ngay trong `//api.rcfield.site`, nên nó cắt luôn cả tên miền và địa chỉ trở
 * thành `wss://ws?token=…`, tức là nối tới một máy chủ tên là "ws".
 */
const TOKEN = "abc.def"

describe("buildWsUrl", () => {
  it("giữ nguyên tên miền khi tên miền bắt đầu bằng api.", () => {
    expect(buildWsUrl("https://api.rcfield.site/api/v1", TOKEN)).toBe(
      `wss://api.rcfield.site/ws?token=${TOKEN}`,
    )
  })

  it("vẫn đúng khi địa chỉ không có phần đường dẫn", () => {
    expect(buildWsUrl("https://api.rcfield.site", TOKEN)).toBe(
      `wss://api.rcfield.site/ws?token=${TOKEN}`,
    )
  })

  it("https dùng wss, http dùng ws", () => {
    expect(buildWsUrl("http://localhost:3000/api/v1", TOKEN)).toBe(
      `ws://localhost:3000/ws?token=${TOKEN}`,
    )
  })

  it("giữ nguyên cổng của máy chủ", () => {
    expect(buildWsUrl("http://localhost:3000/api", TOKEN)).toContain(
      "localhost:3000",
    )
  })

  it("địa chỉ tương đối thì lấy nguồn của trang đang mở", () => {
    expect(buildWsUrl("/api/v1", TOKEN, "https://app.rcfield.site")).toBe(
      `wss://app.rcfield.site/ws?token=${TOKEN}`,
    )
  })

  it("mã thông hành có ký tự đặc biệt thì phải được mã hoá", () => {
    const url = buildWsUrl("https://api.rcfield.site/api/v1", "a+b/c=")
    expect(url).toContain("token=a%2Bb%2Fc%3D")
  })

  it("chưa đăng nhập thì không dựng địa chỉ", () => {
    expect(buildWsUrl("https://api.rcfield.site/api/v1", null)).toBeNull()
  })

  it("địa chỉ rác thì trả null thay vì ném lỗi", () => {
    expect(buildWsUrl("khong-phai-dia-chi", TOKEN, "")).toBeNull()
  })
})
