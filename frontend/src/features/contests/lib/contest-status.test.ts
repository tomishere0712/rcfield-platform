import { describe, expect, it } from "vitest"
import {
  getContestCheckInAvailability,
  getContestDrawAvailability,
  getContestEditAvailability,
  getContestPublishAvailability,
  getLeaderboardModeLabel,
  getContestRegistrationAvailability,
  getEffectiveContestStatus,
  getRegistrationAvailabilityLabel,
} from "./contest-status"

const baseContest = {
  status: "OPEN" as const,
  registration_opens_at: "2026-07-17T01:00:00.000Z",
  registration_closes_at: "2026-07-17T02:00:00.000Z",
  starts_at: "2026-07-17T03:00:00.000Z",
  ends_at: "2026-07-17T04:00:00.000Z",
}

describe("getEffectiveContestStatus", () => {
  it("keeps draft and cancelled as explicit backend states", () => {
    expect(
      getEffectiveContestStatus(
        { ...baseContest, status: "DRAFT" },
        new Date("2026-07-17T03:30:00.000Z"),
      ),
    ).toBe("DRAFT")
    expect(
      getEffectiveContestStatus(
        { ...baseContest, status: "CANCELLED" },
        new Date("2026-07-17T03:30:00.000Z"),
      ),
    ).toBe("CANCELLED")
  })

  it("derives the registration and contest lifecycle from timestamps", () => {
    expect(
      getEffectiveContestStatus(
        baseContest,
        new Date("2026-07-17T00:30:00.000Z"),
      ),
    ).toBe("OPEN")
    expect(
      getEffectiveContestStatus(
        baseContest,
        new Date("2026-07-17T01:30:00.000Z"),
      ),
    ).toBe("OPEN")
    expect(
      getEffectiveContestStatus(
        baseContest,
        new Date("2026-07-17T02:30:00.000Z"),
      ),
    ).toBe("CLOSED")
    expect(
      getEffectiveContestStatus(
        baseContest,
        new Date("2026-07-17T03:30:00.000Z"),
      ),
    ).toBe("RUNNING")
    expect(
      getEffectiveContestStatus(
        baseContest,
        new Date("2026-07-17T04:30:00.000Z"),
      ),
    ).toBe("COMPLETED")
  })
})

describe("getContestRegistrationAvailability", () => {
  it("blocks registration before the registration window opens", () => {
    expect(
      getContestRegistrationAvailability(
        baseContest,
        new Date("2026-07-17T00:30:00.000Z"),
      ),
    ).toBe("NOT_OPEN_YET")
    expect(getRegistrationAvailabilityLabel("NOT_OPEN_YET")).toBe(
      "Sắp mở đăng ký",
    )
  })

  it("allows registration only inside the registration window", () => {
    expect(
      getContestRegistrationAvailability(
        baseContest,
        new Date("2026-07-17T01:30:00.000Z"),
      ),
    ).toBe("AVAILABLE")
    expect(
      getContestRegistrationAvailability(
        baseContest,
        new Date("2026-07-17T02:30:00.000Z"),
      ),
    ).toBe("CLOSED")
  })
})

describe("getContestCheckInAvailability", () => {
  // Bám đúng các điều kiện backend áp trong checkInRegistration; lệch một cái là
  // nhân viên bấm được nút rồi ăn lỗi 400 giữa ca trực.
  const race = {
    starts_at: "2026-08-11T01:00:00.000Z",
    ends_at: "2026-08-11T04:00:00.000Z",
  }

  it("chặn khi giải còn đang mở đăng ký", () => {
    const result = getContestCheckInAvailability(
      { ...race, status: "OPEN" },
      new Date("2026-08-11T02:00:00.000Z"),
    )
    expect(result.canCheckIn).toBe(false)
    expect(result).toMatchObject({
      reason: "Còn đang mở đăng ký — đóng đăng ký rồi mới điểm danh được",
    })
  })

  it("chặn khi chưa tới giờ thi đấu", () => {
    const result = getContestCheckInAvailability(
      { ...race, status: "CLOSED" },
      new Date("2026-08-11T00:30:00.000Z"),
    )
    expect(result).toMatchObject({
      canCheckIn: false,
      reason: "Chưa tới giờ thi đấu",
    })
  })

  it("chặn khi giải đã kết thúc", () => {
    const result = getContestCheckInAvailability(
      { ...race, status: "RUNNING" },
      new Date("2026-08-11T05:00:00.000Z"),
    )
    expect(result).toMatchObject({
      canCheckIn: false,
      reason: "Giải đã kết thúc",
    })
  })

  it("cho điểm danh trong khung giờ thi đấu", () => {
    expect(
      getContestCheckInAvailability(
        { ...race, status: "CLOSED" },
        new Date("2026-08-11T02:00:00.000Z"),
      ),
    ).toEqual({ canCheckIn: true })
    expect(
      getContestCheckInAvailability(
        { ...race, status: "RUNNING" },
        new Date("2026-08-11T03:59:00.000Z"),
      ),
    ).toEqual({ canCheckIn: true })
  })
})

