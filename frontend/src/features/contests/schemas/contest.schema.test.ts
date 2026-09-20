import { describe, expect, it } from "vitest"
import { contestGenerateMatchesSchema } from "./contest.schema"

const CAFE_ID = "061452e9-bf07-42a6-bb80-3be587f0b53c"
const REGISTRATION_ID = "6a07dd3b-7e2c-4ab9-a11a-8896c32d03e9"

describe("contestGenerateMatchesSchema", () => {
  // Bốc thăm đấu loại chỉ gửi chi nhánh: không chọn người, không chọn cách xếp
  // thứ tự. Bắt buộc các trường đó là tự chặn chính mình ngay ở client, backend
  // chưa kịp nhận request.
  it("nhận payload bốc thăm chỉ có chi nhánh", () => {
    const result = contestGenerateMatchesSchema.safeParse({ cafe_id: CAFE_ID })
    expect(result.success).toBe(true)
  })

  it("vẫn nhận payload đầy đủ của các thể thức xếp lượt tại chỗ", () => {
    const result = contestGenerateMatchesSchema.safeParse({
      cafe_id: CAFE_ID,
      registration_ids: [REGISTRATION_ID],
      drivers_per_match: 4,
      seeding_mode: "CHECK_IN_ORDER",
    })
    expect(result.success).toBe(true)
  })

  it("vẫn chặn chi nhánh không hợp lệ", () => {
    const result = contestGenerateMatchesSchema.safeParse({
      cafe_id: "khong-phai-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("vẫn chặn cách xếp thứ tự lạ khi có gửi", () => {
    const result = contestGenerateMatchesSchema.safeParse({
      cafe_id: CAFE_ID,
      seeding_mode: "RANDOM",
    })
    expect(result.success).toBe(false)
  })
})

describe("thông báo lỗi cho người dùng", () => {
  // Locale tiếng Việt bật trong `src/test/setup.ts`, giống hệt `main.tsx`.
  it("không để lọt câu tiếng Anh mặc định của zod", () => {
    const result = contestGenerateMatchesSchema.safeParse({
      cafe_id: CAFE_ID,
      seeding_mode: "RANDOM",
    })
    expect(result.success).toBe(false)
    const message = result.error?.issues[0]?.message ?? ""
    expect(message).not.toMatch(/invalid|expected|required/i)
  })

  it("báo chi nhánh sai bằng tiếng Việt", () => {
    const result = contestGenerateMatchesSchema.safeParse({
      cafe_id: "khong-phai-uuid",
    })
    expect(result.error?.issues[0]?.message).toBe(
      "Chi nhánh vận hành không hợp lệ",
    )
  })
})
