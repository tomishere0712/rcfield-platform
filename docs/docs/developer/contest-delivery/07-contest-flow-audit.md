# Contest Flow Audit — 2026-08-02

**Mục đích:** liệt kê toàn bộ mâu thuẫn của luồng contest hiện tại (spec ↔ code ↔ spec) làm đầu vào cho bản redesign `specs/018-contest-flow-redesign`.

**Phạm vi rà:** `docs/spec/03-contest.md`, `docs/spec/business-rules/BR-contest.md`, `specs/016-contest-booking-rental/`, và backend `rcfeild-be/src/{routes,controllers,services,models}` phần contest.

**Quy ước:** mỗi phát hiện có bằng chứng `file:line`. `P0` = luồng không vận hành được hoặc sai tiền. `P1` = code khác spec. `P2` = docs tự mâu thuẫn. `R` = rủi ro/nợ kỹ thuật.

---

## P0 — Chặn vận hành hoặc sai tiền

### P0-1. Contest tự khoá chính nó: không sửa được giải sau khi có người đăng ký

`findContestBookingConflicts` (`services/contest-lock.service.ts:204-244`) tìm mọi booking `PENDING|CONFIRMED` trùng khung giờ + tài nguyên của giải, **không loại trừ booking có `contest_id` = chính contest đó**.

Hàm anh em `findContestLockConflictForBooking:288` thì lại có `if (params.contestId && contest.id === params.contestId) continue`. Hai hàm cùng một khái niệm "lock" nhưng chỉ một bên biết tự loại trừ.

`updateContest` gọi `assertNoContestBookingConflicts` vô điều kiện (`services/contest/contests-crud.ts:400-405`), kể cả khi payload chỉ đổi `name`.

**Hệ quả:** giải `OPEN`, có 1 khách đăng ký kèm thuê xe → booking `PENDING` nằm trong đúng khung giờ giải trên đúng sân bị khoá → mọi lần `PATCH /contests/:id` trả 409 `CONTEST_BOOKING_CONFLICT`. Provider mất khả năng sửa giải, kể cả sửa mô tả. Càng nhiều người đăng ký càng chắc chắn hỏng.

### P0-2. Lệ phí giải có thể bị thu hai lần

Đăng ký RENTAL gộp lệ phí vào booking: cộng vào `snapshot.total_charged` và tạo `PaymentComponent` loại `CONTEST_ENTRY_FEE` trạng thái `HELD` (`services/contest/registrations.ts:171-194`). Registration giữ `paymentStatus = PENDING_PAYMENT` (`:211-214`).

`createContestEntryPaymentUrl` (`services/contest/registrations.ts:926-1017`) chỉ chặn khi:
- `paymentStatus ∈ {MARKED_PAID, WAIVED}` (`:945-951`), hoặc
- đã có `PaymentTransaction` `CONTEST_ENTRY` đang `PENDING` (`:953-968`).

Không có guard nào đọc `registration.bookingId`.

**Hệ quả:** khách đăng ký RENTAL (lệ phí đã nằm trong booking, chưa thanh toán) vẫn gọi được `POST /contest-registrations/:id/create-entry-fee-payment` và trả lệ phí lần thứ hai qua một giao dịch VNPay riêng. Hai đường tiền cho cùng một khoản, không đường nào biết đường kia.

### P0-3. Huỷ giải không hoàn tiền và không đụng tới booking đã thu

`cleanUpContestOnCancel` (`services/contest/registration-side-effects.ts:97-123`) chỉ làm 3 việc: set `metadata.refund_needed = (paymentStatus === MARKED_PAID)`, chuyển registrations sang `CANCELLED`, chuyển matches sang `CANCELLED`.

Không có: tạo `PaymentTransaction` REFUND, ghi audit `registration.refund_requested`, huỷ hoặc hoàn booking thuê xe liên kết.

