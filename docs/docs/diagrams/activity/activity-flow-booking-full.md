# Activity Flow: Booking Lifecycle (Full)

Mô tả toàn bộ luồng hoạt động — từ khi Customer chọn slot đến khi session kết thúc và thanh toán được quyết toán. Bao gồm tất cả nhánh: RENTAL / BYOC, thanh toán VNPay / gói slot, check-in, gia hạn, check-out không damage / có damage / dispute.

> Dựa trên code thực tế tại `booking.service.ts`, `payment.service.ts`, `session.service.ts`, `inspection.service.ts` và spec `02-state-machine.md`, `03-payment-engine.md`, `04-inspection-flow.md`.

---

## 0. Identifiers

| Field | Value | Ghi chú |
|-------|-------|---------|
| **Booking status** | `PENDING → CONFIRMED → COMPLETED / CANCELLED / NO_SHOW` | Mọi transition qua `booking.service.transition()` |
| **Session status** | `CHECKED_IN → ACTIVE → EXTENDING / CHECKING_OUT → COMPLETED` | |
| **Payment components** | `SLOT_FEE, RENTAL_FEE, SECURITY_DEPOSIT, FNB_PREORDER, EXTENSION_FEE, DAMAGE_CHARGE` | Status: `PENDING → HELD → DISBURSED / REFUNDED` |
| **Timeout: PENDING** | 30 phút | Cron auto-cancel, release Redis locks |
| **Timeout: NO_SHOW** | `slot_start + 30 phút` | Cron mark NO_SHOW nếu chưa có session |
| **Timeout: CHECKED_IN** | 15 phút | Auto-confirm check-in nếu customer không confirm |
| **Timeout: EXTENDING** | 10 phút | Auto-reject extension, quay lại ACTIVE |
| **Timeout: CHECKING_OUT (no damage)** | 2 giờ | Auto-confirm checkout |
| **Timeout: CHECKING_OUT (damage)** | 24 giờ | Auto-confirm damage charge |
| **Extension fee cap** | ≤ 50% `security_deposit` | Tổng tất cả extension fees trong 1 session |
| **Platform fee** | 15% trên consummated components | Không tính FNB on-site |
| **Checkout amount** | `total_charges − security_deposit` | Khách chỉ phải trả thêm phần chênh |

---

## 1. Đặt lịch — Tạo Booking

Customer bắt đầu từ trang cafe detail, chọn slot và hoàn tất checkout form.

```mermaid
flowchart TD
    A([Customer vào trang Cafe]) --> B[Chọn track và khung giờ]
    B --> C[Chọn ngày và slot thời gian]
    C --> D{Chế độ chơi?}

    D -->|RENTAL| E[Chọn xe thuê từ danh mục]
    D -->|BYOC| F[Kiểm tra chỗ trống BYOC\ncho slot đó]

    F --> G{Còn chỗ BYOC?}
    G -->|Không| FULL[❌ Slot BYOC đã đầy\nChọn giờ khác]
    G -->|Có| H

    E --> H[Điền số người tham gia\nvà thông tin companion]
    H --> I[Chọn F&B pre-order]
    I --> J{Dùng gói slot?}

    J -->|Có| K[Chọn gói slot còn hiệu lực\nvà đủ số slot cần dùng]
    J -->|Không| L

    K --> L[Xem tóm tắt thanh toán]
    L --> M[Xác nhận đặt lịch]

    M --> N[Gọi API tạo booking\nPOST /bookings]
    N --> N1{Đã có booking PENDING\ntrùng slot này?}
    N1 -->|Có — còn hiệu lực| N2[🔁 Trả về booking cũ]
    N1 -->|Có — đã hết hạn| N3[Hủy booking cũ\ntiếp tục tạo mới]
    N1 -->|Không| N4

    N3 --> N4[Kiểm tra hợp lệ:\ncafe đang hoạt động\nslot hợp lệ và chưa qua]

    N4 --> N5{Chế độ RENTAL?}
    N5 -->|Có| N6[Khóa slot xe\ntrên Redis]
    N6 --> N7{Khóa tất cả xe thành công?}
    N7 -->|Không — xe đã bị đặt| LOCK[❌ Slot xe không còn trống\nThử xe khác]
    N7 -->|Có| N8

    N5 -->|BYOC| N8

    N8[Lưu Booking vào DB\nParticipants, Vehicles, F&B\nvới giá snapshot tại thời điểm đặt]

    N8 --> N9[Gắn booking ID vào Redis lock]
    N9 --> OK201[✅ Booking PENDING\nhết hạn thanh toán: now + 30 phút]

    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    class FULL,LOCK error
    class N2,OK201 ok
```

