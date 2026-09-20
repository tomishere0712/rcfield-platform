---
description: "Task list — Danh mục F&B do Provider tự tạo"
---

# Tasks: Danh mục F&B do Provider tự tạo

**Input**: Design documents from `/specs/017-custom-menu-categories/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md
**Branch**: `main` — không tạo nhánh riêng theo yêu cầu người dùng

**Tests**: CÓ. Bộ test được yêu cầu tường minh — `quickstart.md` có checklist test đầy đủ, và `plan.md` (Constitution Check, nguyên tắc V) chốt phải viết test cho ba bất biến dễ vỡ: ràng buộc trùng tên, chặn xóa danh mục còn món, cô lập dữ liệu theo chi nhánh.

**Organization**: Nhóm theo user story để mỗi story kiểm thử được độc lập.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (khác file, không phụ thuộc task chưa xong)
- **[Story]**: US1–US4 theo spec.md
- Mọi task đều có đường dẫn file cụ thể

## Path Conventions

Hai repo tách rời trong cùng workspace:
- Backend: `rcfeild-be/src/...`
- Frontend: `rcfield-fe/src/...`

---

## ⚠️ Đọc trước khi bắt đầu — tính chất đặc thù của feature này

Khác với đa số feature, **các user story ở đây KHÔNG deploy độc lập được**. Migration ở Phase 2 drop cột `menu_items.category` và type `fnb_category_enum`; kể từ thời điểm đó, mọi chỗ đọc/ghi phân loại đều hỏng cho tới khi US2 và US3 hoàn tất. Hệ quả thực tế:

- **Phase 2 → US3 phải nằm trong cùng một PR.** Merge nửa chừng sẽ để lại sản phẩm hỏng ở màn khách hàng.
- Các story vẫn **kiểm thử độc lập được** (mỗi story có tiêu chí nghiệm thu riêng), nhưng **không phát hành độc lập được**.
- MVP thật sự = Phase 1 + 2 + US1 + US2 + US3. US4 (trợ lý AI) là phần duy nhất tách ra sau được.

Ba cái bẫy đã xác định ở `research.md`, lặp lại vì rất dễ mất thời gian:
1. Route `/categories` phải đăng ký **trước** `/:itemId` — nếu không Express nuốt vào tham số động.
2. Unique index **bắt buộc** có `WHERE deleted_at IS NULL` — thiếu là Provider không tạo lại được danh mục vừa xóa.
3. Đếm món khi chặn xóa **không** được lọc `is_available`.

---

## Phase 1: Setup (Chuẩn bị & chốt baseline)

**Purpose**: Ghi lại trạng thái trước migration để về sau chứng minh được FR-025/SC-005 (không mất món, không đụng đơn đã phát sinh).

- [ ] T001 Chạy 3 câu SQL baseline (đếm `menu_items` chưa xóa, đếm `fnb_order_items`, tổng `subtotal`) và ghi kết quả vào mục "Xác minh sau khi triển khai" của `specs/017-custom-menu-categories/quickstart.md`
- [ ] T002 [P] Xác nhận bộ test hiện tại xanh trước khi sửa gì: chạy `npm test` trong `rcfeild-be/` và ghi lại kết quả của `src/__tests__/routes/menu.test.ts` + `src/__tests__/routes/swagger.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Đổi nền dữ liệu và vá ngay hai chỗ vỡ tức thì do drop cột.

**⚠️ CRITICAL**: Không user story nào bắt đầu được trước khi phase này xong. T008–T009 **bắt buộc** làm cùng phase — cả seed lẫn test đang INSERT thẳng cột `category` và sẽ vỡ ngay khi T006 chạy.