Đối chiếu docs: BR-CT-043 khẳng định "tạo `PaymentTransaction` REFUND PENDING… ghi audit `registration.refund_requested`"; BR-CT-043a mô tả endpoint `POST /contest-registrations/:registrationId/refunds/:refundTxnId/confirm`. **Endpoint này không tồn tại** trong `routes/contest.routes.ts`.

**Hệ quả:** huỷ giải → khách mất tiền lệ phí (đã nằm trong booking đã `CONFIRMED`), booking thuê xe vẫn sống nguyên trong khi giải không còn, và không có bất kỳ bản ghi hoàn tiền nào để đối soát.

### P0-4. `SELECTED_TRACKS` bị ép âm thầm thành `FULL_BRANCH`

`resolveContestResourceLocks` (`services/contest-lock.service.ts:111-117`): nếu cafe có `activeTrackConfigs.length <= 1` thì luôn trả `FULL_BRANCH`, bất kể provider chọn gì.

**Hệ quả:** chi nhánh một sân bị khoá toàn bộ trong suốt thời gian giải. Provider thấy UI "chỉ khoá sân thi đấu" nhưng thực tế mất hết booking thường của chi nhánh đó. Docs §4 mô tả đây là lựa chọn của provider.

---

## P1 — Code khác spec

### P1-1. RBAC: STAFF làm được tất cả thao tác mà spec nói chỉ Provider owner

`assertContestProviderOrAssignedStaff` (`services/contest/guards.ts:104-106`) chỉ là alias của `assertContestOperator` (`services/contest.helpers.ts:59-71`) — chấp nhận PROVIDER owner **hoặc** STAFF được assign vào contest.

Route cũng mở cho STAFF (`routes/contest.routes.ts`):

| Thao tác | Route | Guard service | BR-CT-054 nói |
|---|---|---|---|
| Update contest | `:43-49` | `assertContestOperator` | chỉ Provider owner |
| Cancel contest | `:72-78` | `assertContestOperator` | chỉ Provider owner |
| Publish leaderboard | `:93-99` | `assertContestOperator` (`contest-runtime.service.ts:1246`) | chỉ Provider owner |
| Generate final bracket | `:86-92` | `assertContestOperator` (`contest-runtime.service.ts:661`) | chỉ Provider owner |
| Waive entry fee | `:222-228` | `assertContestOperator` (`registrations.ts:380`) | chỉ Provider owner |

BR-CT-054 và `03-contest.md` §10/§12 đang mô tả một mô hình phân quyền chưa từng được implement.

### P1-2. `MARKED_PAID` gộp chung tiền thật và tiền bấm tay

Enum `ContestEntryFeePaymentStatus` chỉ có `NOT_REQUIRED | PENDING_PAYMENT | PENDING_REVIEW | WAIVED | MARKED_PAID` (`services/contest/types.ts:69`). VNPay thành công cũng ghi `MARKED_PAID`, staff bấm tay cũng ghi `MARKED_PAID`.

`markEntryFeePaid` (`services/contest/registrations.ts:384-402`) không có guard trạng thái nào: mark paid được cho registration đã `CANCELLED`, đã `WAIVED`, hoặc giải đã `COMPLETED`.

`getContestMetrics` (`services/contest-runtime.service.ts:1376-1399`) tính `paid_revenue = count(MARKED_PAID) × entry_fee`. Với đăng ký RENTAL, khoản này đã được thu trong booking và đã tính vào doanh thu booking → **doanh thu bị đếm hai lần**, lẫn với cả tiền staff tự bấm mà không có giao dịch nào.

### P1-3. Mặc định `vehicle_policy` ngược nhau giữa FE và BE

BE: `String(contest.vehicleRule?.vehicle_policy ?? 'RENTAL_ONLY')` (`services/contest/registrations.ts:84`).
Docs §13: "FE mặc định `BYOC_ONLY` cho giải mới".

Giải nào không gửi `vehicle_policy` sẽ bị BE ép `RENTAL_ONLY` và từ chối mọi đăng ký BYOC.