---

## 2. Thanh toán

Sau khi booking PENDING được tạo, frontend ngay lập tức gọi checkout. Có 3 nhánh tuỳ theo trường hợp.

```mermaid
flowchart TD
    START([Booking PENDING\nvừa được tạo]) --> C1[Gọi API checkout\nPOST /bookings/:id/checkout]
    C1 --> C2{Còn trong hạn\nthanh toán?}
    C2 -->|Đã hết hạn| EXP[❌ Hủy booking\nGiải phóng khóa xe]
    C2 -->|Còn hạn| C3

    C3[Đọc dữ liệu từ DB:\nxe thuê, F&B pre-order, số người chơi]

    C3 --> C4[Tính tổng tiền:\nSlot × số người × hệ số giá ngày\nThuê xe + Đặt cọc + F&B]

    C4 --> C5{Dùng gói slot?}
    C5 -->|Có| C6[Miễn phí tiền slot\nTính: thuê xe + cọc + F&B]
    C5 -->|Không| C7[Tính tổng đầy đủ:\nSlot + thuê xe + cọc + F&B]

    C6 --> C8{Tổng tiền bằng 0?}
    C7 --> C9

    C8 -->|Có| ZT[Xác nhận trực tiếp\nKhông qua cổng thanh toán\nTrừ slot khỏi gói]
    ZT --> ZT2[✅ Booking CONFIRMED\nChuyển về trang booking của khách]

    C8 -->|Không| C9

    C9[Lưu snapshot giá vào booking\nđể đảm bảo giá không thay đổi]

    C9 --> ENV{Môi trường production?}

    ENV -->|Không| MOCK[Xác nhận giả lập\ncho môi trường dev/staging]

    ENV -->|Có| VNP[Tạo giao dịch thanh toán\nLưu mã tham chiếu vào DB]

    VNP --> VNP2[Tạo đường dẫn thanh toán VNPay\nKý chữ ký số HMAC-SHA512]
    VNP2 --> VNP3[🔀 Chuyển hướng trình duyệt → VNPay\nKhách chọn ngân hàng và xác nhận]

    VNP3 --> IPN([VNPay gọi callback IPN\nvề server])

    IPN --> IPN1{Chữ ký hợp lệ?}
    IPN1 -->|Không| IPN_ERR[❌ Từ chối yêu cầu\nChữ ký không khớp]

    IPN1 -->|Có| IPN2{Đã xử lý\ngiao dịch này rồi?}
    IPN2 -->|Rồi| IPN_IDEM[🔁 Bỏ qua\nTránh xử lý trùng]

    IPN2 -->|Chưa| IPN3{VNPay báo\nthanh toán thành công?}
    IPN3 -->|Không| IPN_FAIL[Ghi nhận thất bại\nBooking vẫn PENDING\nSẽ tự hủy khi hết giờ]

    IPN3 -->|Có| IPN4[Cập nhật giao dịch\nthành công]

    IPN4 --> IPN5{Thanh toán\ncho gói slot?}
    IPN5 -->|Có| PKG[Kích hoạt gói slot\nstatus → ACTIVE]

    IPN5 -->|Không| CONF[Xác nhận booking\nPENDING → CONFIRMED]
    CONF --> COMP[Tạo các thành phần thanh toán:\nSlot, Thuê xe, Đặt cọc → HELD\nF&B Pre-order → HELD]

    COMP --> PKG_DEDUCT{Booking dùng gói slot?}
    PKG_DEDUCT -->|Có| DEDUCT[Trừ số slot\nđã dùng khỏi gói]
    PKG_DEDUCT -->|Không| EMAIL

    DEDUCT --> EMAIL[Gửi email xác nhận\nvà hóa đơn cho khách]
    EMAIL --> DONE[✅ Booking CONFIRMED\nPhản hồi thành công về VNPay]

    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    class EXP,IPN_ERR,IPN_FAIL error
    class ZT2,MOCK,DONE,PKG ok
    class IPN_IDEM wait
```

---

## 3. Booking Lifecycle — Timeout & Cancel Paths

