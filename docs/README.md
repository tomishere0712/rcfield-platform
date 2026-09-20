# RCField Documentation & Specifications 📚📐

Tài liệu kỹ thuật và đặc tả nghiệp vụ cho toàn bộ nền tảng **RCField**. Đây là **source of truth** cho business logic, domain model, state machines, và API contracts giữa Backend, Web Frontend và Mobile.

> **Nguyên tắc**: Spec sống cùng code trong cùng monorepo `rcfield-platform`. Mọi thay đổi về nghiệp vụ đều được phản ánh qua các tài liệu đặc tả tương ứng.

---

## 📂 Cấu trúc Thư mục Tài liệu

```text
docs/
├── spec/                        # Kiến trúc và nghiệp vụ cốt lõi
│   ├── 00-overview.md           # Tổng quan đề tài, actors, phạm vi nghiệp vụ
│   ├── 01-domain-model.md       # Entity, quan hệ dữ liệu, enums
│   ├── 02-state-machine.md      # Booking lifecycle, timeout rules, event triggers
│   ├── 03-payment-engine.md     # Quy tắc ledger thanh toán, đối soát, hoàn tiền
│   ├── 04-inspection-flow.md    # Giao thức bàn giao xe và biên bản ảnh check-in/out
│   └── 05-api-contracts.md      # Đặc tả danh sách API endpoints, request & response
├── specs/                       # 19 Feature Specs chi tiết (từ 001 đến 019)
│   ├── 001-user-login/          # Xác thực & phân quyền RBAC
│   ├── 007-booking-payment/     # Đặt lịch & cổng thanh toán
│   ├── 015-booking-qr-checkin/  # Quét mã QR check-in tại quầy
│   ├── 016-contest-booking/     # Tổ chức giải đấu & đăng ký thi đấu
│   ├── 019-cafe-bank-payment/   # Thanh toán chuyển khoản ngân hàng theo chi nhánh
│   └── ...
├── diagrams/                    # Sơ đồ quan hệ thực thể (ERD) và tuần tự (Sequence)
└── website/                     # Cấu hình tài liệu hiển thị dạng Docusaurus (nếu có)
```

---

## 🎯 Các tài liệu quan trọng cần tham khảo

| Tài liệu | Nội dung chính |
| :--- | :--- |
| **[00-overview.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/00-overview.md)** | Bối cảnh dự án, mô hình SaaS multi-tenant, 4 vai trò người dùng |
| **[01-domain-model.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/01-domain-model.md)** | Cấu trúc dữ liệu 70 bảng, quan hệ thực thể, ràng buộc nghiệp vụ |
| **[02-state-machine.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/02-state-machine.md)** | Vòng đời trạng thái booking (Pending -> Confirmed -> Active -> Completed) |
| **[03-payment-engine.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/03-payment-engine.md)** | Cơ chế tính cước, phân tách cổng thanh toán PayOS/VNPay và VietQR chi nhánh |
| **[04-inspection-flow.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/04-inspection-flow.md)** | Quy trình chụp ảnh 4 góc bàn giao xe, ngăn chặn tranh chấp hư hỏng |
| **[05-api-contracts.md](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs/docs/spec/05-api-contracts.md)** | Hợp đồng API chuẩn giữa Backend và các ứng dụng Frontend/Mobile |
