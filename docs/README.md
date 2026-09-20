# RCField Documentation & Specifications 📚📐

Tài liệu kỹ thuật và đặc tả nghiệp vụ cho toàn bộ nền tảng **RCField**. Đây là **source of truth** cho business logic, domain model, state machines, và API contracts giữa Backend, Web Frontend và Mobile.

> **Nguyên tắc**: Spec sống cùng code trong cùng monorepo `rcfield-platform`. Mọi thay đổi về nghiệp vụ đều được phản ánh qua các tài liệu đặc tả tương ứng.

---

## 📂 Cấu trúc Thư mục Tài liệu

```text
docs/
├── docs/                               # Tài liệu nghiệp vụ & kiến trúc hệ thống
│   ├── spec/                           # Đặc tả cốt lõi
│   │   ├── 00-overview.md              # Bối cảnh đề tài, actors, phạm vi nghiệp vụ Phase 1 & 2
│   │   ├── 01-domain-model.md          # Entity, quan hệ dữ liệu, enums
│   │   ├── 02-state-machine.md         # Vòng đời trạng thái booking, timeout rules, event triggers
│   │   ├── 03-payment-engine.md        # Quy tắc ledger thanh toán, đối soát, hoàn tiền
│   │   ├── 04-inspection-flow.md       # Giao thức bàn giao xe và biên bản ảnh check-in/out
│   │   ├── 05-api-contracts.md         # Đặc tả API endpoints, request & response
│   │   ├── 06-database.md              # CSDL 70 bảng vận hành, ràng buộc & migrations
│   │   ├── 07-image-upload.md          # Tích hợp Cloudinary lưu trữ ảnh inspection
│   │   ├── 08-vnpay-booking-flow.md    # Luồng thanh toán trực tuyến qua cổng VNPay
│   │   ├── 09-plan-for-mobile.md       # Đặc tả màn hình và luồng cho ứng dụng Mobile
│   │   └── business-rules/             # 13 tài liệu Business Rules chi tiết (booking, payment, fleet, contest...)
│   ├── architecture/                   # Kiến trúc hệ thống & AI Chatbot RAG
│   ├── diagrams/                       # Sơ đồ thực thể ERD, Activity, Screen Flow & Sequence Diagrams
│   ├── developer/                      # Hướng dẫn kỹ thuật (demo chuyển khoản, contest delivery, minh chứng đóng góp...)
│   └── adr/                            # Architecture Decision Records (ADR 001, 002)
├── specs/                              # 21 Feature Specs chi tiết (từ 001-user-login đến 019-cafe-bank-payment)
│   ├── 001-user-login/                 # Xác thực & phân quyền RBAC
│   ├── 002-branch-ai-chat-rag/         # Chatbot AI tư vấn sân & gợi ý slot chơi
│   ├── 007-booking-payment/            # Đặt lịch & thanh toán slot
│   ├── 015-booking-qr-checkin/         # Quét mã QR check-in tại quầy
│   ├── 016-contest-booking-rental/     # Tổ chức giải đấu & xe thuê giải đấu
│   ├── 018-contest-finance/            # Sổ cái tài chính giải đấu
│   └── 019-cafe-bank-payment/          # Thanh toán chuyển khoản ngân hàng theo chi nhánh (VietQR)
└── website/                            # Docusaurus documentation website
```

---

## 🎯 Các tài liệu quan trọng cần tham khảo

| Tài liệu | Đường dẫn | Nội dung chính |
| :--- | :--- | :--- |
| **Project Overview** | [00-overview.md](docs/spec/00-overview.md) | Bối cảnh dự án, mô hình SaaS multi-tenant, 4 vai trò người dùng |
| **Domain Model** | [01-domain-model.md](docs/spec/01-domain-model.md) | Cấu trúc dữ liệu 70 bảng, quan hệ thực thể, ràng buộc nghiệp vụ |
| **State Machine** | [02-state-machine.md](docs/spec/02-state-machine.md) | Vòng đời trạng thái booking (Pending → Confirmed → Active → Completed) |
| **Payment Engine** | [03-payment-engine.md](docs/spec/03-payment-engine.md) | Cơ chế tính cước, ledger bất biến, cổng PayOS và VietQR chi nhánh |
| **Inspection Flow** | [04-inspection-flow.md](docs/spec/04-inspection-flow.md) | Quy trình chụp ảnh 4 góc bàn giao xe, ngăn chặn tranh chấp hư hỏng |
| **API Contracts** | [05-api-contracts.md](docs/spec/05-api-contracts.md) | Hợp đồng API chuẩn giữa Backend và các ứng dụng Frontend/Mobile |
| **Database Schema** | [06-database.md](docs/spec/06-database.md) | Đặc tả 70 bảng dữ liệu vận hành, kiểu dữ liệu, index và migration |
| **Architecture** | [RCField_ArchitectureOverview.md](docs/architecture/RCField_ArchitectureOverview.md) | Kiến trúc tổng quan hệ thống phân tầng và luồng dữ liệu |
| **Contribution Evidence** | [contribution-evidence.md](docs/developer/contribution-evidence.md) | Báo cáo minh chứng đóng góp của các thành viên từ lịch sử git |

---

## ☁️ Môi trường Triển khai & Demo Trực tiếp

- 🌐 **Web Frontend (Vercel)**: [https://rcfield-platform.vercel.app](https://rcfield-platform.vercel.app)
- ⚙️ **Backend API (Render)**: [https://rcfield-api.onrender.com](https://rcfield-api.onrender.com)
- 📚 **Swagger API Docs**: [https://rcfield-api.onrender.com/api-docs](https://rcfield-api.onrender.com/api-docs)
- 🗄️ **Cơ sở dữ liệu**: Neon Serverless PostgreSQL 16 (`ap-southeast-1`, SSL)
- ⚡ **Bộ nhớ đệm & Queue**: Upstash Serverless Redis 7 (TLS)
- 📖 **Trang tài liệu Docusaurus**: Chạy cục bộ qua `cd docs/website && npm run start`
