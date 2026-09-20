# Contest Phase Gaps

Ngay cap nhat: 2026-06-23

Tai lieu nay tach ro phan Contest dang lam trong phase hien tai va nhung nang luc
can bo sung o phase sau de Contest tro thanh mot luong van hanh race event day du.
Muc tieu la cover ky, nhung khong day scope do an vao live timing, transponder hay
giai dau chuyen nghiep qua lon.

## Now - Current FE Refactor

- Provider participant dashboard:
  - Xem tong quan so luong dang ky, confirmed, checked-in, cancelled, BYOC, rental va suc chua con lai.
  - Tim kiem theo ten, email, ma check-in, note.
  - Loc theo status, nguon xe va cafe da check-in.
  - Xem detail participant: user, role snapshot, vehicle source, note, check-in code, timeline, cancel reason.
  - Quick check-in cho registration `CONFIRMED`.
  - Cancel registration `PENDING` hoac `CONFIRMED` voi reason.
- Staff flow:
  - Staff van lookup/check-in bang ma code.
  - Khong goi endpoint full registrations vi endpoint do chi danh cho Provider owner.
- FE contract cleanup:
  - DTO nullable hon cho `description`, `banner_image_url`, `vehicle_id`, `customer_vehicle_id`,
    `checked_in_*`, `cancelled_*`, `user`.
  - Helper tinh count/filter/status label nam trong `src/features/contests/lib/tournament.ts`.
- Hard-code cleanup trong phase nay:
  - Public contest detail khong con pad bracket bang match gia `pending-*`; chi render `rounds/matches`
    that tu BE hoac empty state.
  - Provider bracket board render dong theo `rounds/matches`, khong con phu thuoc array index
    `0..6` hay mac dinh luon co quarter/semi/final.
  - Form Provider chi cho cau hinh bracket 4 hoac 8 nguoi trong current phase. Bracket 16+
    duoc dua sang backend generator phase sau.
- Monitoring/log current phase:
  - FE phat event noi bo `rcfield:contest-monitor` va `performance.mark("contest:<event>")`
    cho cac action dang ky, huy, check-in, dung bracket, nhap ket qua, publish BXH, reward.
  - BE ghi business log source `ContestAudit` tai service sau khi write thanh cong:
    contest create/open/update/cancel, registration create/check-in/cancel, class/round/heat,
    bracket match create/decide, submit/verify result, publish leaderboard, create/issue reward.
- Validation:
  - FE Contest build/test/lint scoped phai pass.

## Next - Operational Contest Core

Nhung muc nay can lam neu muon Contest that su chay duoc nhu mot race event trong
he thong, khong chi la form dang ky.

### 1. State machine day du

Hien BE moi co `DRAFT -> OPEN` va cancel. Can bo sung:

```text
OPEN -> CLOSED -> RUNNING -> COMPLETED
```

Can co endpoint/service transition:

- `POST /contests/:id/close`
- `POST /contests/:id/start`
- `POST /contests/:id/complete`

Rule:

- `CLOSED` khoa dang ky moi.
- `RUNNING` khoa config quan trong: track, entry fee, capacity, scoring, prize, vehicle rule.
- `COMPLETED` chi cho phep correction qua audit workflow rieng.

### 2. Schedule block

Contest hien chua block track/time, nen co the trung booking thuong.

Can bo sung backend table/service:

```text
cafe_schedule_blocks
  cafe_id
  track_type_id
  starts_at
  ends_at
  source_type = CONTEST
  source_id = contest_id
```

Booking availability phai check schedule blocks truoc khi cho dat lich.

### 3. Contest entry payment

Spec yeu cau `CONTEST_ENTRY`, nhung code hien chua co payment subject that cho
contest registration. Entry fee trong contest hien chua phai ledger/payment that.

Can lam:

- Them `PaymentComponentType.CONTEST_ENTRY` vao type code neu chua dong bo.
- Mo rong payment subject de gan voi `contest_registration_id`, khong tao booking gia.
- Neu entry fee > 0: registration nen `PENDING` cho den khi payment success/manual confirm.
- Provider cancel contest: refund 100% contest entry.
- Customer cancel: refund theo policy da publish.

### 4. Manual heat-based flow

Khong nen hard-code knockout 8 nguoi. Current phase chi dung FE manual generator 4/8 de demo
scope nho. Phase sau can backend generator that de tao bracket/heat nhat quan theo config.