describe("getContestEditAvailability", () => {
  it("cho sửa khi còn bản nháp", () => {
    expect(getContestEditAvailability({ status: "DRAFT" })).toEqual({
      allowed: true,
    })
  })

  it("mở đăng ký mà chưa ai đăng ký thì vẫn sửa được", () => {
    // Khoảng thời gian chủ sân bấm mở xong mới thấy sai giờ hay sai chính tả.
    expect(
      getContestEditAvailability({
        status: "OPEN",
        public_stats: {
          registration_count: 0,
          confirmed_count: 0,
          checked_in_count: 0,
          entry_fee_paid_count: 0,
          capacity_remaining: 8,
        },
      }),
    ).toEqual({ allowed: true })
  })

  it("có người đăng ký rồi thì chốt — mỗi trường là một cam kết đã đưa ra", () => {
    expect(
      getContestEditAvailability({
        status: "OPEN",
        public_stats: {
          registration_count: 3,
          confirmed_count: 3,
          checked_in_count: 0,
          entry_fee_paid_count: 0,
          capacity_remaining: 5,
        },
      }),
    ).toMatchObject({
      allowed: false,
      reason:
        "Đã có 3 người đăng ký — thông tin giải là cam kết với họ, không sửa được nữa",
    })
  })

  it("chặn sau khi đóng đăng ký vì khách đã sắp lịch theo thông tin cũ", () => {
    expect(getContestEditAvailability({ status: "CLOSED" })).toMatchObject({
      allowed: false,
      reason: "Đã đóng đăng ký — không sửa được thông tin giải nữa",
    })
    expect(getContestEditAvailability({ status: "COMPLETED" })).toMatchObject({
      allowed: false,
      reason: "Giải đã kết thúc — không sửa được nữa",
    })
  })
})

describe("getContestDrawAvailability", () => {
  const drawable = { eligibleCount: 6, hasPlayedMatch: false }

  it("cho bốc thăm khi giải đã mở và đủ người", () => {
    expect(getContestDrawAvailability({ status: "OPEN" }, drawable)).toEqual({
      allowed: true,
    })
    expect(getContestDrawAvailability({ status: "CLOSED" }, drawable)).toEqual({
      allowed: true,
    })
  })

  it("chặn khi giải còn là bản nháp", () => {
    expect(
      getContestDrawAvailability({ status: "DRAFT" }, drawable),
    ).toMatchObject({
      allowed: false,
      reason: "Giải còn là bản nháp — mở đăng ký trước đã",
    })
  })

  it("chặn bốc lại khi đã có trận thi đấu", () => {
    expect(
      getContestDrawAvailability(
        { status: "RUNNING" },
        { ...drawable, hasPlayedMatch: true },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "Đã có trận thi đấu — không bốc thăm lại được nữa",
    })
  })

  it("chặn khi chưa đủ 2 người được duyệt", () => {
    expect(
      getContestDrawAvailability(
        { status: "OPEN" },
        { ...drawable, eligibleCount: 1 },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "Cần ít nhất 2 người đã được duyệt để bốc thăm",
    })
  })
})

describe("getContestPublishAvailability", () => {
  const finished = { totalMatches: 7, unfinishedMatches: 0 }

  it("cho công bố khi mọi trận đã xong", () => {
    expect(
      getContestPublishAvailability({ status: "RUNNING" }, finished),
    ).toEqual({
      allowed: true,
    })
  })

  it("chặn khi còn đang mở đăng ký", () => {
    expect(
      getContestPublishAvailability(
        { status: "OPEN" },
        { totalMatches: 0, unfinishedMatches: 0 },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "Còn đang mở đăng ký — chưa có gì để công bố",
    })
  })

  it("chặn khi chưa bốc thăm", () => {
    expect(
      getContestPublishAvailability(
        { status: "CLOSED" },
        { totalMatches: 0, unfinishedMatches: 0 },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "Chưa bốc thăm nên chưa có trận nào",
    })
  })

  it("nói rõ còn bao nhiêu trận chưa có kết quả", () => {
    expect(
      getContestPublishAvailability(
        { status: "RUNNING" },
        { totalMatches: 7, unfinishedMatches: 3 },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "Còn 3 trận chưa có kết quả",
    })
  })

  it("chặn công bố lần hai khi giải đã hoàn thành", () => {
    expect(
      getContestPublishAvailability({ status: "COMPLETED" }, finished),
    ).toMatchObject({
      allowed: false,
      reason: "Bảng xếp hạng đã được công bố",
    })
  })
})

