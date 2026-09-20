import { describe, expect, it } from "vitest"
import {
  applyStagedParticipants,
  getAuditEventLabel,
  formatDurationSeconds,
  getAuditGroup,
  getEligibleRuntimeRegistrations,
  getQualifyingStandings,
  getMatchParticipantName,
  groupMatchesByRound,
  findNextPendingMatchId,
} from "./contest-runtime"

describe("contest runtime helpers", () => {
  it("filters eligible registrations for runtime", () => {
    const registrations = [
      { id: "1", status: "PENDING" },
      { id: "2", status: "CONFIRMED" },
      { id: "3", status: "CHECKED_IN" },
    ] as const

    expect(
      getEligibleRuntimeRegistrations(registrations as never),
    ).toHaveLength(1)
  })

  it("groups matches by round number", () => {
    const matches = [
      { id: "a", round_no: 2 },
      { id: "b", round_no: 1 },
      { id: "c", round_no: 2 },
    ] as const

    const groups = groupMatchesByRound(matches as never)

    expect(groups).toEqual([
      { roundNo: 2, matches: [matches[0], matches[2]] },
      { roundNo: 1, matches: [matches[1]] },
    ])
  })

  it("maps audit event group by prefix", () => {
    expect(
      getAuditGroup({ eventType: "match.results_submitted" } as never),
    ).toBe("match")
    expect(
      getAuditGroup({ eventType: "registration.checked_in" } as never),
    ).toBe("registration")
    expect(
      getAuditGroup({ eventType: "contest.leaderboard_published" } as never),
    ).toBe("contest")
  })

  it("formats contest runtime durations in seconds", () => {
    expect(formatDurationSeconds(32.4567)).toBe("32.457s")
    expect(formatDurationSeconds(null)).toBe("--")
  })
})

describe("applyStagedParticipants", () => {
  const snapshot = {
    id: "reg-1",
    user_id: "user-1",
    participant_name: "Đỗ Khánh Linh",
    participant_email: "linh@rcfield.test",
    participant_avatar_url: null,
    status: "CONFIRMED" as const,
    check_in_code: "5794EDB6",
    checked_in_at: null,
    is_my_registration: false,
  }

  const sourceMatch = {
    id: "match-1",
    round_no: 1,
    match_no: 1,
    participants: [
      {
        id: "p-1",
        registration_id: "reg-1",
        slot_no: 1,
        registration: snapshot,
      },
    ],
  }
  const targetMatch = {
    id: "match-2",
    round_no: 2,
    match_no: 1,
    participants: [],
  }

  it("giữ tên người chơi khi kéo sang trận vòng sau", () => {
    const result = applyStagedParticipants(
      [sourceMatch, targetMatch] as never,
      { "match-2": [{ registration_id: "reg-1", slot_no: 1 }] } as never,
    )
    const moved = result[1].participants[0]
    expect(moved.registration?.participant_name).toBe("Đỗ Khánh Linh")
    expect(getMatchParticipantName(moved)).toBe("Đỗ Khánh Linh")
  })

  it("không đụng tới trận không có thay đổi", () => {
    const result = applyStagedParticipants(
      [sourceMatch, targetMatch] as never,
      { "match-2": [{ registration_id: "reg-1", slot_no: 1 }] } as never,
    )
    expect(result[0]).toBe(sourceMatch)
  })
})

describe("getAuditEventLabel", () => {
  it("dịch mã sự kiện sang tiếng Việt", () => {
    expect(getAuditEventLabel("match.results_submitted")).toBe(
      "Nhập kết quả trận",
    )
    expect(getAuditEventLabel("contest.bracket_drawn")).toBe(
      "Bốc thăm sơ đồ đấu",
    )
    expect(getAuditEventLabel("match.walkover")).toBe("Xử thua vắng mặt")
  })

  it("giữ nguyên mã lạ thay vì trả chuỗi rỗng", () => {
    // Thà hiện mã chưa dịch còn hơn để dòng nhật ký trống trơn.
    expect(getAuditEventLabel("something.new")).toBe("something.new")
  })
})

describe("findNextPendingMatchId", () => {
  const runs = (statuses: string[]) =>
    statuses.map((status, index) => ({ id: `m${index + 1}`, status }))

  it("nhảy sang lượt chưa xong ngay sau lượt vừa lưu", () => {
    const matches = runs(["COMPLETED", "READY", "READY"])
    expect(findNextPendingMatchId(matches, "m1")).toBe("m2")
  })

  it("bỏ qua lượt đã xong và lượt đã huỷ", () => {
    const matches = runs(["READY", "COMPLETED", "CANCELLED", "READY"])
    expect(findNextPendingMatchId(matches, "m1")).toBe("m4")
  })

  it("quét vòng lên đầu khi nhập tới lượt cuối mà phía trên còn dở", () => {
    // Nhân viên nhập nhảy cóc: lượt 2 và 3 xong trước, giờ vừa lưu lượt cuối.
    const matches = runs(["READY", "COMPLETED", "COMPLETED", "COMPLETED"])
    expect(findNextPendingMatchId(matches, "m4")).toBe("m1")
  })

  it("trả null khi mọi lượt đã xong — không quay lại chính nó", () => {
    const matches = runs(["COMPLETED", "COMPLETED"])
    expect(findNextPendingMatchId(matches, "m2")).toBeNull()
  })

  it("trả null khi lượt vừa lưu không nằm trong danh sách", () => {
    expect(findNextPendingMatchId(runs(["READY"]), "khong-co")).toBeNull()
  })

  it("trả null với danh sách rỗng", () => {
    expect(findNextPendingMatchId([], "m1")).toBeNull()
  })
})

describe("getQualifyingStandings", () => {
  const participant = (
    id: string,
    bestLap: number | null,
    totalTime: number | null,
    status = "FINISHED",
    seed = 1,
  ) =>
    ({
      id: `participant-${id}-${bestLap}`,
      registration_id: id,
      best_lap_seconds: bestLap,
      total_time_seconds: totalTime,
      status,
      seed_no: seed,
    }) as never

  it("gộp nhiều lượt và xếp hạng giống backend", () => {
    const standings = getQualifyingStandings([
      {
        id: "run-1",
        participants: [
          participant("a", 30, 40, "FINISHED", 2),
          participant("b", 30, 39, "FINISHED", 3),
        ],
      },
      {
        id: "run-2",
        participants: [
          participant("a", 31, 38, "FINISHED", 2),
          participant("c", 30, 39, "FINISHED", 1),
        ],
      },
    ] as never)

    expect(standings.map((item) => item.registrationId)).toEqual([
      "a",
      "c",
      "b",
    ])
    expect(standings[0].totalTimeSeconds).toBe(38)
  })

  it("loại người không có thành tích hợp lệ khỏi top chung kết", () => {
    const standings = getQualifyingStandings([
      {
        id: "run-1",
        participants: [
          participant("valid", 31, 40),
          participant("dns", null, null, "DNS"),
          participant("empty", null, null, "READY"),
        ],
      },
    ] as never)

    expect(standings.map((item) => item.registrationId)).toEqual(["valid"])
  })
})