- [X] T003 [P] Tạo entity `MenuCategory` trong `rcfeild-be/src/models/menu-category.entity.ts` với các cột `id`, `cafeId`, `name` (varchar 50), `displayOrder` (int default 0), `createdAt`, `updatedAt`, `deletedAt` theo `data-model.md` mục 1
- [X] T004 Sửa `rcfeild-be/src/models/menu-item.entity.ts`: bỏ `@Column({type:'enum', enum: FnbCategory}) category` (dòng 31-32) và import `FnbCategory` (dòng 10), thêm `@Column({name:'category_id', type:'uuid', nullable:true}) categoryId: string | null`
- [X] T005 Xóa `enum FnbCategory` khỏi `rcfeild-be/src/types/index.ts` (dòng 334-341)
- [X] T006 Tạo migration `rcfeild-be/src/migrations/1784500000000-CustomMenuCategories.ts` theo SQL đầy đủ ở `data-model.md` mục 3 — thứ tự bắt buộc: tạo bảng → partial unique index **có `WHERE deleted_at IS NULL`** → thêm `category_id` với FK `ON DELETE RESTRICT` → `DROP COLUMN category` → `DROP TYPE fnb_category_enum`; kèm `down()` đầy đủ
- [X] T007 Gỡ tham chiếu `FnbCategory` khỏi `rcfeild-be/src/validate/index.ts`: bỏ import (dòng 16), bỏ trường `category` khỏi `MenuListQuerySchema` (dòng 877) và `CreateMenuItemSchema` (dòng 895), bỏ trường `category` khỏi `MenuItemResponseSchema` (dòng 937) — chỉ gỡ, chưa thêm `category_id` (việc đó thuộc US2)
- [X] T008 [P] Sửa `rcfeild-be/src/seeds/seed-cafes.ts`: bỏ `category` khỏi `INSERT INTO menu_items` (dòng 872) và khỏi 12+ object dữ liệu món (dòng 416-477); thêm hàm seed danh mục tạo sẵn "Đồ uống"/"Ăn vặt" cho mỗi cafe rồi gán `category_id` tương ứng
- [X] T009 [P] Sửa helper `createMenuItem` trong `rcfeild-be/src/__tests__/routes/menu.test.ts` (dòng 27-57): bỏ `category` khỏi câu INSERT và khỏi object `body`
- [ ] T010 Chạy `npm run migration:run` rồi `npm run seed` trong `rcfeild-be/`, sau đó chạy 4 câu SQL kiểm tra ở mục "Chuẩn bị" của `specs/017-custom-menu-categories/quickstart.md` — đặc biệt câu (d) phải thấy chuỗi `WHERE (deleted_at IS NULL)` trong `indexdef`
- [X] T011 Chạy `npx tsc --noEmit` trong `rcfeild-be/` để lộ mọi chỗ còn tham chiếu `FnbCategory` đã bị xóa, sửa hết cho tới khi sạch

**Checkpoint**: Nền dữ liệu xong, `menu_items.category_id` tồn tại, enum đã biến mất, seed và test cũ chạy lại được. Toàn bộ món đang ở "Chưa phân loại" — đúng thiết kế.

---

## Phase 3: User Story 1 — Provider tự tạo và quản lý bộ danh mục (Priority: P1) 🎯 MVP

**Goal**: Provider tạo, đổi tên, sắp xếp, xóa danh mục riêng cho từng chi nhánh.

**Independent Test**: Đăng nhập Provider, vào Menu F&B của một chi nhánh, tạo 3 danh mục, đổi tên 1, kéo đổi thứ tự, xóa 1 danh mục rỗng; kiểm tra chi nhánh thứ hai giữ bộ danh mục riêng. Tương ứng KB-1, KB-2, KB-4 trong `quickstart.md`.

### Tests for User Story 1 ⚠️

> Viết trước, xác nhận FAIL, rồi mới implement.

