# Sequence Flow: Contest — Đấu loại trực tiếp (Knockout)

**Last updated**: 2026-08-02
**Status**: Bám theo code thật của `rcfeild-be` tại thời điểm cập nhật
**Related**: `docs/developer/contest-delivery/07-contest-flow-audit.md`, `docs/spec/03-contest.md`

Tài liệu mô tả luồng end-to-end của **một** thể thức: đấu loại trực tiếp 1v1, thua là bị loại. Mọi endpoint và tên hàm dưới đây được đối chiếu trực tiếp với source, không suy từ spec — vì bản audit đã chỉ ra spec đang mô tả nhiều thứ khác với code.

> Phần **§9 Chưa làm** liệt kê những gì còn thiếu. Đọc phần đó trước khi coi luồng này là đã hoàn chỉnh.

---

## 0. Identifiers

| Field | Value | Notes |
|---|---|---|
| Thể thức | `contest_formats.code = 'KNOCKOUT'` | Suy ra `config.runtime_format` qua `getRuntimeFormatFromCatalog` |
| Sức chứa | `8 / 16 / 32` | Bắt buộc luỹ thừa của 2; cũng chính là kích thước sơ đồ |
| Trạng thái giải | `DRAFT → OPEN → CLOSED → RUNNING → COMPLETED` | `CANCELLED` là terminal |
| Trạng thái đăng ký | `PENDING → CONFIRMED → CHECKED_IN` | `CANCELLED` cho huỷ/từ chối |
| Trạng thái lệ phí | `NOT_REQUIRED / PENDING_PAYMENT / WAIVED / MARKED_PAID` | `PENDING_REVIEW` không còn dùng cho giải mới |
| Nguồn xe | `vehicle_rule.vehicle_policy` | `BYOC_ONLY` hoặc `RENTAL_ONLY` |
| Lá thăm | `contests.config.bracket_draw` | `{ seed, drawn_at, drawn_by, registration_order }` |
| Phiếu mượn xe | `bookings.source = 'CONTEST'`, `contest_id` | 0đ, sinh lúc giao xe |
| Audit | `contest_audit_logs` | `contest.bracket_drawn`, `registration.vehicle_handed_over`, … |

---

## 1. Tạo giải và mở đăng ký

Provider đi qua wizard 5 bước. Bước cuối mới gọi API — các bước trước chỉ validate phía client.

```mermaid
sequenceDiagram
    autonumber
    participant P as Provider
    participant FE as Frontend<br/>(React / ProviderContestFormPage)
    participant API as API<br/>(Express / contest.routes)
    participant CRUD as ContestService<br/>(contests-crud.ts)
    participant DB as PostgreSQL

    P->>FE: Điền 5 bước (chi nhánh → sân → thể thức → lịch & quy mô → giới thiệu)
    Note over FE: Đấu loại: ô sức chứa là dropdown 8/16/32,<br/>không cho nhập số tuỳ ý
    FE->>API: POST /api/v1/contests
    API->>CRUD: createContest(viewer, body)

    CRUD->>DB: assertParticipatingCafesSupportTrackType()
    alt Có chi nhánh thiếu loại đường đua
        CRUD-->>FE: 400 { code: "CONTEST_TRACK_TYPE_UNAVAILABLE", details.missing_cafe_ids }
    end

    CRUD->>DB: resolveContestResourceLocks() + assertNoContestBookingConflicts()
    alt Trùng booking PENDING/CONFIRMED trong khung giờ
        CRUD-->>FE: 409 { code: "CONTEST_BOOKING_CONFLICT" }
    end

    CRUD->>DB: INSERT contests (status=DRAFT) + contest_cafes
    CRUD->>DB: contest_audit_logs ← contest.created
    CRUD-->>FE: 201 ContestDetail

    P->>FE: Bấm "Mở đăng ký"
    FE->>API: POST /contests/:id/open
    API->>CRUD: changeContestStatus(OPEN)
    CRUD->>DB: UPDATE status=OPEN + audit contest.opened

    P->>FE: Tab "Kỷ luật / Nhân sự" → phân công nhân viên
    FE->>API: POST /contests/:id/staff-assignments
    Note over API,DB: Không có bước này thì staff KHÔNG thấy giải<br/>trong danh sách của mình (listContests inner join<br/>contest_staff_assignments)
```

