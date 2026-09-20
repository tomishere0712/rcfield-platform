# RCField Backend 🏎️⚙️

> **Enterprise-Grade RESTful API & Real-Time Engine for Multi-Tenant RC Field Management.**  
> Built with **Node.js**, **Express**, **TypeScript**, **TypeORM**, **PostgreSQL 16**, **Redis 7**, and **BullMQ**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-Backend-black?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat-square&logo=typeorm&logoColor=white)](https://typeorm.io/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Queue-B7178C?style=flat-square)](https://bullmq.io/)
[![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![PayOS](https://img.shields.io/badge/Payment-PayOS-green?style=flat-square)](https://payos.vn/)
[![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

---

## 📌 Overview

**RCField Backend** là dịch vụ xử lý nghiệp vụ trung tâm cho toàn bộ nền tảng SaaS RCField. Hệ thống phục vụ mô hình **SaaS multi-tenant** cho các chủ sân (Provider) tại Việt Nam, kết nối vận hành giữa 4 vai trò: **Customer**, **Staff**, **Provider**, và **Platform Admin**.

Quy mô hiện tại:
- **70 bảng** cơ sở dữ liệu quan hệ (PostgreSQL 16 + pgvector)
- **67 TypeORM Entities**, **62 Services**, **40 nhóm Routes**, **86 Migrations**
- **58 bộ kiểm thử tích hợp (Jest)** chạy trên CSDL thật

---

## 🏗️ Kiến trúc Hệ thống (System Architecture)

Hệ thống được tổ chức theo kiến trúc **Domain-Driven Layered Architecture**:

```text
HTTP Request (Client / Webhook / Mobile)
               │
               ▼
      [ Middleware Layer ]       ── JWT Auth, RBAC Guards, Rate Limiting, Error Handler
               │
               ▼
      [ Controller Layer ]       ── Request validation (Zod Schemas), DTO mapping
               │
               ▼
       [ Service Layer ]         ── Pure business logic, state machines, transactions
         │            │
         ▼            ▼
   [ Repositories ] [ BullMQ Jobs ] ── Asynchronous queue workers (timeouts, notifications)
         │
         ▼
[ PostgreSQL 16 ] + [ Redis 7 ]    ── Data persistence, distributed locks, session caching
```

Luồng xử lý một request: **Route → Middleware → Controller → Service → Repository/Entity**.  
- Controller chỉ kiểm tra định dạng dữ liệu đầu vào qua **Zod** và gọi Service.
- Service đảm nhận 100% logic nghiệp vụ, quản lý transaction CSDL và phát sinh sự kiện.

---

## 🌟 Tính Năng & Phân Hệ Cốt Lõi

### 1. 🏟️ Đặt Lịch & Vòng Đời Trạng Thái (Booking State Machine)
- Quản lý slot thời gian theo sức chứa thực tế của từng sân/loại bề mặt (Drift, Carpet, Clay).
- Hỗ trợ cả 2 chế độ: **RENTAL** (thuê xe + tay điều khiển của quán) và **BYOC** (mang xe cá nhân).
- Cố định bảng giá tại thời điểm tạo đơn (`snapshot`), ngăn ngừa sai lệch doanh thu khi quán điều chỉnh giá sau đó.
- Khóa chỗ tự động hết hạn sau 30 phút nếu không hoàn tất thanh toán.

### 2. 🔍 Biên Bản Bàn Giao & Ảnh Số (Inspection Flow)
- Giao thức nhận/trả xe bắt buộc chụp 4 góc ảnh thực tế (Front, Rear, Chassis, Electronics).
- Khử hoàn toàn tranh chấp hư hỏng giữa khách và quán.
- Tính toán chi phí đền bù hư hại minh bạch theo bảng phụ tùng (`damage_line_items`).

### 3. 💳 Cổng Thanh Toán & Đối Soát (Payment Engine)
- **PayOS & VNPay**: Tích hợp cổng thanh toán trực tuyến tự động xác nhận qua webhook.
- **VietQR Chi Nhánh**: Tự động sinh mã VietQR theo chuẩn EMVCo có nhúng mã tham chiếu giao dịch (`RCFxxxxx`).
- **Sổ Đối Soát Ngân Hàng**: Tiếp nhận và tự động đối soát sao kê ngân hàng qua webhook (SePay), xử lý các ca giao dịch lệch tiền hoặc thiếu mã tham chiếu.

### 4. 🏆 Tổ Chức Giải Đấu (Tournament & Contest Engine)
- Đăng ký thi đấu, phân hạng xe (1/10, 1/8, Mini-Z), kiểm tra điều kiện kỹ thuật.
- Xếp bảng đấu tự động, ghi nhận kết quả từng vòng và tính cước tổ chức giải.

### 5. 🤖 Trợ Lý Ảo & AI NLU (Sidecar Service)
- Tích hợp **Google Gemini 2.0** cho hội thoại thông minh hỗ trợ khách hàng.
- **NLU Service (FastAPI + SentenceTransformers)**: Sidecar phân loại ý định người dùng đa ngôn ngữ (`paraphrase-multilingual-MiniLM-L12-v2`) phục vụ RAG cho từng chi nhánh.

---

## 🛠️ Tech Stack Chi Tiết

| Lớp | Công nghệ | Mục đích |
| :--- | :--- | :--- |
| **Runtime** | Node.js 20+ LTS | Nền tảng thực thi server-side |
| **Ngôn ngữ** | TypeScript (Strict Mode) | An toàn kiểu dữ liệu, bảo trì dài hạn |
| **Framework** | Express.js | Định tuyến theo domain, middleware pipeline |
| **CSDL** | PostgreSQL 16 + pgvector | Lưu trữ dữ liệu quan hệ & semantic vector search |
| **ORM** | TypeORM 0.3 | Quản lý schema, migrations, data mapping |
| **Cache & Queue** | Redis 7 + BullMQ | Khóa phân tán, cache dữ liệu, hàng đợi tác vụ nền |
| **Validation** | Zod | Kiểm tra dữ liệu đầu vào runtime type-safe |
| **Xác thực** | JWT + RBAC | Phân quyền 4 vai trò: Admin, Provider, Staff, Customer |
| **Thanh toán** | PayOS, VietQR, VNPay | Cổng thanh toán và đối soát tự động |
| **Lưu trữ file** | Cloudinary | Lưu trữ ảnh biên bản kiểm tra xe |
| **Tài liệu API** | OpenAPI 3.0 / Swagger | Sinh tự động từ Zod schemas |
| **Đóng gói** | Docker & Docker Compose | Triển khai nhất quán giữa các môi trường |

---

## 🚀 Khởi Chạy Local (Getting Started)

### 1. Yêu cầu tiên quyết
- **Node.js** `>= 20.x`
- **Docker Desktop** (để chạy PostgreSQL 16 và Redis 7)
- **Python** `>= 3.10` (nếu chạy kèm dịch vụ NLU)

### 2. Cài đặt & Thiết lập

```bash
# 1. Di chuyển vào thư mục backend
cd backend

# 2. Cài đặt dependencies
npm install

# 3. Khởi động PostgreSQL + Redis + Chạy migration + Khởi chạy server
npm run up:all
```

Sau khi hoàn tất:
- **API Server**: `http://localhost:3000`
- **Swagger Documentation**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/api/v1/health`

### 3. Nạp dữ liệu mẫu (Seed Data)

```bash
# Nạp toàn bộ dữ liệu mẫu (tài khoản, chi nhánh, xe, thực đơn, giải đấu)
npm run seed:all

# Hoặc chỉ nạp tài khoản cho 4 vai trò
npm run seed
```

---

## 👥 Tài Khoản Kiểm Thử Mẫu (Seed Accounts)

| Vai trò | Email | Mật khẩu | Phạm vi quyền |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@gmail.com` | `123456` | Quản trị nền tảng, duyệt KYC cơ sở, audit logs |
| **PROVIDER** | `provider@gmail.com` | `123456` | Quản lý chi nhánh, catalog xe, doanh thu, giải đấu |
| **STAFF** | `staff@gmail.com` | `123456` | Vận hành quầy, quét QR check-in, chụp ảnh inspection |
| **CUSTOMER** | `customer@gmail.com` | `123456` | Đặt lịch, thanh toán VietQR, tham gia giải đấu |

---

## 📜 Các Lệnh Thường Dùng (Available Scripts)

```bash
# Phát triển
npm run dev              # Chạy dev với nodemon, tự động restart khi sửa file
npm run build            # Biên dịch TypeScript sang dist/
npm start                # Chạy bản build production

# Kiểm thử & Code Quality
npm test                 # Chạy toàn bộ 58 bộ test Jest
npm test -- bookings     # Chạy riêng các bài test khớp tên
npm run test:coverage    # Báo cáo độ phủ kiểm thử
npm run lint             # Kiểm tra chất lượng mã bằng ESLint
npm run format:check     # Kiểm tra định dạng bằng Prettier

# Cơ sở dữ liệu & Migration
npm run migration:run      # Thực thi các migration còn thiếu
npm run migration:revert   # Lùi lại migration gần nhất
npm run migration:generate src/migrations/TenMigration # Tự sinh migration từ entity
npm run seed:all           # Nạp toàn bộ dữ liệu mẫu
```

---

## 📂 Cấu Trúc Mã Nguồn

```text
backend/src/
├── server.ts            # Điểm khởi động HTTP & WebSocket server
├── app.ts               # Cấu hình Express app và middleware pipeline
├── config/              # DataSource TypeORM, Redis, Logger, biến môi trường
├── routes/              # 40 nhóm router mount dưới /api/v1
├── controllers/         # Nhận HTTP request, validate Zod schema, trả response
├── services/            # 62 services chứa toàn bộ nghiệp vụ cốt lõi
├── models/              # 67 TypeORM entities
├── middlewares/         # JWT Auth, RBAC guards, error handler, rate limit
├── jobs/                # BullMQ queue workers & scheduled jobs
├── migrations/          # 86 tệp migration cơ sở dữ liệu
├── validate/            # Toàn bộ Zod schemas phân theo domain
├── types/               # Type definitions, enums, AppError
└── __tests__/           # 58 bộ kiểm thử tích hợp chạy trên CSDL thật
```

---

## 📖 Tài Liệu Nghiệp Vụ & Đặc Tả
Đặc tả chi tiết về mô hình dữ liệu (ERD), máy trạng thái đặt lịch (State Machine), quy tắc tính cước và giao thức bàn giao xe được lưu trữ tại thư mục [docs/](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs).