### P1-4. Guard check-in bị viết hai lần và đã trôi khỏi nhau

Hai đường check-in registration:
1. `checkInRegistration` (`services/contest/registrations.ts:732-925`) — staff bấm check-in trong màn contest.
2. `syncContestRegistrationOnVehicleCheckIn` (`services/contest-rental.service.ts:427-543`) — staff check-in xe cho booking có `contest_id`.

Đường 2 **có** mirror các guard trạng thái contest, khung giờ, entry fee, ban (`:476-505`) — đây là điểm cần đính chính so với suy đoán ban đầu. Nhưng vẫn thiếu so với đường 1:

- không kiểm tra `booking.cafeId` có thuộc `contest_cafes` không, mà ghi thẳng vào `checked_in_cafe_id` (`:514`);
- không kiểm tra staff có được assign vào contest/cafe không (đường 1 bắt buộc, `registrations.ts:795-800`).

Logic trùng lặp ở hai file là nguồn drift: đã lệch một lần thì sẽ lệch tiếp.

### P1-5. Lookup theo mã check-in không kiểm tra chi nhánh

`lookupRegistrationByCode` (`services/contest/registrations.ts:706-721`) với STAFF chỉ kiểm tra `isStaffAssignedToContest`, không kiểm tra cafe. BR-CT-053 yêu cầu "staff lookup/check-in/runtime action → phải assigned đúng cafe".

### P1-6. `requireActiveProvider` áp không nhất quán

Có: create/update/open/close/cancel/generate/publish/approve/reject/metrics/audit-logs.
Không có: `registrations/lookup` (`:209-214`), `check-in` (`:262-267`), `participants` (`:268-273`), `results` (`:274-279`), `results/correct` (`:280-285`), `advance` (`:286-291`).

Provider hết hạn subscription vẫn vận hành được cả ngày thi đấu nhưng không duyệt được đăng ký — nửa vời theo cả hai hướng.

### P1-7. Docs mô tả endpoint không tồn tại

`POST /contest-registrations/:registrationId/refunds/:refundTxnId/confirm` (BR-CT-043a, `03-contest.md` §6) không có trong `routes/contest.routes.ts`.

---

## P2 — Docs tự mâu thuẫn

| # | Mâu thuẫn |
|---|---|
| P2-1 | §14 "Không viết docs như thể VNPay contest đã xong", "backend register hiện rental-only" ↔ §5/§6 + BR-CT-032/033a mô tả BYOC và VNPay là current feature có endpoint. |
| P2-2 | BR-CT-040 "entry fee **phải** dùng `subject_type = CONTEST_ENTRY` link `contest_registration_id`" ↔ BR-CT-031a "entry fee nằm trong booking snapshot, trả qua giao dịch booking". Không có rule nào quyết định khi nào dùng đường nào. |
| P2-3 | WF-A `POST /bookings/contest-rental`: bảng §2 liệt kê là feature hiện có; BR-CT-031 nói "không còn luồng dùng booking có sẵn"; BR-CT-080 nói "không còn là entry chính". Ba câu ba nghĩa. |
| P2-4 | Bảng §2 có hai hàng "Runtime format" (dòng 30 và 36) nội dung khác nhau — dấu hiệu docs bị patch chồng. |
| P2-5 | §13 đặt mặc định `BYOC_ONLY` và khuyến cáo bỏ `MIXED`, trong khi toàn bộ phần được đầu tư nhất (gộp thanh toán, `rental_policy`, sync check-in xe) chỉ chạy cho RENTAL. |

**Nguyên nhân gốc:** `03-contest.md` đang là nhật ký patch theo mốc thời gian ("đã implement 2026-07-23", "từ 2026-08-01") thay vì một contract. Mỗi lần vá đẻ thêm một câu phủ định câu cũ, và không có mục nào là nguồn sự thật duy nhất cho FE.

---

## R — Rủi ro và nợ kỹ thuật

