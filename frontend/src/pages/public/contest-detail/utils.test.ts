import { describe, expect, it } from "vitest"

import { formatPrizeReward } from "./utils"

describe("formatPrizeReward", () => {
  it("thêm dấu chấm ngăn cho phần thưởng là tiền", () => {
    // Ban tổ chức gõ số trần; trang công khai phải đọc được ngay là bao nhiêu.
    expect(formatPrizeReward("10000000")).toContain("10.000.000")
    expect(formatPrizeReward("500000")).toContain("500.000")
    expect(formatPrizeReward("200000")).toContain("200.000")
  })

  it("chuẩn hoá cả khi người nhập đã tự ngăn theo kiểu khác", () => {
    expect(formatPrizeReward("10.000.000")).toContain("10.000.000")
    expect(formatPrizeReward("10,000,000")).toContain("10.000.000")
    expect(formatPrizeReward(" 10 000 000 ")).toContain("10.000.000")
  })

  it("giữ nguyên phần thưởng là hiện vật", () => {
    expect(formatPrizeReward("Cúp vàng + voucher 2 giờ chơi")).toBe(
      "Cúp vàng + voucher 2 giờ chơi",
    )
    expect(formatPrizeReward("Bộ bánh xe Yokomo")).toBe("Bộ bánh xe Yokomo")
    // Có số nhưng không THUẦN số — không được đụng vào.
    expect(formatPrizeReward("2 vé xem giải quốc tế")).toBe(
      "2 vé xem giải quốc tế",
    )
  })

  it("không biến số nhỏ thành tiền", () => {
    // "3" nhiều khả năng là số lượng, không phải ba đồng.
    expect(formatPrizeReward("3")).toBe("3")
    expect(formatPrizeReward("500")).toBe("500")
  })

  it("giữ nguyên chuỗi rỗng và khoảng trắng thừa được cắt", () => {
    expect(formatPrizeReward("")).toBe("")
    expect(formatPrizeReward("  Cúp bạc  ")).toBe("Cúp bạc")
  })
})