Sau khi booking CONFIRMED, có 3 con đường kết thúc: hoàn thành, huỷ, hoặc no-show.

```mermaid
flowchart TD
    PENDING([PENDING\nvừa tạo]) -->|"Cron sau 30 phút"| PT_TIMEOUT{Đã hết hạn\nthanh toán?}
    PT_TIMEOUT -->|Có| CANCEL_TIMEOUT[Tự động hủy booking\nGiải phóng khóa xe]
    PT_TIMEOUT -->|Không| PAYMENT_OK[IPN xác nhận\nthanh toán thành công]
    PAYMENT_OK --> CONFIRMED([CONFIRMED\nchờ check-in])

    CONFIRMED -->|"Cron: 30 phút sau giờ bắt đầu\nchưa có session nào"| NOSHOW([NO_SHOW])

    CONFIRMED -->|Staff scan QR| CHECKIN[Tạo Session\nbắt đầu check-in]
    CHECKIN --> SESSIONS["... session diễn ra ..."]
    SESSIONS -->|Tất cả sessions hoàn thành| COMPLETED([COMPLETED\nĐã quyết toán])

    CONFIRMED -->|"Customer huỷ"| CUST_CANCEL{Thời điểm huỷ?}
    CUST_CANCEL -->|"Hơn 24h trước giờ chơi"| R1A["Hoàn tiền 100%\nSlot + Thuê xe\nHủy đặt cọc"]
    CUST_CANCEL -->|"2h – 24h trước giờ chơi"| R1B["Hoàn tiền 50%\nSlot + Thuê xe\nHủy đặt cọc"]
    CUST_CANCEL -->|"Dưới 2h trước giờ chơi"| R1C["Không hoàn tiền\nSlot + Thuê xe\nHủy đặt cọc"]

    CONFIRMED -->|"Provider huỷ\nbất kỳ thời điểm nào"| PROV_CANCEL["Hoàn tiền 100%\nToàn bộ: slot + thuê xe + cọc + F&B"]

    R1A --> CANCELLED([CANCELLED])
    R1B --> CANCELLED
    R1C --> CANCELLED
    PROV_CANCEL --> CANCELLED

    classDef terminal fill:#e8ecf0,stroke:#5d6d7e,color:#2c3e50,font-weight:bold
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f,font-weight:bold
    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f,font-weight:bold
    classDef warn fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    class CANCELLED,CANCEL_TIMEOUT,NOSHOW error
    class COMPLETED ok
    class CONFIRMED,PENDING terminal
```

---

## 4. Check-in — Tạo Session

Staff scan QR code hoặc nhập booking code của Customer. Flow khác nhau giữa RENTAL và BYOC.

```mermaid
flowchart TD
    START([Staff đón khách\ntại quầy]) --> SCAN[Scan QR hoặc nhập mã booking]
    SCAN --> VAL["Kiểm tra booking<br/>POST /sessions/check-in"]

    VAL --> V1{Booking tồn tại\nvà đã CONFIRMED?}
    V1 -->|Không| ERR1[❌ Không tìm thấy booking\nhoặc chưa thanh toán]

    V1 -->|Có| V2{Booking thuộc chi nhánh\ncủa staff?}
    V2 -->|Không| ERR2[❌ Không có quyền\ncheck-in booking này]

    V2 -->|Có| V3{Đúng khung giờ\ncheck-in?}
    V3 -->|Chưa đến giờ| ERR3[❌ Chưa đến giờ chơi]
    V3 -->|Quá giờ — đã NO_SHOW| ERR4[❌ Đã quá giờ check-in]
    V3 -->|Trong khung giờ| CREATE

    CREATE[Tạo Session CHECKED_IN\nSao chép danh sách người chơi]

    CREATE --> MODE{Chế độ chơi?}

    MODE -->|RENTAL| R_VEHICLE[Cập nhật trạng thái xe\nAVAILABLE → IN_USE]

    MODE -->|BYOC| B_VEHICLE[Xác nhận xe BYOC của khách\nhoặc đăng ký xe mới tại chỗ]

    R_VEHICLE --> PHOTO[Staff chụp 4 ảnh xe\ntrước khi bắt đầu chơi]
    B_VEHICLE --> PHOTO

    PHOTO --> CHECKLIST[Staff điền checklist\nkiểm tra tình trạng xe]
    CHECKLIST --> INSPECT_DB[Lưu kết quả kiểm tra\nvào inspection record]

    INSPECT_DB --> CUST_CONFIRM[Thông báo cho khách\nXem ảnh và xác nhận tình trạng xe]

    CUST_CONFIRM --> WAIT{Khách xác nhận\ntrong 15 phút?}
    WAIT -->|Khách xác nhận| ACTIVE
    WAIT -->|Hết 15 phút — tự động xác nhận| ACTIVE

    ACTIVE[Session → ACTIVE\nKhách bắt đầu chơi 🏁]

    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    class ERR1,ERR2,ERR3,ERR4 error
    class ACTIVE ok
    class WAIT wait
```

