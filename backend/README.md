# RCField Backend

REST API của **RCField** — nền tảng SaaS cho các quán vận hành sân xe điều khiển từ xa (RC) tại Việt Nam.

Mỗi **Provider** là một doanh nghiệp độc lập, sở hữu một hoặc nhiều **chi nhánh**, và trả cho RCField **phí thuê bao phần mềm**. Nền tảng **không thu phần trăm trên đơn đặt lịch** — `platform_fee_pct` cố định bằng 0; doanh thu đến từ gói thuê bao và phí tổ chức giải đấu.

Hệ thống phục vụ bốn vai trò có tài khoản (Customer, Staff, Provider, Admin) cùng khách vãng lai chưa đăng nhập, và bao gồm: đặt lịch — vận hành phiên chơi (nhận/trả xe kèm biên bản ảnh) — thanh toán và đối soát — giải đấu — trợ lý ảo theo từng chi nhánh.

---

## Tech stack

| Lớp | Công nghệ |
|---|---|
| Runtime | Node.js 20+ (đã chạy được trên 25) |
| Ngôn ngữ | TypeScript, strict mode |
| Framework | Express.js — router theo domain |
| CSDL | PostgreSQL 16 + pgvector, truy cập qua TypeORM |
| Cache / khoá phân tán / hàng đợi | Redis 7 |
| Kiểm dữ liệu vào | Zod |
| Xác thực | JWT (access + refresh), RBAC 4 vai trò |
| Thanh toán | VNPay · PayOS · VietQR đối soát qua webhook SePay |
| Lưu ảnh | Cloudinary |
| AI | Google Gemini + NLU sidecar (Python) |
| Kênh chat | Facebook Graph API (Messenger) |
| Email | Brevo |
| Thời gian thực | WebSocket (`ws`) |
| Đóng gói | Docker + Docker Compose |

Quy mô hiện tại: **70 bảng** dữ liệu, 67 entity, 62 service, 40 nhóm route, 86 migration, 58 bộ kiểm thử.

---

## Chạy lần đầu

```bash
npm install
npm run up:all      # dựng PostgreSQL + Redis + NLU + chạy migration + khởi động API
```

Xong thì:

- API — `http://localhost:3000`
- Swagger UI — `http://localhost:3000/api-docs`
- Health check — `GET http://localhost:3000/api/v1/health`

Chưa có `.env` thì `npm run up:all` tự chép từ `.env.example`. Các tính năng cần bên thứ ba (Cloudinary, Google, PayOS, VNPay, Brevo, Facebook) chỉ hoạt động khi bạn điền khoá thật vào `.env`; phần còn lại của hệ thống vẫn chạy bình thường mà không có chúng.

Nếu báo lỗi Docker chưa chạy thì mở Docker Desktop rồi chạy lại.

### Dữ liệu mẫu

```bash
npm run seed:all           # người dùng, chi nhánh, thực đơn, xe, giải đấu, dữ liệu vận hành
npm run seed               # chỉ tài khoản mẫu của 4 vai trò
```

---

## Biến môi trường

Danh sách đầy đủ nằm ở `.env.example`. Nhóm bắt buộc để chạy được:

| Biến | Ý nghĩa |
|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | Kết nối PostgreSQL (`docker-compose` map cổng **5435**) |
| `REDIS_HOST` / `REDIS_PORT` | Kết nối Redis (`docker-compose` map cổng **6380**) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | **Bắt buộc đổi trước khi deploy** |
| `FRONTEND_URL` | Dùng để dựng link quay về sau khi thanh toán |
| `PAYMENT_WINDOW_MINUTES` | Hạn thanh toán một đơn đặt lịch, mặc định 30 phút |

Nhóm tuỳ chọn theo tính năng: `CLOUDINARY_*`, `GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`, `PAYOS_*`, `VNPAY_*`, `EMAIL_BREVO_API_KEY`, `FACEBOOK_*`, `BANK_WEBHOOK_API_KEY`.

> `.env` nằm trong `.gitignore` và không được commit. `.env.example` và `.env.test` chỉ chứa giá trị giả.