---

## 2. Khách đăng ký

Hai nhánh hoàn toàn khác nhau tuỳ `vehicle_policy` của giải.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant FE as Frontend<br/>(React / ContestRegistrationPanel)
    participant API as API<br/>(Express / contest.routes)
    participant REG as ContestService<br/>(contest/registrations.ts)
    participant RENT as ContestRentalService<br/>(contest-rental.service.ts)
    participant DB as PostgreSQL

    C->>FE: Mở trang giải, bấm Đăng ký

    alt Giải BYOC_ONLY — khách mang xe riêng
        C->>FE: Khai tên xe / hãng / class
        FE->>API: POST /contests/:id/register { vehicle_source: "BYOC", byoc_* }
    else Giải RENTAL_ONLY — thuê xe của quán
        FE->>API: GET /contests/:id/available-rental-vehicles?cafe_id=…
        API->>RENT: getContestAvailableRentalVehicles()
        RENT-->>FE: [{ catalog_id, catalog_name, total_units, remaining_slots }]
        Note over FE: Chỉ chọn DÒNG xe. Không chọn khung giờ,<br/>không hiện giá — thuê xe trong giải miễn phí
        C->>FE: Chọn chi nhánh + dòng xe
        FE->>API: POST /contests/:id/register { vehicle_source: "RENTAL", rental: { cafe_id, vehicle_catalog_id } }
    end

    API->>REG: createContestRegistration()
    REG->>DB: Kiểm tra: contest OPEN, trong registration window, không bị ban

    opt Thuê xe
        REG->>RENT: resolveContestRentalChoice() — dòng xe hợp loại đường đua, còn xe khả dụng
    end

    REG->>DB: BEGIN — khoá registrations của giải (pessimistic_write)
    REG->>DB: Đủ sức chứa? (SELECT … FOR UPDATE)
    opt Thuê xe
        REG->>RENT: assertContestRentalCatalogHasSlot() — giữ chỗ theo SỐ XE CÓ THẬT
        alt Dòng xe hết suất
            REG-->>FE: 409 { code: "CONTEST_RENTAL_CATALOG_FULL" }
        end
    end
    REG->>DB: INSERT contest_registrations (status=PENDING, rental_catalog_id, booking_id=NULL)
    REG->>DB: COMMIT

    Note over REG,DB: KHÔNG tạo booking ở bước này.<br/>Phiếu mượn xe chỉ sinh lúc giao xe (§5)
```

**Trạng thái lệ phí ngay sau khi đăng ký:**

| Lệ phí giải | `payment_status` |
|---|---|
| `> 0` | `PENDING_PAYMENT` |
| `= 0` | `NOT_REQUIRED` |

---

## 3. Lệ phí và xác nhận suất thi đấu

Điểm mấu chốt: **thuê xe không cần ai bấm duyệt**, vì không có gì để duyệt — xe là xe của quán.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant P as Provider
    participant API as API<br/>(Express)
    participant REG as ContestService<br/>(registrations.ts)
    participant PAY as PaymentService<br/>(payment.service.ts)
    participant SIDE as RegistrationSideEffects
    participant V as VNPay
    participant N as Email + Notification
    participant DB as PostgreSQL

    opt Giải có lệ phí
        C->>API: POST /contest-registrations/:id/create-entry-fee-payment
        API->>REG: createContestEntryPaymentUrl()
        REG->>DB: INSERT payment_transactions (subject=CONTEST_ENTRY, status=PENDING)
        REG-->>C: { payment_url, txn_ref, amount }
        C->>V: Thanh toán
        V->>API: IPN / return
        API->>PAY: confirm CONTEST_ENTRY
        PAY->>DB: payment_status = MARKED_PAID + audit registration.entry_fee_marked_paid
    end

    Note over SIDE: autoConfirmRentalRegistration() chạy ở MỌI điểm<br/>lệ phí ngã ngũ: lúc đăng ký (giải miễn phí),<br/>VNPay thành công, provider đánh dấu đã thu, hoặc miễn phí

    alt Thuê xe của quán
        PAY->>SIDE: autoConfirmRentalRegistration(registrationId)
        SIDE->>DB: Kiểm lại ban + contest còn OPEN/CLOSED
        SIDE->>DB: UPDATE … SET status=CONFIRMED WHERE status=PENDING (atomic)
        SIDE->>DB: audit registration.approved (actorRole=SYSTEM)
    else Khách mang xe riêng
        P->>API: POST /contest-registrations/:id/approve
        API->>REG: approveRegistration() — đọc BẢN KHAI XE, quyết định đúng hạng thi hay không
        REG->>DB: UPDATE status=CONFIRMED + audit registration.approved
    end

    SIDE->>N: Email "Bạn đã có suất thi đấu" — kèm MÃ CHECK-IN, địa điểm, giờ thi, xe
    N-->>C: Nhận mã check-in
```

