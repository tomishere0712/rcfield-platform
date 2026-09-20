# ADR-001 — Mô hình Tenant & UI: B2B SaaS Chuỗi Chi Nhánh

**Ngày tạo**: 2026-05-11
**Cập nhật**: 2026-05-13
**Trạng thái**: ✅ ĐÃ CHỐT
**Người quyết định**: Team RCField + Mentor

---

## Lịch sử cân nhắc

Team đã đi qua 3 mô hình trước khi chốt:

| Mô hình | Mô tả | Lý do loại |
|---------|-------|-----------|
| A — Marketplace | Nhiều Provider độc lập cạnh tranh trên sàn chung | Không đúng thực tế — chỉ có 1 doanh nghiệp |
| B — SaaS per-tenant | Mỗi sân có subdomain riêng | Quá phức tạp, không cần thiết |
| C — Hybrid | Marketplace + dashboard riêng per Provider | Vẫn còn multi-Provider, không đúng mô hình |

---

## Quyết định cuối — Mô hình D: B2B SaaS Chuỗi Chi Nhánh

RCField là **phần mềm B2B bán cho 1 doanh nghiệp** vận hành chuỗi sân xe RC.

```
RCField (phần mềm)
└── Bán/cho thuê cho 1 doanh nghiệp RC (tenant)
    └── Doanh nghiệp đó có nhiều chi nhánh (branches)
        ├── Chi nhánh A — config riêng (giá, fleet, menu F&B)
        ├── Chi nhánh B — config riêng
        └── Chi nhánh C — config riêng
```

**Không phải marketplace** — không có nhiều doanh nghiệp cạnh tranh trên cùng platform.
**Không phải per-tenant subdomain** — tất cả chi nhánh dùng chung 1 app, 1 domain.

Giống mô hình **chuỗi** (Starbucks, McDonald's) hơn là Shopee hay Airbnb.

---

## Lý do chọn Mô hình D

1. **Mentor confirm**: Multi-branch management system phù hợp thực tế thị trường
2. **Business model**: RCField bán phần mềm cho 1 doanh nghiệp — nếu họ nghỉ thì chuyển sang doanh nghiệp khác
3. **Discovery vẫn có**: Customer tìm "chi nhánh gần tôi" → thấy tất cả chi nhánh cùng thương hiệu
4. **Mỗi chi nhánh config riêng**: Giá xe, fleet, menu F&B, contest settings có thể khác nhau

---

## Role Structure (4 roles — giữ nguyên tên)

| Role | Là ai | Quản lý gì |
|------|-------|-----------|
| **ADMIN** | Team RCField (bên bán phần mềm) | Bật/tắt feature, monitor hệ thống, quản lý tenant |
| **PROVIDER** | Chủ doanh nghiệp RC | Tất cả chi nhánh, báo cáo tổng hợp toàn chuỗi |
| **STAFF** | Nhân viên từng chi nhánh | Vận hành chi nhánh được assign (check-in/out, F&B, gia hạn) |
| **CUSTOMER** | Khách đặt lịch chơi xe | Tìm chi nhánh gần nhất, đặt xe, thanh toán |

---

## Tác động kiến trúc

- **Database**: Shared DB — entity `Cafe` = chi nhánh, vẫn có `provider_id` nhưng chỉ 1 Provider active
- **Discovery**: `GET /cafes` trả về tất cả chi nhánh của chuỗi, filter theo khu vực
- **Config per branch**: Mỗi Cafe có giá riêng, fleet riêng, menu F&B riêng
- **PROVIDER dashboard**: Aggregate toàn chuỗi + drill-down từng chi nhánh
- **ADMIN dashboard**: Feature flag management, system health monitoring

---

## Phase 2 (đã ghi nhận)

- Chat widget nhúng vào trang từng chi nhánh
- Webhook tích hợp Zalo / Facebook Messenger để booking qua chat
- Contest management (single-branch và multi-branch)

---

## Những gì KHÔNG thay đổi

- Tên các role: CUSTOMER, PROVIDER, STAFF, ADMIN
- Booking lifecycle, payment engine, inspection flow, F&B model
- Entity names: Cafe, Vehicle, Booking, PaymentComponent, Inspection, Dispute

---

*Tạo: 2026-05-11 · Chốt: 2026-05-13 · Confirmed by: Mentor*