- **R-1. Capacity check chưa thật sự atomic.** `SELECT id FROM contest_registrations WHERE … FOR UPDATE` (`registrations.ts:152-164`) khoá các row đang có, nhưng dưới READ COMMITTED không chặn được phantom insert của transaction song song. Hai người đăng ký đồng thời ở slot cuối vẫn có thể cùng qua. BR-CT-013 NOTE tuyên bố đã xử lý xong.
- **R-2. Đăng ký lại ghi đè registration cũ.** `const registration = existing ?? create()` (`registrations.ts:196`) tái sử dụng đúng row đã `CANCELLED` → mất lịch sử lần huỷ trước và mất link tới booking cũ (kể cả booking đã thanh toán đang được "retained").
- **R-3. Compensating cancel ghi sai lý do.** Khi transaction đăng ký fail, booking bị huỷ bằng `transition(id, 'PAYMENT_TIMEOUT')` (`registrations.ts:230`) → audit ghi "hết hạn thanh toán" cho một booking chưa từng quá hạn.
- **R-4. Đổi danh sách chi nhánh không kiểm tra ràng buộc.** `updateContest` xoá sạch rồi tạo lại `contest_cafes` (`contests-crud.ts:320-333`) mà không kiểm tra chi nhánh bị gỡ có đang giữ registration đã check-in, booking, hay match nào.
- **R-5. Mô hình đa chi nhánh chưa hoàn chỉnh.** BR-CT-021 buộc mọi chi nhánh tham gia phải có cùng `track_type`, nhưng runtime `generateContestMatches` nhận một `cafe_id` duy nhất và leaderboard gộp chung — chưa có mô hình thi đấu/xếp hạng thật sự cho giải nhiều chi nhánh.
- **R-6. Gần như không có test.** Codegraph báo "no covering tests found" cho `createContest`, `updateContest`, `changeContestStatus`, `approveRegistration`, `checkInRegistration`, `publishContestLeaderboard`, `resolveContestResourceLocks`, `assertNoContestBookingConflicts`, `findContestBookingConflicts`.

---

## M — Chế độ thi đấu: cái gì thật sự chạy được

### M-0. Catalog thật trong DB

| Bảng | Số dòng | Giá trị |
|---|---|---|
| `contest_types` | 2 | `PROVIDER_STANDARD` (mig `1784000000000`), `GRAND_PRIX` (mig `1784600000000`) |
| `contest_formats` | 3 | `TIME_TRIAL`, `KNOCKOUT`, `QUALIFYING_FINAL` |
| `contest_templates` | 3 | `provider_standard_time_trial`, `provider_standard_knockout`, `grand_prix_qualifying_final` |

Engine tương ứng trong `services/contest-format.engine.ts:449-453`: `TimeTrialEngine`, `KnockoutEngine`, `QualifyingFinalEngine`. `getContestFormatEngine:455-459` map `TIME_TRIAL`/`QUALIFYING_FINAL`, còn lại rơi về `KNOCKOUT`.

Vậy: **3 chế độ có code, cả 3 đều chỉ chạy được trên đường hạnh phúc hẹp.** Chi tiết dưới đây.

**Ba ID nhưng chỉ một cái có tác dụng.** Contest lưu `contest_type_id`, `contest_format_id`, `contest_template_id`. Runtime chỉ đọc `config.runtime_format` (suy ra từ **format code**). `contest_template` chỉ đóng góp `default_config` lúc tạo. `contest_type` **không được đọc ở bất kỳ đâu trong runtime** — `GRAND_PRIX` và `PROVIDER_STANDARD` chỉ khác nhau ở nhãn hiển thị. Ba bảng catalog đang mô hình hoá một thứ mà thực chất chỉ cần một trường.

### M-1. TIME_TRIAL — chạy được, nhưng không phải time trial thật

`TimeTrialEngine.generateMatches` (`:105-134`) sinh mỗi VĐV **một** match `TIME_ATTACK`, `winners_to_advance: 0`, không `nextMatchId`.