---

## 4. Bốc thăm — sau khi đóng đăng ký, trước ngày thi

Đây là bước quyết định hình dạng cả giải.

```mermaid
sequenceDiagram
    autonumber
    participant P as Provider
    participant API as API<br/>(Express)
    participant RT as ContestRuntimeService<br/>(contest-runtime.service.ts)
    participant KE as KnockoutEngine<br/>(contest-format.engine.ts)
    participant DB as PostgreSQL

    P->>API: POST /contests/:id/matches/generate { cafe_id }
    Note over P,API: KHÔNG gửi registration_ids —<br/>bốc cả giải, ban tổ chức không nhặt ai vào ai ra

    API->>RT: generateContestMatches()
    RT->>DB: Lấy mọi registration CONFIRMED / CHECKED_IN
    alt Dưới 2 người
        RT-->>P: 400 { code: "CONTEST_NOT_ENOUGH_PARTICIPANTS" }
    end

    RT->>DB: Đã có trận nào thi đấu thật chưa? (isDecidedByPlay)
    Note over RT: Trận đóng sẵn vì gặp ô trống KHÔNG tính là đã thi đấu,<br/>nên bốc lại được khi chưa ai chạy vòng nào
    alt Đã có trận RUNNING / COMPLETED có kết quả thật
        RT-->>P: 409 { code: "CONTEST_RUNTIME_LOCKED" }
    end

    RT->>KE: shuffleWithSeed(registrations, seed) — mulberry32 + Fisher-Yates
    KE-->>RT: Thứ tự đã bốc
    RT->>KE: generateMatches({ bracketSize = capacity })

    Note over KE: bracketSize luỹ thừa 2 · thứ tự hạt giống chuẩn<br/>[1,8,4,5,2,7,3,6] · ô trống rải đều
    KE->>KE: resolveEmptySeats() — người gặp ô trống được đẩy đi tiếp<br/>qua MỌI vòng, không chỉ vòng 1
    KE-->>RT: GeneratedMatch[] (trận thật = READY/DRAFT, gặp ô trống = COMPLETED)

    RT->>DB: clearExistingRuntime() → INSERT contest_matches + participants
    RT->>DB: UPDATE contests SET status=CLOSED, config.bracket_draw = { seed, drawn_at, drawn_by, registration_order }
    RT->>DB: audit contest.bracket_drawn { draw_seed }
    RT-->>P: 201 Danh sách trận

    Note over DB: Sơ đồ công khai ngay — GET /contests/:id/matches<br/>không cần đăng nhập, khách biết trước đối thủ
```

**Ví dụ 11 người trong sơ đồ 16 suất:**

| Vòng | Số ô trận | Trận phải đấu |
|---|---|---|
| 1 | 8 | 3 (5 suất thắng do ô trống) |
| 2 | 4 | 4 |
| Bán kết | 2 | 2 |
| Chung kết | 1 | 1 |
| **Tổng** | **15** | **10** = 11 − 1 |

---

## 5. Ngày thi — điểm danh và giao xe

Staff làm việc trong màn contest riêng, **không** đi qua module đặt sân.