- [X] T012 [P] [US1] Viết test CRUD danh mục trong `rcfeild-be/src/__tests__/routes/menu-category.test.ts`: list rỗng, list sắp xếp theo `display_order` rồi `created_at`, `itemCount` đúng và **bao gồm** món `is_available = false`, tạo thành công với `displayOrder` tự tăng
- [X] T013 [P] [US1] Viết test ràng buộc tên trong `rcfeild-be/src/__tests__/routes/menu-category.test.ts`: từ chối tên rỗng/chỉ khoảng trắng/>50 ký tự, từ chối trùng tên khác hoa-thường và có khoảng trắng thừa (409), **cho phép trùng tên với danh mục đã xóa mềm (201)**, cho phép trùng tên giữa hai chi nhánh, từ chối khi đủ 30 danh mục
- [X] T014 [P] [US1] Viết test xóa và sắp xếp trong `rcfeild-be/src/__tests__/routes/menu-category.test.ts`: **xóa danh mục còn món → 409 `CATEGORY_NOT_EMPTY` với `details.itemCount` đúng**, **danh mục chỉ còn món tạm ẩn → vẫn 409**, xóa danh mục rỗng → 204 và có `deleted_at`, reorder gán lại `0..N-1`, reorder mảng thiếu/thừa/trùng id → 400
- [X] T015 [P] [US1] Viết test phân quyền trong `rcfeild-be/src/__tests__/routes/menu-category.test.ts`: Provider không sở hữu chi nhánh → 403 mọi endpoint ghi, Staff/Customer → 403, danh mục chi nhánh khác → 404 (không phải 403), khách chưa đăng nhập gọi GET → 200

### Implementation for User Story 1

- [X] T016 [US1] Thêm zod schema danh mục vào `rcfeild-be/src/validate/index.ts`: `CreateMenuCategorySchema` (name trim 1-50), `UpdateMenuCategorySchema`, `ReorderMenuCategoriesSchema` (`category_ids: uuid[]`), `MenuCategoryParamsSchema`, `MenuCategoryResponseSchema` theo `contracts/api.md`
- [X] T017 [US1] Tạo `rcfeild-be/src/services/menu-category.service.ts` với `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`; `createCategory` gán `display_order = COALESCE(MAX(display_order), -1) + 1`; `deleteCategory` đếm `menu_items WHERE category_id = :id AND deleted_at IS NULL` **không lọc `is_available`** và throw `AppError(..., 409, 'CATEGORY_NOT_EMPTY')` — **đây là guard duy nhất cho FR-015**, `ON DELETE RESTRICT` không chạy vì xóa danh mục là `UPDATE` xóa mềm; import `getManagedCafeOrThrow` từ `rcfeild-be/src/services/cafe.service.ts` (đã export sẵn ở dòng 441) cho kiểm tra sở hữu
- [X] T018 [US1] Tạo `rcfeild-be/src/controllers/menu-category.controller.ts` với 5 handler; parse zod trong controller (không parse trong service, theo Constitution)
- [X] T019 [US1] Đăng ký route ghi trong `rcfeild-be/src/routes/menu.routes.ts` — **đặt `/categories` TRƯỚC `/:itemId`** và `/categories/reorder` **TRƯỚC `/categories/:categoryId`**, theo đúng khối mã mẫu ở `contracts/api.md`
- [X] T020 [US1] Đăng ký route đọc công khai trong `rcfeild-be/src/routes/cafe.routes.ts`: `GET /:cafeId/menu/categories` với `optionalAuthenticate`, đặt **trước** dòng `cafeRouter.use('/:cafeId/menu', menuRouter)` (dòng 30)
- [X] T021 [P] [US1] Đăng ký schema và 5 path danh mục vào `rcfeild-be/src/config/openapi/menu.openapi.ts`
- [X] T022 [P] [US1] Thêm type `MenuCategory` và `MenuCategoryUpsertBody` vào `rcfield-fe/src/features/menu/types/index.ts`
- [X] T023 [US1] Thêm `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories` và `menuCategoryQueryKeys` vào `rcfield-fe/src/features/menu/api/menu.api.ts`
- [X] T024 [US1] Tạo `rcfield-fe/src/pages/provider/components/ProviderMenuCategoryDialog.tsx`: danh sách danh mục kèm `itemCount`, tạo/đổi tên inline, kéo sắp xếp, nút xóa hiển thị lỗi 409 kèm số món khi danh mục còn món
- [X] T025 [US1] Sửa `rcfield-fe/src/pages/provider/ProviderMenuPage.tsx`: thêm nút mở `ProviderMenuCategoryDialog`, đổi MetricCard "Category" (dòng 170) để hiển thị **số danh mục thật từ API** thay cho `categoryOptions.length` hardcode (dòng 82, 85)

