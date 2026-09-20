# Implementation Plan: Danh mục F&B do Provider tự tạo

**Branch**: `main` (không tạo nhánh riêng — theo yêu cầu người dùng) | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-custom-menu-categories/spec.md`

## Summary

Thay bộ danh mục F&B cố định toàn platform (Postgres native enum `fnb_category_enum` với 6 giá trị) bằng bảng `menu_categories` thuộc từng chi nhánh, do Provider tự tạo, đổi tên, sắp xếp và xóa. `menu_items.category` (enum) trở thành `menu_items.category_id` (FK nullable); món không có danh mục thuộc nhóm ngầm định "Chưa phân loại". Bỏ hardcode ép combo vào danh mục "COMBO", giữ nguyên cờ `is_combo` như thuộc tính độc lập.

Không chuyển đổi phân loại cũ — toàn bộ món hiện có về "Chưa phân loại". Xóa danh mục còn món bị chặn ở **tầng service** (409 `CATEGORY_NOT_EMPTY`) — lưu ý `ON DELETE RESTRICT` trên khóa ngoại **không** đóng vai trò dự phòng vì xóa danh mục là xóa mềm (`UPDATE`), không phải `DELETE`. Xóa mềm theo `deleted_at`, với partial unique index để Provider tạo lại tên vừa xóa được ngay.

Đơn F&B đã phát sinh không lưu tham chiếu danh mục, nên hóa đơn, chi tiết booking, màn hình Staff và báo cáo doanh thu **không** bị ảnh hưởng — đã xác minh trên 4 điểm tiêu thụ dữ liệu.

## Technical Context

**Language/Version**: TypeScript strict mode (không dùng `any`); Node.js 20+ (BE), React 18 + Vite (FE)
**Primary Dependencies**: Express.js router-per-domain, TypeORM, zod, `@asteasolutions/zod-to-openapi` (BE); React Query, Zustand, Tailwind, shadcn/ui (FE)
**Storage**: PostgreSQL — bảng mới `menu_categories`; sửa cột trên `menu_items`; drop type `fnb_category_enum`
**Testing**: Jest + supertest (`src/__tests__/routes/`), chạy trên DB thật qua `jest-setup.ts`
**Target Platform**: Linux server (API) + trình duyệt (SPA tiếng Việt)
**Project Type**: Web application — hai repo tách rời `rcfeild-be` (API) và `rcfield-fe` (SPA)
**Performance Goals**: Không có mục tiêu riêng — danh sách ≤30 danh mục mỗi chi nhánh, nằm hoàn toàn trong ngân sách hiện tại của endpoint menu
**Constraints**: Tên danh mục ≤50 ký tự, ≤30 danh mục/chi nhánh, duy nhất theo `(cafe_id, lower(btrim(name)))` trong phạm vi bản ghi chưa xóa
**Scale/Scope**: 16 file backend (6 tạo mới), 9 file frontend (1 tạo mới), 1 migration

## Constitution Check

*GATE: Phải qua trước Phase 0. Kiểm lại sau Phase 1.*

| # | Nguyên tắc | Áp dụng? | Kết luận |
|---|---|---|---|
| I | Snapshot-First Pricing | Có liên quan | ✅ **PASS** — tính năng không chạm tới bất kỳ phép tính tiền nào. Đã xác minh `fnb_order_items` chỉ lưu `item_name_snapshot`/`unit_price`/`subtotal`, không tham chiếu danh mục; đổi/xóa danh mục không thể tác động ngược vào giá đã chốt (FR-024). |
| II | Booking/Session State Machine Gate | Không | ✅ **PASS** — không có chuyển trạng thái booking hay session. |
| III | Evidence-Based Handover | Không | ✅ **PASS** — không chạm inspection. |
| IV | Payment Component Isolation | Không | ✅ **PASS** — không tạo/sửa `payment_components`. |
| V | Test-First cho logic tài chính & trạng thái | Không bắt buộc | ✅ **PASS** — không có quy tắc tài chính hay `canTransition`. Vẫn viết test cho ràng buộc trùng tên, chặn xóa, và cô lập theo chi nhánh vì đây là các bất biến dễ vỡ. |
| VI | RBAC Enforcement | **Có** | ✅ **PASS** — quyền khai báo ở tầng router (`menu.routes.ts` đã có `authenticate + authorize(PROVIDER) + requireActiveProvider`), không kiểm tra trong handler. Đường đọc dùng `optionalAuthenticate` giống endpoint menu công khai hiện có. |

**Ràng buộc kỹ thuật bổ sung từ Constitution**:
- *"Every entity MUST have `created_at`, `updated_at`, and `deleted_at` (soft delete)"* → `menu_categories` có đủ ba cột; đây cũng là căn cứ cho quyết định xóa mềm ở D3.
- *"Tables: snake_case plural"* → `menu_categories`. *"Models: PascalCase singular"* → `MenuCategory`.
- *"Validation MUST occur in the route/controller layer, not inside services"* → toàn bộ zod schema đặt ở `src/validate/index.ts`, parse trong controller.
- *"Route files: `<domain>.routes.ts` | Services: `<domain>.service.ts`"* → `menu-category.service.ts`, `menu-category.controller.ts`.

**Kết quả gate**: PASS, không có vi phạm cần biện minh → mục Complexity Tracking để trống.

## Project Structure

### Documentation (this feature)

```text
specs/017-custom-menu-categories/
├── plan.md              # File này
├── spec.md              # Đặc tả nghiệp vụ (đã qua /speckit-clarify)
├── research.md          # Phase 0 — 11 quyết định kỹ thuật
├── data-model.md        # Phase 1 — schema, migration, ràng buộc
├── quickstart.md        # Phase 1 — kịch bản E2E + checklist test
├── contracts/
│   └── api.md           # Phase 1 — 5 endpoint mới + 3 hợp đồng thay đổi
├── checklists/
│   └── requirements.md  # Checklist chất lượng spec
└── tasks.md             # Phase 2 — do /speckit-tasks tạo, KHÔNG thuộc /speckit-plan
```

### Source Code (repository root)

```text
rcfeild-be/src/
├── models/
│   ├── menu-category.entity.ts          # TẠO MỚI — entity MenuCategory
│   └── menu-item.entity.ts              # SỬA — bỏ enum category, thêm categoryId
├── migrations/
│   └── 1784500000000-CustomMenuCategories.ts   # TẠO MỚI
├── types/
│   └── index.ts                         # SỬA — xóa enum FnbCategory (dòng 334-341)
├── validate/
│   └── index.ts                         # SỬA — schema danh mục + bỏ nativeEnum (877, 895, 937)
├── services/
│   ├── menu-category.service.ts         # TẠO MỚI — CRUD + reorder + chặn xóa
│   ├── menu.service.ts                  # SỬA — join danh mục, bỏ ép COMBO (214), lọc theo id (111, 122)
│   └── chat-tools/get-menu.ts           # SỬA — join lấy tên danh mục (26)
├── controllers/
│   ├── menu-category.controller.ts      # TẠO MỚI
│   └── menu.controller.ts               # SỬA — truyền category_id qua service
├── routes/
│   ├── menu.routes.ts                   # SỬA — mount categories TRƯỚC /:itemId
│   └── cafe.routes.ts                   # SỬA — thêm GET .../menu/categories công khai
├── config/openapi/
│   └── menu.openapi.ts                  # SỬA — đăng ký schema & path mới
├── seeds/
│   └── seed-cafes.ts                    # SỬA — seed danh mục rồi gán (416-477, 872)
└── __tests__/routes/
    ├── menu.test.ts                     # SỬA — helper INSERT bỏ cột category (42)
    └── menu-category.test.ts            # TẠO MỚI