```mermaid
sequenceDiagram
    autonumber
    participant S as Staff
    participant FE as Frontend<br/>(React / StaffContestCheckInPage)
    participant API as API<br/>(Express)
    participant REG as ContestService<br/>(registrations.ts)
    participant RENT as ContestRentalService
    participant DB as PostgreSQL

    S->>FE: Mở giải → nhập mã check-in
    FE->>API: GET /contests/:id/registrations/lookup?check_in_code=…
    API-->>FE: Thông tin VĐV

    alt VĐV mang xe riêng (BYOC)
        S->>FE: Chụp ≥2 ảnh + checklist body / power_system / wheels
        FE->>API: POST /contest-registrations/:id/check-in { byoc_confirmed, byoc_inspection }
        API->>REG: checkInRegistration()
        alt Thiếu ảnh / thiếu hạng mục / có mục NOT_OK
            REG-->>FE: 400 { code: "CONTEST_BYOC_INSPECTION_REQUIRED" | "…FAILED" }
        end
    else VĐV thuê xe của quán
        FE->>API: GET /contest-registrations/:id/handover-units
        API->>RENT: listContestHandoverUnits() — xe rảnh đúng dòng đã đặt,<br/>trừ xe đã giao cho người khác
        RENT-->>FE: [{ id, identifier, color }]
        S->>FE: Chọn chiếc xe cụ thể để giao
        FE->>API: POST /contest-registrations/:id/check-in { rental_vehicle_id }
        API->>REG: checkInRegistration()
    end

    REG->>DB: Kiểm tra: đã CONFIRMED, giải CLOSED/RUNNING,<br/>trong khung giờ thi đấu, staff đúng chi nhánh, không bị ban
    REG->>DB: UPDATE … SET status=CHECKED_IN WHERE status=CONFIRMED (atomic)

    opt Thuê xe
        REG->>RENT: createContestVehicleHandover()
        RENT->>DB: BEGIN
        RENT->>DB: INSERT bookings (source=CONTEST, status=CONFIRMED, 0đ, slot = khung giờ giải)
        RENT->>DB: INSERT booking_participants + booking_vehicles (rental_fee=0, deposit=0, giữ damage_multiplier)
        RENT->>DB: INSERT sessions + session_participants + session_vehicles
        RENT->>DB: COMMIT
        RENT-->>REG: { bookingId, sessionId, vehicleId }
        REG->>DB: UPDATE contest_registrations SET booking_id, vehicle_id
        REG->>DB: audit registration.vehicle_handed_over
        alt Giao xe lỗi
            REG->>DB: Trả trạng thái về CONFIRMED (không để ai bị ghi là đã điểm danh mà tay không có xe)
            REG-->>FE: lỗi tương ứng
        end
    end

    REG-->>FE: 200 Registration đã CHECKED_IN
```

> Phiếu mượn xe **không** dùng `createBooking`/`startCheckIn` của luồng đặt sân thường: những hàm đó áp luật của khách lẻ — báo trước bao lâu, tối đa 8 slot, và *"quá 30 phút kể từ giờ bắt đầu là hết hạn check-in"*. Giải chạy cả buổi mà VĐV tới muộn 40 phút thì luật đó chặn không cho nhận xe.

---

## 6. Vận hành trận đấu

```mermaid
sequenceDiagram
    autonumber
    participant S as Staff
    participant P as Provider
    participant API as API<br/>(Express)
    participant RT as ContestRuntimeService
    participant KE as KnockoutEngine
    participant DB as PostgreSQL

    loop Mỗi trận, từ vòng 1 tới chung kết
        S->>API: POST /contest-matches/:id/results { reason, results[] }
        API->>RT: submitMatchResults()
        RT->>KE: inferWinners(participants, winners_to_advance)
        Note over KE: Chưa ai có kết quả → trả về RỖNG.<br/>Trước đây rơi về so sánh slotNo, tức làn 1 mặc nhiên thắng.<br/>DNS/DNF/DQ không bao giờ được đi tiếp
        RT->>DB: UPDATE participants + match COMPLETED + contest RUNNING
        RT->>DB: audit match.results_submitted

        S->>API: POST /contest-matches/:id/advance
        Note over S,API: ⚠️ Vẫn phải bấm tay. Quên là sơ đồ đứng im
        API->>RT: advanceMatch()
        RT->>DB: INSERT participant vào trận vòng sau + audit match.advanced
    end

    opt Sửa kết quả
        S->>API: POST /contest-matches/:id/results/correct { reason }
        alt Staff gửi force_cascade
            RT-->>S: 403 — chỉ Provider owner được force cascade
        end
        alt Downstream đã có trận hoàn tất
            RT-->>S: bị chặn
        end
    end
```