**Checkpoint**: US1 hoạt động độc lập — Provider quản lý được danh mục, dù món chưa gán được danh mục nào.

---

## Phase 4: User Story 2 — Gán danh mục cho món lẻ và combo (Priority: P1)

**Goal**: Provider gán danh mục cho món và cho combo; combo không còn bị ép vào danh mục "COMBO".

**Independent Test**: Tạo món lẻ gán danh mục vừa tạo; tạo combo 2 món tên "Combo tiết kiệm" và gán danh mục tự chọn; kiểm tra combo giữ đúng danh mục và vẫn nhận diện là combo. Tương ứng KB-5 trong `quickstart.md`.

**Dependency**: cần US1 xong (phải có danh mục để gán).

### Tests for User Story 2 ⚠️

- [X] T026 [P] [US2] Bổ sung test món vào `rcfeild-be/src/__tests__/routes/menu.test.ts`: response trả `categoryId` + `categoryName` và **không còn** trường `category`, lọc `?category_id=<uuid>` đúng, lọc `?category_id=none` trả đúng món chưa phân loại, `POST` món với `category_id` chi nhánh khác → 400 `INVALID_CATEGORY`, `POST` không truyền `category_id` → `categoryId: null`
- [X] T027 [P] [US2] Bổ sung test combo vào `rcfeild-be/src/__tests__/routes/menu.test.ts`: **`POST /combos` với `category_id` giữ đúng danh mục, không bị ép "COMBO"**, không truyền thì `categoryId: null` và `isCombo` vẫn `true`, các luật combo cũ (`COMBO_IN_COMBO`, `USE_COMBO_ENDPOINT`, tối thiểu 2 thành phần) không đổi, thứ tự trả về đặt `categoryId = null` cuối cùng

### Implementation for User Story 2

- [X] T028 [US2] Thêm `category_id` vào `rcfeild-be/src/validate/index.ts`: `CreateMenuItemSchema` (uuid nullable optional), `CreateComboSchema` (uuid nullable optional), `MenuListQuerySchema.category_id` nhận **uuid hoặc literal `none`**, và thêm `categoryId`/`categoryName` vào `MenuItemResponseSchema`
- [X] T029 [US2] Sửa `rcfeild-be/src/services/menu.service.ts`: `listMenuItems` LEFT JOIN `menu_categories` lấy `categoryName`, đổi filter (dòng 111) sang `category_id` với nhánh `none` → `IS NULL`, đổi `ORDER BY` (dòng 121-123) sang `(category_id IS NULL) ASC, mc.display_order ASC, mc.created_at ASC, mi.name ASC`
- [X] T030 [US2] Sửa `rcfeild-be/src/services/menu.service.ts`: `createMenuItem`/`updateMenuItem` nhận `category_id` và kiểm tra danh mục cùng chi nhánh (throw 400 `INVALID_CATEGORY` nếu không), **xóa dòng `category: FnbCategory.COMBO` ở `createCombo` (dòng 214)** và cho `createCombo`/`updateCombo` nhận `category_id` như món lẻ
- [X] T031 [US2] Sửa `rcfeild-be/src/controllers/menu.controller.ts`: truyền `category_id` từ body đã parse xuống service ở cả 4 handler tạo/sửa món và combo
- [X] T032 [P] [US2] Cập nhật `MenuItemResponseSchema` đã đăng ký trong `rcfeild-be/src/config/openapi/menu.openapi.ts` để phản ánh `categoryId`/`categoryName` và query `category_id`
- [X] T033 [P] [US2] Sửa `rcfield-fe/src/features/menu/types/index.ts`: bỏ `FNB_CATEGORIES` và `FNB_CATEGORY_LABEL` (dòng 1-18), đổi `MenuItem.category` thành `categoryId: string | null` + `categoryName: string | null`, đổi `MenuListParams.category` thành `categoryId`, thêm `category_id` vào `MenuUpsertBody` và `ComboUpsertBody`
- [X] T034 [US2] Sửa `rcfield-fe/src/pages/provider/components/ProviderMenuItemFormDialog.tsx`: dropdown danh mục nạp từ API thay `FNB_CATEGORIES` (dòng 202), bỏ giá trị mặc định cứng `"Đồ uống"` (dòng 27), cho phép chọn "Chưa phân loại"
- [X] T035 [US2] Sửa `rcfield-fe/src/pages/provider/components/ProviderComboFormDialog.tsx`: **thêm mới** dropdown chọn danh mục cho combo (trường chưa từng tồn tại) và gửi `category_id` khi submit
- [X] T036 [US2] Sửa `rcfield-fe/src/pages/provider/ProviderMenuPage.tsx`: bộ lọc danh mục nạp từ API kèm lựa chọn "Chưa phân loại" (dòng 216-228, 64), cột bảng hiển thị `item.categoryName` thay biểu thức hardcode `item.isCombo ? "Combo" : FNB_CATEGORY_LABEL[...]` (dòng 258)

