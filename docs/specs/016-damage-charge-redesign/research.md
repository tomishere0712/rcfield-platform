# Research: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Date**: 2026-07-14
**Feature**: `specs/016-damage-charge-redesign/spec.md`

---

## Decision 1: Lưu trữ DamageLineItem — bảng riêng vs. JSONB

**Decision**: Tạo bảng mới `damage_line_items` với FK trỏ về `inspections.id`.

**Rationale**: Cần query độc lập cho màn hình lịch sử Provider (P3); từng hạng mục có lifecycle riêng (có thể bị xoá khi staff chỉnh sửa); Constitution yêu cầu mọi entity có `created_at`, `updated_at`, `deleted_at`; index-able cho tổng hợp báo cáo.

**Alternatives considered**:
- JSONB trên `inspections.ai_analysis_json` — rejected: không query được từng hạng mục, conflict với field hiện tại, không audit-able theo từng dòng.
- JSONB column mới `damage_items_json` — rejected: vẫn không query được, Constitution không ủng hộ JSONB cho structured data có business logic.

---

## Decision 2: Session state cho in-person checkout flow

**Decision**: Tái sử dụng trạng thái `CHECKING_OUT` cho "đang chờ xác nhận tại quầy".

**Rationale**: Không cần state mới; `CHECKING_OUT` đúng nghĩa (session đang trong quy trình checkout); Constitution II cấm thêm dispute state và yêu cầu dùng `incidents` — không liên quan đến trạng thái checkout bình thường; không cần migration enum.

**Alternatives considered**:
- Thêm state `CONFIRMING_AT_COUNTER` — rejected: yêu cầu amendment Constitution + DB migration, không đủ giá trị thêm.

---

## Decision 3: Trigger settlement trong flow mới

**Decision**: Endpoint mới `POST /staff/sessions/:sessionId/confirm-checkout` do STAFF gọi sau khi khách xác nhận tại quầy. Thay thế `customerConfirmInspection` cho checkout có hư hỏng.

**Rationale**: Settlement trước đây được trigger từ phía customer qua app; nay trigger từ STAFF (thay mặt khách xác nhận tại chỗ). Auth semantics rõ ràng hơn; không cần STAFF gọi endpoint customer.

**Alternatives considered**:
- Tái sử dụng `customerConfirmInspection` nhưng cho phép STAFF gọi — rejected: pha trộn auth roles, khó audit.
- Gọi settlement trực tiếp trong `submitInspection` — rejected: bỏ qua bước xem biên bản, không có cơ hội chỉnh sửa khi tranh chấp.

---

## Decision 4: Backward compatibility — trường `damageCostEstimate`

**Decision**: Giữ nguyên cột `damage_cost_estimate` trên bảng `inspections` (nullable). Inspections mới dùng `damage_line_items`; settlement function đọc SUM từ line items nếu có, fallback về `damageCostEstimate * 1.5` cho records cũ.

**Rationale**: Dữ liệu cũ vẫn hợp lệ; migration toàn bộ historical data là out-of-scope và rủi ro; fallback logic đơn giản và an toàn.

**Alternatives considered**:
- Migration hết data cũ sang line items — rejected: out-of-scope, rủi ro data loss.
- Drop column ngay — rejected: break báo cáo lịch sử và queries hiện tại.

---

## Decision 5: Lưu trữ tranh chấp leo thang lên Provider

**Decision**: Tạo record `incidents` khi staff escalate dispute. Constitution II đã định nghĩa `incidents` table cho đúng mục đích này.

**Rationale**: Constitution II nói rõ: *"Damage disagreement in Phase 1 MUST be logged and resolved through `incidents`"*. Reuse table đã có, không phát minh thêm cơ chế.

**Alternatives considered**:
- Thêm field `dispute_note`, `dispute_escalated_at` vào `inspections` — rejected: violates Constitution II.
- Tạo bảng `damage_disputes` mới — rejected: duplicate của `incidents`, không align với governance.

---

## Decision 6: Checkout Summary — trang riêng vs. modal

**Decision**: Trang riêng tại route `/staff/sessions/:sessionId/checkout-summary`.

**Rationale**: FR-009 yêu cầu staff có thể quay lại màn hình tổng kết bất cứ lúc nào (trước khi quyết toán). Page có URL và trạng thái persist; modal sẽ mất khi navigate, không thể bookmark/re-open.

**Alternatives considered**:
- Modal overlay — rejected: đóng khi navigate, không revisitable, UX kém trên tablet quầy.
- Component inline trong session detail — rejected: khó phân tách concern, tổng kết cần toàn màn hình để khách đứng cạnh đọc.

---

## Decision 7: STAFF_MANUAL — bỏ auto-settle

**Decision**: STAFF_MANUAL không còn auto-confirm ngay sau `submitInspection`. Session → CHECKING_OUT → staff xem summary → `confirm-checkout` → COMPLETED.

**Rationale**: Spec yêu cầu mọi booking kể cả STAFF_MANUAL đều đi qua màn hình tổng kết để khách nhìn thấy.

**Alternatives considered**:
- Giữ auto-settle cho STAFF_MANUAL — rejected: vi phạm spec FR-008 và FR-009.

---

## Decision 8: Part type enum

**Decision**: Enum `DamagePartType` với 8 giá trị cố định trong phiên bản đầu:
`TIRE_WHEEL | SPOILER | CHASSIS | MOTOR | SHELL | SERVO | REMOTE | OTHER`

**Rationale**: Danh sách cố định theo spec FR-003; Admin có thể mở rộng sau (giả định trong spec). Dùng enum trong DB đảm bảo data integrity.

**Alternatives considered**:
- Free-text string — rejected: không validate, khó aggregate cho báo cáo.
- Lookup table riêng — rejected: over-engineering cho phiên bản đầu.

---

## Phát hiện bug hiện tại (cần fix trong feature này)

- **Bug**: `settleSessionCheckoutBilling` đọc `inspection.aiAnalysisJson?.damageMultiplier` nhưng field này chưa bao giờ được set → luôn fallback về `1.5` bất kể xe gì. Feature này fix hoàn toàn bằng cách bỏ multiplier logic.
- **Bug**: `submitInspection` nhận `damageMultiplier` từ FE nhưng không lưu vào DB (chỉ lưu `damageCostEstimate`). Fix bằng cách thay toàn bộ bằng line items.
- **Dead code**: `CustomerDamageReviewPage` dùng mock data, không connect API, không được gọi đúng flow. Cần xoá hoặc redirect.
