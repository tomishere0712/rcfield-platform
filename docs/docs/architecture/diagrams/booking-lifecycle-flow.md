# Booking Lifecycle Flow — Case A (RENTAL)

> Happy path đi thẳng xuống. Nhánh rẽ phải là unhappy / edge case.
>
> **Thanh toán 2 bước:**
> - Khi confirm: charge **cọc** (15% giá trị xe) → HELD
> - Khi checkout: charge **tổng chi phí − cọc** = số tiền thực tế phải trả
> - Không có refund trong luồng thông thường

```mermaid
flowchart TD
    START([Customer chọn\nslot + xe + F&B]) --> B1

    subgraph PH1 [Phase 1 — Tạo Booking]
        B1[bookings: status=PENDING] --> B2
        B2["payment_components\n──────────────────────────────────\nSLOT_FEE:         50k  PENDING ┐\nRENTAL_FEE:      300k  PENDING ├── ghi nhận, tính vào checkout\nFNB_PREORDER:     60k  PENDING ┘\nSECURITY_DEPOSIT: 300k PENDING ← 15% giá trị xe (2M)\n                                  charge NGAY khi confirm"]
    end

    B2 --> PH2_GW

    subgraph PH2 ["Phase 2 — Thanh toán cọc"]
        PH2_GW{"Charge CỌC 300k\nqua gateway\n30 phút"}
        PH2_GW -->|✓ SUCCESS| PH2_OK["txn-001: PAYMENT 300k\nSECURITY_DEPOSIT: PENDING → HELD\nbooking → CONFIRMED"]
        PH2_GW -->|✗ Timeout / Fail| PH2_FAIL(["booking → CANCELLED\nDeposit chưa charged\nKhông cần xử lý gì"])
    end

    PH2_OK --> PH3_Q

    subgraph PH3 [Phase 3 — Check-in]
        PH3_Q{Khách đến\ntrong 30 phút?}
        PH3_Q -->|✗ No-show| NOSHOW(["booking → NO_SHOW\n─────────────────────\nSlot fee (50k): phạt, giữ lại\nRental + FNB: huỷ\nDeposit (300k): hoàn (300k > 50k)\n─────────────────────\ntxn: REFUND 250k\n(300k deposit − 50k phạt)"])
        PH3_Q -->|✓ Check-in| PH3_IN["session → CHECKED_IN\nInspection CHECK_IN\nChụp 4 góc xe → CDN"]
        PH3_IN --> PH3_CFM{Customer confirm\n15 phút / auto}
        PH3_CFM --> PH3_ACTIVE[session → ACTIVE]
    end

    PH3_ACTIVE --> PH4_EVT

    subgraph PH4 [Phase 4 — Session đang chạy]
        PH4_EVT{Sự kiện?}
        PH4_EVT -->|Gia hạn| PH4_EXT["ExtensionProposal approved\nEXTENSION_FEE: 75k PENDING\nplanned_end_at +30m"]
        PH4_EXT --> PH4_EVT
        PH4_EVT -->|F&B tại quán| PH4_FNB["FnbOrder ON_SITE\nTiền mặt tại quán\nNgoài platform"]
        PH4_FNB --> PH4_EVT
        PH4_EVT -->|Check-out| PH5_INSP
    end

    subgraph PH5 ["Phase 5 — Check-out: thanh toán tổng − cọc"]
        PH5_INSP[Inspection CHECK_OUT\nStaff kiểm tra xe] --> PH5_Q{Damage?}

        PH5_Q -->|✗ Không có| PH5_CLEAN["Tổng = 50+300+60+75 = 485k\nCheckout = 485k − 300k cọc = 185k\n────────────────────────────\ntxn-002: CAPTURE 185k\nAll components → DISBURSED → Provider\nSECURITY_DEPOSIT → applied (credited)\n────────────────────────────\nKhách trả tổng: 300k + 185k = 485k ✓"]

        PH5_Q -->|✓ Có damage| PH5_AGR{Customer\nđồng ý?}

        PH5_AGR -->|✓ Đồng ý| PH5_DMG["Damage = cost × multiplier = 300k\nTổng = 485k + 300k = 785k\nCheckout = 785k − 300k cọc = 485k\n────────────────────────────\ntxn-002: CAPTURE 485k\nAll components + DAMAGE_CHARGE → DISBURSED\nSECURITY_DEPOSIT → applied (credited)\n────────────────────────────\nKhách trả tổng: 300k + 485k = 785k ✓"]

        PH5_AGR -->|✗ Tranh chấp| PH5_DISP["disputes → OPEN\nSECURITY_DEPOSIT: vẫn HELD\nAdmin xem ảnh check-in vs check-out"]

        PH5_DISP -->|Admin: Provider win| PH5_DP["Tổng = 485k + 300k damage\nCheckout = 785k − 300k = 485k\ntxn-002: CAPTURE 485k"]
        PH5_DISP -->|Admin: Customer win| PH5_DC["Tổng = 485k (không tính damage)\nCheckout = 485k − 300k = 185k\ntxn-002: CAPTURE 185k\nDeposit: VOID (không dùng cho damage)"]
    end

    PH5_CLEAN --> DONE
    PH5_DMG --> DONE
    PH5_DP --> DONE
    PH5_DC --> DONE
    DONE(["session/booking → COMPLETED\nReviews mở khoá"])

    style PH2_FAIL fill:#fee2e2,stroke:#ef4444
    style NOSHOW fill:#fee2e2,stroke:#ef4444
    style PH5_CLEAN fill:#dcfce7,stroke:#22c55e
    style DONE fill:#dcfce7,stroke:#22c55e
    style PH5_DISP fill:#fef9c3,stroke:#eab308
```

---

## Công thức thanh toán

```
checkout_amount = tổng_chi_phí − security_deposit

tổng_chi_phí = SLOT_FEE + RENTAL_FEE + FNB_PREORDER + EXTENSION_FEE + DAMAGE_CHARGE (nếu có)
```

| Case | Tổng chi phí | − Cọc (300k) | Checkout | Tổng khách trả |
|---|---|---|---|---|
| Không damage, không ext | 410k | −300k | **110k** | 300+110 = 410k |
| Không damage, có ext 75k | 485k | −300k | **185k** | 300+185 = 485k |
| Có damage 300k, có ext | 785k | −300k | **485k** | 300+485 = 785k |

> Deposit luôn được khấu trừ 1-1 vào tổng. Không có VOID, không có REFUND trong luồng thông thường.
> Ngoại lệ: No-show → deposit > phạt slot_fee → hoàn phần chênh lệch.

## Nguyên tắc deposit

| Rule | Mô tả |
|---|---|
| Công thức | `security_deposit = vehicle.market_value × 15%` |
| Ví dụ | Xe 2,000,000đ → deposit 300,000đ |
| Snapshot | `booking_vehicles.security_deposit_snapshot` — cố định tại thời điểm đặt |
| Không áp dụng discount | Deposit thu đủ, không giảm giá |
| Extension cap | `max_extension_fee = security_deposit × 50%` |

## File liên quan

- [`booking-data-flow.md`](./booking-data-flow.md) — chi tiết từng bảng DB per phase
- [`docs/spec/03-payment-engine.md`](../../spec/03-payment-engine.md) — payment rules, damage charge, platform fee