---

## 7. Công bố kết quả

```mermaid
sequenceDiagram
    autonumber
    participant P as Provider
    participant API as API<br/>(Express)
    participant RT as ContestRuntimeService
    participant DB as PostgreSQL

    P->>API: POST /contests/:id/leaderboard/publish
    API->>RT: publishContestLeaderboard()
    RT->>DB: Còn match DRAFT / READY / RUNNING?
    alt Còn trận chưa xong
        RT-->>P: 409 { code: "CONTEST_MATCHES_INCOMPLETE" }
    end
    RT->>DB: Có trận hoàn tất mà không có kết quả nào?
    alt Thiếu kết quả
        RT-->>P: 400 { code: "CONTEST_MATCH_WITHOUT_RESULTS" }
    end
    RT->>RT: buildLeaderboard() — hiện xếp theo SỐ TRẬN THẮNG
    RT->>DB: config.published_leaderboard + status=COMPLETED + audit contest.leaderboard_published
    RT-->>P: Bảng xếp hạng đã công bố
```

---

## 8. Bảng quyết định

| Trạng thái / điều kiện | Hành động |
|---|---|
| Giải `OPEN` | Nhận đăng ký. Nút điểm danh của staff bị khoá: *"Còn đang mở đăng ký"* |
| Đăng ký `PENDING` + thuê xe + lệ phí đã xong | Tự chuyển `CONFIRMED`, gửi email mã check-in |
| Đăng ký `PENDING` + BYOC | Chờ provider đọc bản khai xe rồi bấm Duyệt |
| Giải `CLOSED`, chưa tới `starts_at` | Nút điểm danh khoá: *"Chưa tới giờ thi đấu"* |
| Giải `CLOSED/RUNNING`, trong khung giờ | Cho điểm danh và giao xe |
| Trận `COMPLETED` do gặp ô trống | Không tính là đã thi đấu → vẫn bốc lại được |
| Trận `COMPLETED` có kết quả thật | Khoá sơ đồ, không bốc lại được |
| Đã qua `ends_at` | Nút điểm danh khoá: *"Giải đã kết thúc"* |

---

## 9. Chưa làm — đọc trước khi coi là hoàn chỉnh

1. **Không có nút xử thua vắng mặt.** Tới giờ trận mà một bên chưa đến thì không có thao tác nào ghi lại việc đó. Nhân viên phải tự nhập kết quả cho người có mặt; `DNS`/`DNF`/`DQ` có cột trong DB nhưng chưa luồng nào ghi vào.
2. **Người thắng không tự đi tiếp.** Nhập kết quả xong phải bấm thêm nút `advance`. Quên là sơ đồ đứng im giữa giải.
3. **Bảng xếp hạng vẫn đếm số trận thắng** (`KNOCKOUT_WINS`), chưa xếp theo vòng bị loại như đã chốt. Cách đếm hiện tại còn cộng cả trận thắng do gặp ô trống.
4. **Trận tranh hạng 3 mới xong một nửa.** `KnockoutEngine` sinh được match khi `config.third_place_match = true`, nhưng form tạo giải chưa có ô bật/tắt và chưa có logic điền hai người thua bán kết vào trận đó.
5. **Giao diện sơ đồ chưa biết vẽ ô trống.** Trận thắng do gặp ô trống hiện thành một trận đã hoàn tất chỉ có một người — nhìn như lỗi dữ liệu.
6. **Chưa có nút "Bốc thăm" riêng trên giao diện provider**; hiện dùng chung nút tạo nhánh đấu.

---

## 10. Key Files

### Backend — `rcfeild-be`