---

## 5. Trong Session — F&B Order & Gia Hạn

Hai hoạt động có thể xảy ra song song trong khi session đang ACTIVE.

```mermaid
flowchart LR
    ACTIVE([Session ACTIVE]) --> FNB_PATH & EXT_PATH

    subgraph FNB_PATH["F&B Order On-Site"]
        direction TB
        F1[Khách gọi đồ uống hoặc đồ ăn]
        F2["Staff ghi nhận order<br/>POST /sessions/:id/fnb-orders"]
        F3[Lưu FnbOrder với giá\ntại thời điểm gọi món]
        F4[Staff phục vụ món\nKhách thanh toán trực tiếp cho quán]
        F5["Staff cập nhật trạng thái giao món<br/>PATCH /fnb-orders/:id"]
        F6[✅ FnbOrder DELIVERED\nKhông qua platform payment]
        F1 --> F2 --> F3 --> F4 --> F5 --> F6
    end

    subgraph EXT_PATH["Gia Hạn Giờ Chơi"]
        direction TB
        E1[Gần hết giờ\nStaff đề xuất gia hạn]
        E2["Tạo đề xuất gia hạn<br/>POST /sessions/:id/extensions"]
        E3{Phí gia hạn\nnằm trong giới hạn cho phép?}
        E4[❌ Vượt quá giới hạn\nKhông được gia hạn thêm]
        E5[Session → EXTENDING\nThông báo để khách quyết định]
        E6{Khách phản hồi\ntrong 10 phút?}
        E7_A[Khách đồng ý]
        E7_B[Khách từ chối\nhoặc hết 10 phút]
        E8_A[Ghi nhận phí gia hạn\nCập nhật thời gian kết thúc]
        E8_B[Hủy đề xuất gia hạn]
        E9[Session → ACTIVE]

        E1 --> E2 --> E3
        E3 -->|Không| E4
        E3 -->|Có| E5
        E5 --> E6
        E6 --> E7_A & E7_B
        E7_A --> E8_A --> E9
        E7_B --> E8_B --> E9
    end

    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    class F6 ok
    class E4 error
    class E6 wait
```

---

## 6. Check-out & Settlement

Staff khởi động check-out khi Customer chuẩn bị rời sân. Có 3 nhánh: không damage, có damage, Customer khiếu nại.