---

## Lệnh thường dùng

```bash
npm run dev              # chạy dev, tự nạp lại khi sửa file
npm run build            # biên dịch TypeScript sang dist/
npm start                # chạy bản đã build

npm test                 # toàn bộ kiểm thử
npm test -- bookings     # chỉ chạy file khớp tên
npm run test:coverage    # kèm báo cáo độ phủ

npm run lint             # ESLint
npm run format:check     # Prettier, chỉ kiểm
npx tsc --noEmit         # kiểm kiểu, không xuất file

npm run migration:run      # chạy migration còn thiếu
npm run migration:revert    # lùi migration gần nhất
npm run migration:generate src/migrations/TenMigration   # sinh từ khác biệt entity
npm run migration:create   src/migrations/TenMigration   # tạo file trống
```

---

## Cấu trúc mã nguồn

```
src/
├── server.ts            # điểm khởi động
├── app.ts               # Express app — test dùng lại qua supertest
├── config/              # DataSource, Redis, biến môi trường có kiểu, Swagger, logger
├── routes/              # router theo domain, mount dưới /api/v1
├── controllers/         # nhận request, kiểm dữ liệu bằng Zod, gọi service
├── services/            # toàn bộ nghiệp vụ
├── models/              # entity TypeORM
├── middlewares/         # authenticate, authorize, requireActiveProvider, xử lý lỗi
├── jobs/                # cron: hết hạn thanh toán, không đến, hết hạn gói, nhắc giải
├── lib/                 # hàm thuần: giờ Việt Nam, mốc giờ phiên chơi, số điện thoại
├── migrations/          # migration CSDL
├── validate/            # toàn bộ schema Zod
├── types/               # enum, AppError, AuthRequest
└── __tests__/           # kiểm thử tích hợp chạy trên CSDL thật
```

Luồng một request: **route → controller → service → repository**. Controller không chứa nghiệp vụ; service không đọc `req`.

---

## Quy ước bắt buộc

Chi tiết ở [`CLAUDE.md`](./CLAUDE.md). Bốn điểm hay bị quên:

1. **Mỗi handler trong controller phải có comment đường dẫn** ngay phía trên: `// POST /api/v1/bookings  [auth]`
2. **Không dùng `console`** — dùng `logger` trong `src/config/logger.ts`
3. **Mọi schema Zod nằm ở `src/validate/index.ts`**, gom theo bảng; không khai trong controller
4. **Mọi enum nằm ở `src/types/index.ts`**; không khai trong entity hay service

Đặt tên: entity `PascalCase` số ít · file `kebab-case.routes.ts` / `.controller.ts` / `.service.ts` · bảng `snake_case` số nhiều · khoá ngoại `<entity>_id`.

---

## Vài luật nghiệp vụ quyết định cách viết code

| Luật | Nghĩa là |
|---|---|
| **Chốt giá theo ảnh chụp** | Mọi phép tính tiền đọc từ `bookings.snapshot` lấy lúc tạo đơn, **không bao giờ** đọc bảng giá hiện tại |
| **Không có tiền cọc** | `SECURITY_DEPOSIT` còn trong enum để đọc dữ liệu cũ, nhưng không code nào tạo mới |
| **Phí nền tảng 0%** | Doanh thu là phí thuê bao và phí tổ chức giải, không phải phần trăm trên đơn |
| **Tiền đền hư hỏng** | `Σ (parts_price + labor_price)` do nhân viên nhập ở biên bản trả xe — không có hệ số theo hạng xe |
| **Quá giờ ≠ tự đóng** | Quá `planned_end_at` không tự thu xe cũng không tự chốt tiền; 10 phút ân hạn để chốt gia hạn, 30 phút thì cảnh báo |

---

## Cơ sở dữ liệu

70 bảng, chia theo miền: định danh & truy cập · chi nhánh · đội xe · thực đơn · đặt lịch & thương mại · vận hành phiên chơi · thanh toán · thuê bao · giải đấu · AI & hội thoại · thông báo.

Vài bảng trọng yếu:

| Bảng | Vai trò |
|---|---|
| `bookings` | Đơn đặt lịch, giữ `snapshot` giá bất biến |
| `sessions` | Phiên chơi thật tại quán |
| `inspections` + `inspection_photos` + `inspection_checklists` | Biên bản nhận/trả xe kèm bằng chứng ảnh |
| `damage_line_items` | Từng dòng hư hỏng và tiền công |
| `payment_components` | Từng khoản tiền của một đơn, có vòng đời trạng thái riêng |
| `payment_transactions` | Giao dịch với cổng thanh toán |
| `bank_transactions` | Sổ đối soát chuyển khoản |
| `contests` + 15 bảng liên quan | Giải đấu: đăng ký, trận, kết quả, phí, kỷ luật |

Quy ước: khoá chính `uuid`, thời gian `timestamptz`, xoá mềm bằng `deleted_at` cho các thực thể người dùng thu hồi được (21/70 bảng — bảng ghi nhận sự kiện thì không bao giờ xoá).

Xem sơ đồ trực quan bằng SchemaSpy: `npm run db-view`.

---

## Kiểm thử

58 bộ kiểm thử chạy trên **CSDL thật** (`rcfeild_test`), tách hoàn toàn khỏi DB phát triển. Không cần dựng gì thêm:

```
globalSetup   → tạo rcfeild_test nếu chưa có, chạy migration
beforeEach    → TRUNCATE toàn bộ bảng, mỗi test bắt đầu với DB sạch
afterAll      → đóng kết nối
```

Chạy tuần tự (`--runInBand`) vì dùng chung một CSDL. Lệnh `npm test` đi qua `scripts/run-jest.sh` — script này tự thêm tuỳ chọn Node cần thiết khi bạn chạy Node 25 trở lên.

Cổng ra ngoài (PayOS, Gemini, Brevo…) đều bị chặn ở biên bằng mock: kiểm thử kiểm luật của hệ thống, không kiểm mạng của bên thứ ba.

Trợ giúp có sẵn trong `src/__tests__/helpers`:

| Hàm | Việc |
|---|---|
| `createTestUser({ role })` | Tạo người dùng |
| `createTestCafe({ provider_id })` | Tạo chi nhánh |
| `createTestVehicle({ cafe_id })` | Tạo danh mục xe kèm một xe |
| `generateToken(user)` | Sinh JWT hợp lệ |

Viết tính năng đụng tới tiền hoặc dữ liệu vận hành thì **viết test trước và xác nhận nó đỏ**, rồi mới implement.

---

## Chất lượng mã

`.github/workflows/ci.yml` chạy trên mọi pull request, theo đúng thứ tự:

```
npm ci → format:check → lint → tsc --noEmit → npm test → dựng báo cáo kiểm thử
```

Máy cục bộ có `husky` chạy `lint-staged` trước mỗi commit. Độ phủ trên các miền đặt lịch, thanh toán, kiểm xe là **mục tiêu 80%** của nhóm, không phải cổng chặn build.

---

## Tài liệu API

- Swagger UI — `http://localhost:3000/api-docs`
- OpenAPI JSON — `http://localhost:3000/api-docs.json`

Sinh trực tiếp từ schema Zod (`@asteasolutions/zod-to-openapi`), nên tài liệu không lệch khỏi phần kiểm dữ liệu thật.

Mọi phản hồi bọc trong `{ success, data }`; lỗi đi qua middleware chung và mang **mã lỗi ổn định** — ví dụ `SLOT_LOCKED`, `BYOC_CAPACITY_FULL`, `PACKAGE_NOT_ENOUGH_SLOTS`, `CONTEST_FEE_REQUIRED`, `INVALID_INSPECTION_PHOTO_COUNT`.

---

## Tài liệu nghiệp vụ

Đặc tả chi tiết (tổng quan, mô hình miền, máy trạng thái, cỗ máy thanh toán, luồng kiểm xe, hợp đồng API, quy tắc nghiệp vụ) nằm ở **kho tài liệu riêng** `rcfield-spec`, không nằm trong repo này. Đụng vào nghiệp vụ thì đọc bên đó trước khi viết code.