**Checkpoint**: US1 + US2 hoạt động — Provider quản lý danh mục và gán được cho cả món lẻ lẫn combo.

---

## Phase 5: User Story 3 — Khách hàng và Staff duyệt menu đúng tên danh mục (Priority: P2)

**Goal**: Mọi màn hình hướng người dùng hiển thị tên tiếng Việt Provider nhập, đúng thứ tự, "Chưa phân loại" ở cuối. Sửa luôn lỗi đang hiện mã thô `DRINK`.

**Independent Test**: Mở trang chi tiết chi nhánh bằng tài khoản khách và bước chọn món trong luồng đặt lịch; xác nhận không còn chuỗi `FOOD`/`DRINK`/`SNACK`/`DESSERT`/`COMBO`/`OTHER` nào. Tương ứng KB-6, KB-7 trong `quickstart.md`.

**Dependency**: cần US2 xong (API phải trả `categoryName`).

- [X] T037 [P] [US3] Sửa `rcfield-fe/src/pages/booking/components/checkout/FnbStep.tsx`: Badge dùng `item.categoryName` thay `item.category` thô (dòng 90-91), bỏ nhánh hiển thị chữ "Combo" cứng cho `isCombo` (dòng 88-89) để combo hiện danh mục Provider đã gán
- [X] T038 [P] [US3] Sửa `rcfield-fe/src/pages/customer/cafe-detail/components/CafeFnbSection.tsx`: nhóm món theo `categoryName` thay `item.category ?? "Menu"` (dòng 73, 103), sắp theo thứ tự API trả, đặt nhóm "Chưa phân loại" cuối cùng, **ẩn nhóm rỗng** kể cả nhóm "Chưa phân loại". ⚠️ Tiêu chí ẩn: nhóm **không có món nào trong tập kết quả đã lọc `available=true`** — **TUYỆT ĐỐI không** dùng `itemCount` từ endpoint danh mục, vì trường đó đếm cả món tạm ngưng bán nên danh mục có 3 món đều ẩn sẽ có `itemCount = 3` mà vẫn phải giấu khỏi khách (FR-021)
- [X] T039 [P] [US3] Sửa `rcfield-fe/src/pages/staff/StaffSessionDetailPage.tsx`: hiển thị danh mục trong danh sách món khi Staff thêm món tại quầy (dòng 223-224) — màn này hiện **chưa** hiển thị danh mục, đây là bổ sung mới theo acceptance scenario US3-6
- [ ] T040 [US3] Chạy KB-6 và KB-7 trong `specs/017-custom-menu-categories/quickstart.md`, xác nhận không màn nào còn hiện mã kỹ thuật và thứ tự nhóm khớp giữa màn quản lý với màn khách

**Checkpoint**: US1 + US2 + US3 xong — đây là ranh giới có thể phát hành. Xem cảnh báo đầu file: phải merge từ Phase 2 tới đây trong cùng một PR.

---

## Phase 6: User Story 4 — Trợ lý AI trả lời thực đơn theo danh mục (Priority: P3)

**Goal**: Trợ lý nhóm món theo tên danh mục Provider đặt thay vì mã enum.

**Independent Test**: Hỏi widget chat "Quán có đồ uống gì?", xác nhận nhóm theo tên Provider đặt. Tương ứng KB-9 trong `quickstart.md`.