| Vai trò | Đường dẫn | Ghi chú |
|---|---|---|
| Route | `src/routes/contest.routes.ts` | Toàn bộ endpoint contest |
| Controller | `src/controllers/contest.controller.ts` | Parse + uỷ quyền xuống service |
| Tạo/sửa giải | `src/services/contest/contests-crud.ts` | `createContest`, `listContests`, `changeContestStatus` |
| Đăng ký | `src/services/contest/registrations.ts` | Đăng ký, duyệt, điểm danh, giao xe |
| Hiệu ứng phụ | `src/services/contest/registration-side-effects.ts` | `autoConfirmRentalRegistration`, email |
| Thuê xe | `src/services/contest-rental.service.ts` | Chọn dòng xe, giữ chỗ, phiếu mượn xe |
| Runtime | `src/services/contest-runtime.service.ts` | Bốc thăm, nhập kết quả, advance, publish |
| Engine | `src/services/contest-format.engine.ts` | `KnockoutEngine`, `shuffleWithSeed`, `buildBracketSeedOrder` |
| Khoá tài nguyên | `src/services/contest-lock.service.ts` | Chặn booking thường trùng giờ giải |

### Frontend — `rcfield-fe`

| Vai trò | Đường dẫn |
|---|---|
| Provider tạo giải | `src/pages/provider/contest-form/` (wizard 5 bước) |
| Provider vận hành | `src/pages/provider/contest-runtime/ProviderContestWorkspacePage.tsx` |
| Staff danh sách giải | `src/pages/staff/contest/StaffContestsPage.tsx` |
| Staff điểm danh + giao xe | `src/pages/staff/contest/components/ContestCheckInResultCard.tsx` |
| Khách đăng ký | `src/pages/public/contest-detail/components/ContestRegistrationPanel.tsx` |
| Khách chọn xe | `src/pages/public/contest-detail/components/ContestRentalVehiclePicker.tsx` |

---

## 11. Toàn cảnh

```mermaid
flowchart LR
    subgraph Prov["Provider"]
        direction TB
        P1["Tạo giải<br/>sức chứa 8/16/32"]
        P2["Mở đăng ký"]
        P3["Phân công nhân viên"]
        P4["Bốc thăm<br/>sau khi đóng đăng ký"]
        P5["Công bố xếp hạng"]
        P1 --> P2 --> P3 --> P4
    end

    subgraph Cust["Customer"]
        direction TB
        C1["Đăng ký<br/>BYOC hoặc chọn dòng xe"]
        C2["Trả lệ phí"]
        C3["Nhận email<br/>mã check-in"]
        C1 --> C2 --> C3
    end

    subgraph Stf["Staff — ngày thi"]
        direction TB
        S1["Tra mã check-in"]
        S2["Kiểm tra xe<br/>hoặc giao xe"]
        S3["Nhập kết quả trận"]
        S4["Bấm đẩy người thắng"]
        S1 --> S2 --> S3 --> S4
    end

    P2 --> C1
    C2 --> C3
    C3 --> P4
    P4 --> S1
    S4 --> P5

    class P1,P2,P3,P4,P5,C1,C2,C3,S1,S2,S3 happy
    class S4 wait

    classDef happy fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef wait  fill:#fff4d6,stroke:#b8860b,color:#5c3c00
```

Ô màu vàng là bước còn phải làm tay và dễ quên — xem §9 mục 2.

---

## Reference

### Tài liệu liên quan
- `docs/developer/contest-delivery/07-contest-flow-audit.md` — bản rà soát mâu thuẫn, gồm phần M về các chế độ thi đấu
- `docs/spec/03-contest.md` — spec contest (⚠️ một số mục đã lệch với code, xem audit)
- `docs/spec/business-rules/BR-contest.md` — business rules (⚠️ BR-CT-031/031a/050/080/081/082 đang mô tả luồng đã bị gỡ bỏ)

### Legend
- **Frontend** = `rcfield-fe` (React + Vite + React Query)
- **API** = `rcfeild-be` (Express + TypeScript + TypeORM)
- `->>` gọi / request · `-->>` trả về
- `alt/else` nhánh điều kiện · `opt` bước có thể không xảy ra · `loop` lặp
- ⚠️ = phần chưa hoàn thiện, xem §9

---

*Last updated: 2026-08-02 · Đối chiếu trực tiếp với source `rcfeild-be`, không suy từ spec.*