describe("getLeaderboardModeLabel", () => {
  it("dịch mọi chế độ sang tiếng Việt", () => {
    expect(getLeaderboardModeLabel("KNOCKOUT_BRACKET")).toBe(
      "Theo vòng bị loại",
    )
    expect(getLeaderboardModeLabel("TOTAL_TIME")).toBe("Theo tổng thời gian")
    expect(getLeaderboardModeLabel("BEST_LAP")).toBe(
      "Theo vòng chạy nhanh nhất",
    )
  })

  it("vẫn đọc được bảng đã công bố bằng mã cũ", () => {
    // Giải công bố trước khi đổi cách xếp hạng vẫn lưu mã KNOCKOUT_WINS.
    expect(getLeaderboardModeLabel("KNOCKOUT_WINS")).toBe("Theo vòng bị loại")
  })

  it("không in mã lạ ra màn hình", () => {
    expect(getLeaderboardModeLabel("SOMETHING_ELSE")).toBe("--")
    expect(getLeaderboardModeLabel(null)).toBe("--")
  })
})

describe("giải đã công bố kết quả", () => {
  // Giải xong sớm hơn lịch là chuyện thường: bấm công bố lúc 04/08 trong khi
  // hạn đăng ký ghi 09/08. Suy trạng thái từ đồng hồ sẽ kéo nó về "đang mở đăng
  // ký" và trang công khai mời khách vào một giải đã trao giải xong.
  const finished = {
    status: "COMPLETED" as const,
    registration_opens_at: "2026-08-02T10:00:00.000Z",
    registration_closes_at: "2026-08-09T10:00:00.000Z",
    starts_at: "2026-08-11T01:00:00.000Z",
    ends_at: "2026-08-11T04:00:00.000Z",
  }
  const beforeSchedule = new Date("2026-08-04T08:00:00.000Z")

  it("không bị đồng hồ kéo ngược về đang mở đăng ký", () => {
    expect(getEffectiveContestStatus(finished, beforeSchedule)).toBe(
      "COMPLETED",
    )
  })

  it("không cho đăng ký nữa", () => {
    expect(getContestRegistrationAvailability(finished, beforeSchedule)).toBe(
      "COMPLETED",
    )
  })

  it("giải đã đóng đăng ký hoặc đang thi cũng vậy", () => {
    expect(
      getContestRegistrationAvailability(
        { ...finished, status: "CLOSED" },
        beforeSchedule,
      ),
    ).toBe("CLOSED")
    expect(
      getContestRegistrationAvailability(
        { ...finished, status: "RUNNING" },
        beforeSchedule,
      ),
    ).toBe("RUNNING")
  })

  it("giải còn OPEN thì vẫn suy theo đồng hồ như cũ", () => {
    expect(
      getContestRegistrationAvailability(
        { ...finished, status: "OPEN" },
        beforeSchedule,
      ),
    ).toBe("AVAILABLE")
  })
})

describe("bỏ qua khung giờ điểm danh theo cờ của máy chủ", () => {
  /**
   * Cờ này PHẢI đến từ máy chủ, không phải từ biến build.
   *
   * Bản cũ đọc `import.meta.env.VITE_BYPASS_CONTEST_CHECKIN` — Vite nướng giá
   * trị đó vào bản build, nên bật cờ ở backend rồi khởi động lại là chưa đủ:
   * giao diện vẫn khoá nút, máy chủ đồng ý nhưng không ai bấm được. Đúng cái
   * bẫy đã xảy ra trên production.
   */
  const chuaToiGio = {
    status: "CLOSED" as const,
    starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
  }

  it("máy chủ bật cờ thì mở nút dù giải còn ba ngày nữa", () => {
    expect(
      getContestCheckInAvailability({ ...chuaToiGio, check_in_window_bypassed: true }),
    ).toEqual({ canCheckIn: true })
  })

  it("máy chủ bật cờ thì mở cả khi giải còn đang mở đăng ký", () => {
    expect(
      getContestCheckInAvailability({
        ...chuaToiGio,
        status: "OPEN",
        check_in_window_bypassed: true,
      }),
    ).toEqual({ canCheckIn: true })
  })

  it("cờ tắt thì khoá như cũ", () => {
    expect(
      getContestCheckInAvailability({ ...chuaToiGio, check_in_window_bypassed: false }),
    ).toMatchObject({ canCheckIn: false })
  })

  it("máy chủ cũ chưa trả trường này thì mặc định khoá, không tự mở", () => {
    expect(getContestCheckInAvailability(chuaToiGio)).toMatchObject({ canCheckIn: false })
  })
})