Thiếu:
- **Không có nhiều lượt chạy.** Thể thức time trial thật cho mỗi người 2-3 lượt rồi lấy lap tốt nhất. Ở đây mỗi người đúng một lượt; muốn chạy lại phải generate lại, mà `generateContestMatches:582-592` chặn ngay khi đã có match `COMPLETED` (`CONTEST_RUNTIME_LOCKED`). Không có đường vòng.
- `submitMatchResults:892-895` ép `Math.max(1, winnersToAdvance || 1)` → luôn gán 1 winner kể cả khi `winners_to_advance = 0`. Ở TIME_TRIAL mỗi match 1 người nên **mọi VĐV đều được đánh dấu thắng**. Vô hại cho xếp hạng BEST_LAP nhưng làm hỏng `KNOCKOUT_WINS` (xem M-3).

### M-2. KNOCKOUT — công thức bracket chỉ đúng khi số trận vòng 1 là luỹ thừa của 2

`KnockoutEngine.generateMatches:185-262`:

```
firstRoundMatches = ceil(N / driversPerMatch)
totalRounds       = ceil(log2(firstRoundMatches)) + 1
matchesInRound(r) = ceil(matchesInRound(r-1) / 2)
advancementRule   = { winners_to_advance: 1 }   // cứng, mọi vòng
```

**Lỗi 1 — bye chỉ xử lý ở vòng 1.** Auto-bye chạy trên `rounds[0]` (`:247-259`). Với N=12, drivers=2: vòng 1 có 6 trận → 6 winners → vòng 2 có 3 trận → 3 winners → vòng 3 có 2 trận, trong đó **một trận chỉ nhận được 1 người**. Trận đó không được auto-bye, đứng ở `READY` với 1 participant. Staff buộc phải nhập kết quả giả cho một trận một người mới đi tiếp; nếu không, `publishContestLeaderboard:1260-1271` chặn vĩnh viễn vì còn match `READY`.

**Lỗi 2 — `drivers_per_match > 2` sinh bracket sai.** API nhận `drivers_per_match` (`generateContestMatches:608`) và engine chia N người vào các trận theo `drivers` (`:233-244`), nhưng `winners_to_advance` vẫn cứng bằng 1 và số trận vòng sau vẫn chia đôi theo **số trận** chứ không theo **số người đi tiếp**. Heat 4 xe: 16 người → 4 trận → 4 winners → vòng 2 có 2 trận (đúng tình cờ) → nhưng 8 người → 2 trận → 2 winners → `totalRounds = ceil(log2 2)+1 = 2` → chung kết chỉ có 2 người, đúng. Còn 12 người/4 xe → 3 trận → 3 winners → vòng 2 có 2 trận, lại lặp lại Lỗi 1. Docs §2 ghi multi-driver heat "chưa phải UI/runtime chính"; thực tế backend **nhận và sinh bracket sai**, không chặn.

**Lỗi 3 — không có trận tranh hạng 3.** Vòng cuối là `FINAL` duy nhất; leaderboard xếp bằng `wins` + `progressed_round` (`buildLeaderboard:1193-1240`), nên hai người thua bán kết đồng hạng.

**Lưu ý seeding.** Template knockout mặc định `seeding_mode: MANUAL` (mig `1784000000000:363`), mà nhánh MANUAL lấy nguyên thứ tự `body.registration_ids` (`generateContestMatches:601-603`). FE không sắp thứ tự thì hạt giống là thứ tự ngẫu nhiên của mảng.

### M-3. QUALIFYING_FINAL — vừa mới thông đường, còn 3 lỗi

Trước 2026-08-01 `getRuntimeFormatFromCatalog` ép mọi mã không phải TIME_TRIAL về KNOCKOUT nên engine này chưa từng được gọi. Nay đã sửa (`guards.ts:90-94`).

