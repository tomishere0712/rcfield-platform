# Business Rules — RCField

**Last updated**: 2026-07-07
**Status**: Active

> Mỗi file trong thư mục này chứa business rules cho 1 domain.
> Khi nghiệp vụ thay đổi trong quá trình phát triển, chỉ cần sửa file domain tương ứng.

---

## Danh sách files

| File | Domain | Số rules |
|------|--------|---------|
| [BR-booking.md](./BR-booking.md) | Đặt lịch, huỷ, eligibility | — |
| [BR-fleet.md](./BR-fleet.md) | Xe, tier, trạng thái fleet | — |
| [BR-payment.md](./BR-payment.md) | Thanh toán, hoàn tiền, phí | — |
| [BR-inspection.md](./BR-inspection.md) | Check-in / check-out, bằng chứng | — |
| [BR-extension.md](./BR-extension.md) | Gia hạn slot | — |
| [BR-fnb.md](./BR-fnb.md) | F&B pre-order và on-site | — |
| [BR-dispute.md](./BR-dispute.md) | Incident policy resolution Phase 1; dispute workflow nhiều bên Phase 2 | — |
| [BR-booking-lifecycle.md](./BR-booking-lifecycle.md) | Luồng booking end-to-end: đặt giờ, thuê xe, check-in, F&B, extension, checkout | — |
| [BR-contest.md](./BR-contest.md) | Provider-level contest, tournament, race event, local leaderboard, race-record sync guard | — |
| [BR-racing-network.md](./BR-racing-network.md) | Universal Racing Network, Driver Passport, verified global leaderboard, achievements, series, team war | — |
| [BR-revenue-payment-provider.md](./BR-revenue-payment-provider.md) | Doanh thu chi nhánh, commission, payout provider, lý do không làm ví Phase 1 | — |
| [consolidated-rules.md](./consolidated-rules.md) | **Tổng hợp toàn bộ 224 quy tắc nghiệp vụ hệ thống** | 224 |

---

## Format mỗi rule

```
**BR-[DOMAIN]-[NNN]** — Tên rule ngắn
IF: điều kiện
THEN: hành động / kết quả
NOTE: lý do hoặc edge case (nếu cần)
```

## Liên kết với spec kỹ thuật

- State machine → `docs/spec/02-state-machine.md`
- Payment engine → `docs/spec/03-payment-engine.md`
- Inspection protocol → `docs/spec/04-inspection-flow.md`
- Domain model / enums → `docs/spec/01-domain-model.md`