**Dependency**: cần US2 xong. Đây là story duy nhất tách ra PR riêng được.

- [X] T041 [US4] Sửa `rcfeild-be/src/services/chat-tools/get-menu.ts`: LEFT JOIN `menu_categories` lấy tên thật, đổi `ORDER BY category ASC` (dòng 26-29) sang `mc.display_order ASC NULLS LAST, price ASC`, đổi khóa gom nhóm từ giá trị enum sang tên danh mục với fallback `'Chưa phân loại'` (dòng 37-39)
- [ ] T042 [US4] Chạy KB-9 trong `specs/017-custom-menu-categories/quickstart.md`, xác nhận câu trả lời không chứa mã `DRINK`/`FOOD`

**Checkpoint**: Cả 4 user story hoạt động.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 [P] Chạy `npx tsc --noEmit` ở cả `rcfeild-be/` và `rcfield-fe/`, sửa sạch mọi lỗi kiểu còn lại
- [X] T044 [P] Xác nhận `grep -rn "FNB_CATEGORIES\|FNB_CATEGORY_LABEL\|FnbCategory" rcfield-fe/src rcfeild-be/src` không còn kết quả nào ngoài file migration lịch sử `rcfeild-be/src/migrations/1751300000002-FnbCategoryEnumAndCombo.ts`
- [ ] T045 [P] Chạy lại `rcfeild-be/src/__tests__/routes/swagger.test.ts` và `walk-in-booking.test.ts`, xác nhận không hồi quy
- [ ] T046 Chạy KB-8 trong `specs/017-custom-menu-categories/quickstart.md` — đổi tên danh mục rồi kiểm tra chi tiết booking, màn Staff, Top F&B dashboard, email hóa đơn **đều không đổi** (FR-024, SC-005)
- [ ] T047 Chạy 3 câu SQL xác minh sau triển khai ở cuối `specs/017-custom-menu-categories/quickstart.md`, đối chiếu với baseline đã ghi ở T001 — số món và tổng tiền đơn F&B phải khớp tuyệt đối
- [ ] T048 Chạy toàn bộ 10 kịch bản KB-1 → KB-10 trong `specs/017-custom-menu-categories/quickstart.md` và tick hết checklist test tự động
- [X] T049 [P] Thêm `'custom-menu-categories/tasks'` vào category `017 · Custom Menu Categories` trong `website/sidebars-specs.ts`
- [ ] T050 Viết mô tả PR nêu rõ 3 điểm: (a) migration **không** khôi phục được phân loại cũ khi rollback, (b) sau khi deploy toàn bộ menu về "Chưa phân loại" và Provider phải phân loại lại, (c) hai khoản nợ kỹ thuật ghi ở `specs/017-custom-menu-categories/plan.md` mục "Nợ kỹ thuật ghi nhận"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: không phụ thuộc, chạy ngay
- **Phase 2 (Foundational)**: phụ thuộc Phase 1 — **CHẶN toàn bộ user story**
- **Phase 3 (US1)**: phụ thuộc Phase 2
- **Phase 4 (US2)**: phụ thuộc US1 — cần có danh mục để gán
- **Phase 5 (US3)**: phụ thuộc US2 — cần API trả `categoryName`
- **Phase 6 (US4)**: phụ thuộc US2 — tách PR riêng được
- **Phase 7 (Polish)**: phụ thuộc mọi story mong muốn

### User Story Dependencies

Khác với mặc định của template, các story ở đây **có phụ thuộc tuyến tính thật**:

```
Phase 2 ──► US1 ──► US2 ──┬──► US3 ──► (ranh giới phát hành)
                          └──► US4 (tách PR riêng được)
```

US1 không gán được danh mục cho món; US2 không có gì để gán nếu thiếu US1; US3 không hiển thị được tên nếu API chưa trả `categoryName` từ US2. Không nên hứa hẹn ba story này chạy song song.

### Within Each User Story

- Test viết trước và phải FAIL trước khi implement
- Entity → service → controller → route → OpenAPI
- Backend xong trước frontend của cùng story
- Story xong hẳn rồi mới sang story tiếp theo

