# RCField Platform — Developer Setup Guide 🛠️

Hướng dẫn thiết lập và khởi chạy toàn bộ hệ thống **RCField Platform** trên môi trường cục bộ (Local Development).

---

## 🏗️ Cấu trúc Monorepo

```text
rcfield-platform/
├── backend/          # RESTful API (Express + TypeScript + TypeORM + Redis + PostgreSQL)
├── frontend/         # Web Application (React 19 + Vite + TailwindCSS v4)
├── mobile/           # Mobile Application (React Native + Expo SDK 54)
└── docs/             # Technical Specifications & Domain Models
```

---

## 📋 Yêu cầu tiên quyết (Prerequisites)

- **Node.js**: `>= 20.x` (khuyến nghị phiên bản LTS mới nhất)
- **npm**: `>= 10.x`
- **Docker Desktop**: Chạy PostgreSQL và Redis cho Backend
- **Python**: `>= 3.10` (nếu chạy NLU Service)
- **Expo Go** (trên điện thoại) hoặc **iOS Simulator / Android Emulator** (cho Mobile)

---

## 🚀 Khởi chạy từng thành phần

### 1. Backend (REST API & Services)
```bash
cd backend

# Cài đặt thư viện (nếu chưa có node_modules)
npm install

# Khởi động cơ sở dữ liệu và API server
npm run dev
# Server lắng nghe tại: http://localhost:3000
# Swagger API Docs: http://localhost:3000/api-docs
```

### 2. Frontend (React 19 Web App)
```bash
cd frontend

# Cài đặt thư viện (nếu chưa có node_modules)
npm install

# Khởi chạy Vite development server
npm run dev
# Web app khả dụng tại: http://localhost:5173
```

### 3. Mobile App (Expo / React Native)
```bash
cd mobile

# Cài đặt thư viện (nếu chưa có node_modules)
npm install

# Khởi chạy Expo Metro bundler
npm run start
```
- Bấm `i` để mở trên iOS Simulator.
- Bấm `a` để mở trên Android Emulator.
- Quét mã QR bằng ứng dụng **Expo Go** trên điện thoại thật.

---

## 👥 Tài khoản thử nghiệm (Seed Accounts)

Sau khi chạy lệnh nạp dữ liệu mẫu ở backend (`npm run seed:all`), bạn có thể đăng nhập bằng các tài khoản sau:

| Vai trò | Email | Mật khẩu | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@gmail.com` | `123456` | Duyệt KYC, quản lý gói SaaS, giám sát hệ thống |
| **Provider** | `provider@gmail.com` | `123456` | Quản lý chi nhánh, catalog xe, phân quyền nhân viên, thống kê doanh thu |
| **Staff** | `staff@gmail.com` | `123456` | Quét mã QR check-in, kiểm tra bàn giao xe với ảnh inspection |
| **Customer** | `customer@gmail.com` | `123456` | Tìm sân, đặt slot/thuê xe, quét QR thanh toán, xem lịch sử phiên chơi |