```mermaid
flowchart TD
    ACTIVE([Session ACTIVE]) --> CO1[Staff bắt đầu check-out\nPOST /sessions/:id/check-out]
    CO1 --> CO2[Session → CHECKING_OUT]

    CO2 --> CO3[Staff chụp ảnh xe sau buổi chơi\nvà điền checklist kiểm tra]

    CO3 --> CO4{Phát hiện hư hỏng?}

    CO4 -->|Không| ND1[Xác nhận không có hư hỏng]
    ND1 --> ND2[Thông báo cho khách\nyêu cầu xác nhận trả xe]
    ND2 --> ND3{Khách xác nhận\ntrong 2 giờ?}
    ND3 -->|Xác nhận hoặc hết giờ| ND4[Quyết toán — không hư hỏng]

    CO4 -->|Có| D1[Điền checklist hư hỏng\nvà ước tính chi phí sửa chữa]
    D1 --> D2[Tính phí hư hỏng\ntheo hệ số đòn bẩy của xe]
    D2 --> D3[Gửi bằng chứng cho khách\nẢnh trước/sau + số tiền phạt]
    D3 --> D4{Khách phản hồi\ntrong 24 giờ?}

    D4 -->|Chấp nhận hoặc hết giờ| DA[Ghi nhận phí hư hỏng\nQuyết toán — có hư hỏng]
    D4 -->|Khiếu nại| DISP[Tạo ticket khiếu nại\nAdmin hoặc Provider xem xét]
    DISP --> DISP2{Kết quả giải quyết?}
    DISP2 -->|Xác nhận hư hỏng| DA
    DISP2 -->|Bỏ qua — không phạt| ND4

    ND4 --> SETTLE_ND[Quyết toán: Không Hư Hỏng]
    DA --> SETTLE_D[Quyết toán: Có Hư Hỏng]

    subgraph SETTLE_ND["Quyết toán: Không Hư Hỏng"]
        direction TB
        S1[Số tiền thu thêm = Tổng phí − Tiền cọc]
        S2[Tổng phí = Slot + Thuê xe + Gia hạn + F&B]
        S3[Thu số tiền còn lại qua cổng thanh toán]
        S4[Giải ngân cho Provider\nHoàn trả tiền cọc cho khách]
        S5[Tính phí nền tảng 15%\ntrên các khoản đã thực hiện]
        S1 --> S2 --> S3 --> S4 --> S5
    end

    subgraph SETTLE_D["Quyết toán: Có Hư Hỏng"]
        direction TB
        SD1[Số tiền thu thêm = Tổng phí − Tiền cọc\nCộng thêm phí hư hỏng]
        SD2[Thu số tiền còn lại]
        SD3[Cọc đủ bù hư hỏng:\nPhần bù → Provider\nPhần thừa → hoàn khách]
        SD4[Cọc không đủ:\nThu thêm từ khách\nToàn bộ cọc → Provider]
        SD1 --> SD2 --> SD3
        SD2 --> SD4
    end

    SETTLE_ND --> DONE1[Xe trở về trạng thái sẵn sàng\nIN_USE → AVAILABLE]
    SETTLE_D --> DONE1
    DONE1 --> DONE2[Session → COMPLETED]
    DONE2 --> DONE3{Tất cả sessions\ncủa booking đã xong?}
    DONE3 -->|Có| BOOKING_DONE[Booking → COMPLETED ✅]
    DONE3 -->|Chưa| WAIT_MORE[Chờ các session còn lại]

    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef ok fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef wait fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    classDef money fill:#e8f4fd,stroke:#1a5276,color:#1a5276
    class BOOKING_DONE ok
    class DISP wait
    class SETTLE_ND,SETTLE_D money
```

---

## 7. Payment Component Lifecycle

Vòng đời của từng PaymentComponent — từ khi tạo đến khi quyết toán.

```mermaid
flowchart LR
    subgraph AT_CONFIRM["Khi Booking CONFIRMED"]
        direction TB
        C1[SLOT_FEE → PENDING]
        C2[RENTAL_FEE mỗi xe → PENDING]
        C3[SECURITY_DEPOSIT mỗi xe → HELD]
        C4[FNB_PREORDER → PENDING]
    end

    subgraph IN_SESSION["Trong Session ACTIVE"]
        direction TB
        C5[EXTENSION_FEE → PENDING\nkhi khách duyệt gia hạn]
        C6[DAMAGE_CHARGE → PENDING\nkhi checkout phát hiện hư hỏng]
    end

    subgraph AT_SETTLE["Khi Session COMPLETED"]
        direction TB
        S1["SLOT_FEE → DISBURSED\nGiải ngân cho Provider"]
        S2["RENTAL_FEE → DISBURSED\nGiải ngân cho Provider"]
        S3A["SECURITY_DEPOSIT → DISBURSED\nProvider nhận (nếu bù hư hỏng)"]
        S3B["SECURITY_DEPOSIT → REFUNDED\nHoàn khách (nếu không hư hỏng\nhoặc cọc dư)"]
        S4["FNB_PREORDER → DISBURSED\nGiải ngân cho Provider"]
        S5["EXTENSION_FEE → DISBURSED\nGiải ngân cho Provider (nếu có)"]
        S6["DAMAGE_CHARGE → DISBURSED\nGiải ngân cho Provider (nếu có)"]
    end

    AT_CONFIRM --> IN_SESSION
    IN_SESSION --> AT_SETTLE

    subgraph CANCEL_PATH["Khi Booking CANCELLED"]
        direction TB
        R1["SLOT_FEE → Không thu\nHoàn theo quy tắc R1/R2"]
        R2["RENTAL_FEE → Không thu\nHoàn theo quy tắc R1/R2"]
        R3["SECURITY_DEPOSIT → REFUNDED\nHủy hold, hoàn lại khách"]
        R4["FNB_PREORDER → Không thu"]
    end

    classDef held fill:#fff4d6,stroke:#b8860b,color:#5c3c00
    classDef disbursed fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef refunded fill:#e8f4fd,stroke:#1a5276,color:#1a5276
    classDef pending fill:#f8f9fa,stroke:#6c757d,color:#495057
```