### Parallel Opportunities

- **T002** song song với T001
- **T003, T008, T009** song song trong Phase 2 (khác file, T008/T009 không phụ thuộc entity)
- **T012–T015** song song — bốn nhóm test độc lập, cùng viết vào file test mới
- **T021, T022** song song với nhau (OpenAPI backend ↔ types frontend)
- **T026, T027** song song
- **T032, T033** song song
- **T037, T038, T039** song song — ba file frontend độc lập, đây là cụm song song lớn nhất
- **T043, T044, T045, T049** song song trong Phase 7

---

## Parallel Example: User Story 1

```bash
# Bốn nhóm test viết song song (cùng file mới, chia theo mô tả `describe`):
Task: "T012 test CRUD danh mục trong rcfeild-be/src/__tests__/routes/menu-category.test.ts"
Task: "T013 test ràng buộc tên trong rcfeild-be/src/__tests__/routes/menu-category.test.ts"
Task: "T014 test xóa và sắp xếp trong rcfeild-be/src/__tests__/routes/menu-category.test.ts"
Task: "T015 test phân quyền trong rcfeild-be/src/__tests__/routes/menu-category.test.ts"
```

## Parallel Example: User Story 3

```bash
# Ba file frontend hoàn toàn độc lập:
Task: "T037 sửa rcfield-fe/src/pages/booking/components/checkout/FnbStep.tsx"
Task: "T038 sửa rcfield-fe/src/pages/customer/cafe-detail/components/CafeFnbSection.tsx"
Task: "T039 sửa rcfield-fe/src/pages/staff/StaffSessionDetailPage.tsx"
```

---

## Implementation Strategy

### MVP thật sự = Phase 1 + 2 + US1 + US2 + US3

Không thể dừng ở US1 rồi deploy như feature thông thường. Sau Phase 2, cột `category` đã biến mất; nếu chưa có US2 và US3 thì màn khách hàng và luồng đặt lịch sẽ hỏng. Ranh giới phát hành an toàn sớm nhất là **hết T040**.

1. Phase 1 → chốt baseline
2. Phase 2 → nền dữ liệu (**không merge ở đây**)
3. US1 → validate KB-1, KB-2, KB-4
4. US2 → validate KB-5
5. US3 → validate KB-6, KB-7
6. **DỪNG, chạy KB-8 + T047** → xác nhận không mất dữ liệu, không đụng đơn đã phát sinh
7. Merge PR #1

### Incremental Delivery sau MVP

- PR #2: US4 (trợ lý AI) — độc lập hoàn toàn, không rủi ro dữ liệu
- PR #3 (nợ kỹ thuật, ngoài phạm vi): enforce subscription cho cả module menu; mở quyền ADMIN

### Parallel Team Strategy

Feature này **không hợp chia song song theo story** vì phụ thuộc tuyến tính. Chia theo tầng thì hiệu quả hơn:

1. Cả nhóm cùng làm Phase 1 + 2 (nền dữ liệu, không tách được)
2. Sau đó:
   - Dev A: backend US1 → US2 (T016–T021, T028–T032)
   - Dev B: frontend US1 → US2 (T022–T025, T033–T036), bám theo `contracts/api.md` để không phải chờ backend
   - Dev C: viết test US1 (T012–T015) song song, rồi làm US3 (T037–T039) khi US2 xong

---

## Notes

- Tổng **50 task**: Setup 2, Foundational 9, US1 14, US2 11, US3 4, US4 2, Polish 8
- Test tasks: 6 (T012–T015, T026, T027) — được yêu cầu tường minh qua `quickstart.md` và Constitution nguyên tắc V
- `[P]` = khác file, không phụ thuộc task chưa xong
- Commit sau mỗi task hoặc mỗi nhóm hợp lý; **không** merge trước T040
- Ba bẫy nhắc lại lần cuối: thứ tự đăng ký route (T019, T020), `WHERE deleted_at IS NULL` trong unique index (T006), không lọc `is_available` khi đếm món chặn xóa (T017)