**Lỗi 1 — không lọc DNS/DNF/DQ khỏi danh sách vào chung kết.** `generateContestFinalBracket:708-717` xếp hạng bằng `bestLapSeconds ?? MAX_SAFE_INTEGER` rồi lấy `min(finalists, ranked.length)` người đầu. VĐV không có thời gian (bỏ chạy, hỏng xe) vẫn nằm trong `ranked` và lọt vào chung kết nếu số người có kết quả ít hơn `finalists`.

**Lỗi 2 — mọi VĐV được +1 trận thắng ảo từ vòng loại.** Vòng loại là match `TIME_ATTACK` một người; `submitMatchResults` ép gán winner (xem M-1) → `isWinner = true` cho tất cả. `buildLeaderboard` đếm `wins` trên **mọi match completed**, kể cả vòng loại. Với `leaderboard_mode: KNOCKOUT_WINS` (mặc định của template grand prix), bảng xếp hạng cuối cùng cộng thêm 1 win cho tất cả mọi người — thứ tự tương đối vẫn đúng nhưng con số hiển thị sai.

**Lỗi 3 — sinh nhầm bracket chung kết là không sửa được.** `generateContestMatches` chặn vì đã có match COMPLETED; `generateContestFinalBracket:685-687` chặn vì `FINAL_BRACKET_ALREADY_EXISTS`. Không có endpoint xoá/tạo lại vòng chung kết. Lối thoát duy nhất là sửa DB tay.

### M-4. Những gì không có engine nào

- **`competition_mechanic` là field chết.** Seed ghi `HEAD_TO_HEAD_ELIMINATION`, `QUALIFIER_TO_KNOCKOUT` vào `config` (`seeds/seed-contests.ts:586,635`) nhưng **không có dòng code nào đọc nó**.
- Không có: vòng bảng (group stage), giải nhiều chặng tích điểm (league/championship), best-of-N (thắng 2/3 heat), trận tranh hạng 3, nhiều lượt chạy lấy lap tốt nhất, phân hạng theo class xe (Drift/Touring/Buggy đang phải chạy chung một bảng).
- `contest_match_participants.lane` / `grid_position` có cột nhưng chỉ được gán máy móc `L{slotNo}`, không có logic bốc thăm làn/vị trí xuất phát.

### M-5. Mâu thuẫn docs liên quan chế độ

- §13 viết "ba dropdown cũ cho **18 tổ hợp** mà chỉ 3 tổ hợp có template thật" — thực tế 2 type × 3 format = **6** tổ hợp.
- Cả 3 template đều khai `vehicle_policy_options = ["RENTAL_ONLY","MIXED","BYOC_ONLY"]`, tức catalog vẫn quảng cáo `MIXED`, trong khi §13 nói `MIXED` không còn được đề xuất.
- §2 có hai dòng "Runtime format" mâu thuẫn: một dòng mô tả bug đã fix, dòng kia nói multi-driver heat "chưa phải UI/runtime chính".

---

## Câu hỏi cần chốt trước khi viết spec mới

1. **Một đường tiền hay hai?** Gộp tất cả (lệ phí + thuê xe) vào một giao dịch booking duy nhất, kể cả BYOC (booking 0đ thuê xe)? Hay tách hẳn lệ phí thành `CONTEST_ENTRY` và bỏ gộp?
2. **STAFF được làm gì?** Giữ như code hiện tại (staff làm tất cả) hay siết theo BR-CT-054 (Provider owner giữ cancel/update/publish/waive)?
3. **Giải nhiều chi nhánh có thật sự cần không?** Nếu bỏ, mô hình đơn giản đi rất nhiều (1 giải = 1 chi nhánh = 1 bracket).
4. **RENTAL hay BYOC là mặc định?** Quyết định này đổi trọng tâm của cả module.
5. **Huỷ giải thì tiền đi đâu?** Hoàn qua booking refund engine sẵn có, hay refund thủ công có bản ghi riêng?