---

## 8. Tổng quan trạng thái — Quick Reference

### Booking States

| State | Từ | Sang | Trigger |
|-------|-----|------|---------|
| `PENDING` | — | `CONFIRMED` | IPN vnp_ResponseCode=00 |
| `PENDING` | — | `CANCELLED` | Timeout 30 phút (cron) |
| `CONFIRMED` | — | `NO_SHOW` | slot_start+30m, không có session (cron) |
| `CONFIRMED` | — | `CANCELLED` | Customer/Provider cancel |
| `CONFIRMED` | — | `COMPLETED` | Tất cả sessions COMPLETED |

### Session States

| State | Từ | Sang | Trigger |
|-------|-----|------|---------|
| `CHECKED_IN` | — | `ACTIVE` | Customer confirm baseline (hoặc timeout 15m) |
| `ACTIVE` | — | `EXTENDING` | Staff đề xuất gia hạn |
| `ACTIVE` | — | `CHECKING_OUT` | Staff bấm check-out |
| `EXTENDING` | — | `ACTIVE` | Customer approve/reject (hoặc timeout 10m) |
| `CHECKING_OUT` | — | `COMPLETED` | Customer confirm checkout (hoặc timeout 2h/24h) |

### Refund Rules Summary

| Tình huống | SLOT_FEE | RENTAL_FEE | DEPOSIT |
|-----------|----------|------------|---------|
| Customer huỷ > 24h trước | 100% | 100% | void |
| Customer huỷ 2h–24h trước | 50% | 50% | void |
| Customer huỷ < 2h trước | 0% | 0% | void |
| Provider huỷ (bất kỳ lúc) | 100% | 100% | void |
| No-show (Customer) | 0% | 0% | void |
| Checkout — không hư hỏng | N/A | N/A | REFUNDED |
| Checkout — có hư hỏng | N/A | N/A | Partially/Fully DISBURSED |

---

## Reference

### Spec docs
- `docs/spec/02-state-machine.md` — Booking & Session state transitions chi tiết
- `docs/spec/03-payment-engine.md` — Payment components, settlement, refund rules (R1/R2/R3)
- `docs/spec/04-inspection-flow.md` — Check-in / Check-out protocol, ảnh evidence

### Sequence diagrams liên quan
- `docs/diagrams/sequence/sequence-flow-booking-lifecycle.md` — Create booking, VNPay IPN, cancel
- `docs/diagrams/sequence/sequence-flow-booking-operations.md` — Check-in, F&B, extension, checkout

### Source code
- `rcfeild-be/src/services/booking.service.ts` — `createBooking`, `cancelBooking`, `transition`
- `rcfeild-be/src/services/payment.service.ts` — `createCheckoutUrl`, `processConfirmation`, settlement
- `rcfeild-be/src/services/session.service.ts` — `createSession`, `checkout`, `settle`
- `rcfeild-be/src/services/inspection.service.ts` — Inspection evidence, checklist
- `rcfeild-be/src/jobs/booking-timeout.job.ts` — Cron: PENDING timeout, NO_SHOW detection

### Naming Convention
- **Action nodes** `[...]`: Cụm động từ ngắn gọn — mô tả **việc gì xảy ra**, không có code syntax
- **Decision nodes** `{...}`: Câu hỏi Yes/No bằng ngôn ngữ tự nhiên — không dùng tên biến
- **Terminal nodes** `([...])`: Tên trạng thái (enum value) giữ nguyên tiếng Anh vì là hằng số hệ thống
- **Edge labels**: Điều kiện ngắn (`Có`, `Không`, `Hết giờ`, `Xác nhận`)

### Legend
- `[Rectangle]` = Action / Step
- `{Diamond}` = Decision point
- `([Rounded])` = Start / End state
- ✅ = Terminal success state
- ❌ = Terminal error / rejection
- 🔁 = Idempotent return

---

*Last updated: 2026-06-21 · Based on: 02-state-machine.md, 03-payment-engine.md, 04-inspection-flow.md, booking.service.ts, payment.service.ts*