Provider can config:

```json
{
  "format": "TIME_ATTACK | RACE_FINAL | KNOCKOUT",
  "drivers_per_heat": 4,
  "round_plan": ["PRACTICE", "QUALIFYING", "FINAL"],
  "scoring_config": {
    "tie_breakers": ["best_lap_ms", "second_best_lap_ms", "recorded_at"]
  }
}
```

Y nghia:

- Mot duong dua co the chay 2, 4 hoac nhieu xe tuy capacity track.
- `drivers_per_heat` chi la gioi han van hanh moi heat, khong phai tong capacity contest.
- Staff tao heat thu cong, add checked-in participants vao heat, nhap result.
- Neu format la `KNOCKOUT`, BE nen co endpoint generator:
  - Input: `contest_class_id`, `bracket_size`, `seed_strategy`, optional registration ids.
  - Validate registration da `CHECKED_IN`.
  - Tao rounds/matches trong mot transaction.
  - Ho tro 4/8 truoc, 16+ sau neu can demo lon hon.

### 5. Result audit va leaderboard traceability

Hien co result verify va leaderboard, nhung audit sua result chua day du.

Can lam:

- Khi result da submitted ma bi sua: ghi audit neu can doi soat.
- Khi result da verified ma muon correction: bat buoc co reason va before/after JSON.
- Public leaderboard chi tinh tu result `VERIFIED`.
- Publish leaderboard snapshot phai luu scope, format, tie-breaker, standings va published_by.

### 6. Staff/official roles

Can tach vai tro van hanh trong contest:

- Race Director: start/complete contest, resolve issue.
- Timekeeper: nhap timing/result.
- Tech Inspector: BYOC/rental tech-check.
- Marshal/Staff: check-in, staging, ho tro duong dua.

Phase sau co the them `contest_officials`, nhung MVP co the luu trong config/manual assignment.

### 7. BYOC tech-check va rental assignment

Can bo sung event-day controls:

- BYOC:
  - Checklist an toan, pin, vo xe, kich thuoc, class rule.
  - Fail tech-check thi khong cho check-in hoac mark disqualified/no-show theo policy.
- Rental:
  - Rental assignment nen xay ra tai check-in, khong khoa xe qua som.
  - Can rental pool theo cafe/contest.
  - Xe maintenance/retired khong duoc assign.

### 8. Monitoring va audit log nghiep vu

HTTP log khong du de truy vet van hanh contest. Can business audit:

- create contest
- open registration
- register
- cancel registration
- close registration
- check-in
- create class/round/heat
- add heat entry
- submit result
- verify result
- publish leaderboard
- issue reward
- cancel contest

Moi audit event nen co:

```text
actor_id, actor_role, contest_id, registration_id?, cafe_id?,
event_type, before_json?, after_json?, reason?, metadata?, created_at
```

### 9. Reward claim lifecycle

Hien reward issue co ban. Can day du hon:

- `ISSUED`: system/provider da phat quyen nhan.
- `CLAIMED`: participant da nhan tai cafe hoac dung voucher.
- `VOID`: provider/admin huy claim co reason.
- `EXPIRED`: qua han nhan.

Reward cash/payout khong nam trong scope phase gan. Chi nen dung voucher, package slot,
F&B coupon, trophy manual hoac custom non-cash reward.

## Backlog - Large Tournament / Advanced

Khong nen dua vao phase hien tai:

- Live timing/transponder integration.
- Lap-by-lap import tu thiet bi timing.
- Auto heat generation/auto seeding phuc tap.
- Auto bump-up B-main len A-main.
- Protest workflow va dispute result rieng.
- Bracket double elimination/swiss/round robin day du.
- Series/championship nhieu contest.
- Cross-branch/season leaderboard.
- Cash prize, payout, tax/fraud controls.

## Suggested Next Sprint Order

1. BE state machine `close/start/complete`.
2. FE controls hien action theo state machine moi.
3. Schedule block conflict check khi open/start contest.
4. Manual heat-based config: `format`, `drivers_per_heat`, `scoring_config`.
5. Result audit + leaderboard snapshot hardening.
6. Payment `CONTEST_ENTRY` neu demo co thu phi.
7. BYOC tech-check/rental assignment neu demo can event-day realism cao hon.