rcfield-fe/src/
├── features/menu/
│   ├── types/index.ts                   # SỬA — bỏ FNB_CATEGORIES/LABEL, thêm MenuCategory
│   └── api/menu.api.ts                  # SỬA — thêm CRUD danh mục + query keys
└── pages/
    ├── provider/
    │   ├── ProviderMenuPage.tsx                       # SỬA — lọc theo id, cột tên thật, đếm thật (64, 82, 85, 170, 221-227, 258)
    │   └── components/
    │       ├── ProviderMenuCategoryDialog.tsx         # TẠO MỚI — quản lý danh mục
    │       ├── ProviderMenuItemFormDialog.tsx         # SỬA — dropdown từ API (27, 202)
    │       └── ProviderComboFormDialog.tsx            # SỬA — thêm chọn danh mục cho combo
    ├── booking/components/checkout/FnbStep.tsx        # SỬA — dùng categoryName (91)
    ├── customer/cafe-detail/components/CafeFnbSection.tsx  # SỬA — nhóm theo danh mục (73, 103)
    └── staff/StaffSessionDetailPage.tsx               # SỬA — hiển thị danh mục khi Staff thêm món (223-224)
```

> `StaffSessionDetailPage.tsx` hiện **chưa** hiển thị danh mục ở bất kỳ đâu. Đây là bổ sung UI mới, bắt buộc theo acceptance scenario US3-6 ("Staff duyệt danh sách món thấy đúng bộ danh mục của chi nhánh mình đang trực"). Cách hiển thị: badge cạnh tên món, khớp với `FnbStep.tsx` để nhất quán.

**Structure Decision**: Giữ nguyên kiến trúc router-per-domain sẵn có. Danh mục là domain con của menu nên đặt cạnh `menu.*` với tiền tố `menu-category.*` thay vì tạo domain mới — vừa khớp quy ước đặt tên của Constitution, vừa cho phép tái sử dụng nguyên chuỗi middleware RBAC đã khai báo ở `menu.routes.ts` mà không nhân bản cấu hình quyền.

## Thứ tự thực thi

Mỗi mốc dưới đây phải chạy được và test xanh trước khi sang mốc sau. Mốc 1-2 là điều kiện tiên quyết cứng: khi cột `category` bị drop, seed và test hiện tại vỡ ngay.

| Mốc | Nội dung | Phụ thuộc |
|---|---|---|
| **M1 — Nền dữ liệu** | Entity `MenuCategory`, sửa `MenuItem`, migration, xóa enum `FnbCategory` | — |
| **M2 — Sửa hệ quả tức thì** | `seed-cafes.ts`, `menu.test.ts` — cả hai đang INSERT cột `category` sẽ vỡ | M1 |
| **M3 — API danh mục** | service + controller + routes + validate + OpenAPI cho 5 endpoint | M1 |
| **M4 — API menu cập nhật** | `menu.service.ts` join danh mục, bỏ ép COMBO, lọc theo `category_id` | M1, M3 |
| **M5 — Chatbot** | `get-menu.ts` nhóm theo tên danh mục thật | M4 |
| **M6 — FE quản trị** | types, api, `ProviderMenuCategoryDialog`, `ProviderMenuPage`, 2 form dialog | M3, M4 |
| **M7 — FE khách, đặt lịch & Staff** | `FnbStep.tsx`, `CafeFnbSection.tsx` — sửa luôn lỗi hiện mã thô; `StaffSessionDetailPage.tsx` — thêm mới hiển thị danh mục | M4 |
| **M8 — Test & xác minh** | `menu-category.test.ts`, chạy lại `menu.test.ts`, seed lại DB, đối chiếu quickstart | tất cả |

Ánh xạ sang User Story của spec: M3+M6 phủ US1, M4+M6 phủ US2, M4+M7 phủ US3, M5 phủ US4.

## Điểm cần đặc biệt cẩn thận khi triển khai

1. **Thứ tự đăng ký route** — `menuRouter` đã có `patch('/:itemId')` và `delete('/:itemId')`. Route `/categories` phải đăng ký **trước**, nếu không Express khớp `/categories/<id>` vào `/:itemId` với `itemId = "categories"`. Đây là lỗi im lặng, chỉ lộ ra dưới dạng "UUID không hợp lệ". (research.md D8)

2. **Partial unique index, không phải unique thường** — Xóa mềm cộng unique index thường sẽ khiến Provider không tạo lại được danh mục vừa xóa, phá vỡ acceptance scenario US1-8. Bắt buộc `WHERE deleted_at IS NULL`. (research.md D3)

3. **Đếm món khi chặn xóa không được lọc `is_available`** — FR-015 quy định món tạm ngưng bán vẫn tính. Lọc nhầm sẽ cho xóa danh mục còn món ẩn.

4. **Kiểm tra ở service là guard DUY NHẤT cho FR-015.** `ON DELETE RESTRICT` trên `menu_items.category_id` chỉ kích hoạt trên `DELETE` thật; xóa danh mục lại là `UPDATE ... SET deleted_at` (xóa mềm), nên ràng buộc DB **không bao giờ chạy** trong luồng nghiệp vụ. Không được nới lỏng test T014 với lý do "đã có DB chặn".

5. **`DROP TYPE fnb_category_enum` chỉ an toàn vì đúng một bảng dùng nó** — đã xác minh bằng grep toàn bộ `src/migrations/`. Nếu sau này có bảng khác tham chiếu, thứ tự migration phải đổi.

6. **Rollback không khôi phục phân loại cũ** — hệ quả đã được chấp nhận của quyết định "không migrate data". Phải ghi rõ trong mô tả PR để người review không hiểu nhầm là migration an toàn hai chiều.

## Nợ kỹ thuật ghi nhận (không xử lý trong PR này)

- **Module menu chưa enforce subscription.** `createMenuItem`/`updateMenuItem`/`deleteMenuItem` không gọi kiểm tra gói, và helper `assertSubscriptionActive` mà `docs/developer/provider-subscription-enforcement.md` mô tả **chưa tồn tại** trong codebase. Cố tình không vá lệch cho riêng danh mục để tránh hành vi vô lý (sửa được món nhưng không sửa được danh mục). Cần task riêng cho cả module. (research.md D9)
- **Quyền ADMIN với module menu.** `menu.service.ts:102` có nhánh `canManage` cho ADMIN nhưng router chỉ cho `PROVIDER`, khiến nhánh đó không bao giờ chạy ở đường ghi. FR-009 đã được sửa để khớp hiện trạng. (research.md D10)
- **Staff gọi món tại quầy tra món theo tên.** `staff.service.ts:2357` dùng `where: { name, cafeId }` thay vì id. Không liên quan danh mục nhưng sẽ hỏng khi triển khai tính năng kích cỡ đồ uống. Đã ghi ở mục Out of Scope của spec.

## Complexity Tracking

> Constitution Check đạt toàn bộ, không có vi phạm cần biện minh. Mục này để trống theo chủ ý.
