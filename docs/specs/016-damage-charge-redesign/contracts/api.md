# API Contracts: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Date**: 2026-07-14
**Auth**: Tất cả endpoint STAFF yêu cầu `Authorization: Bearer <jwt>` với role `STAFF`.

---

## Endpoint sửa đổi

### `POST /v1/staff/sessions/:sessionId/inspections`

**Hiện tại** (giữ nguyên phần check-in, chỉ sửa phần damage check-out)
**Auth**: STAFF
**File**: `rcfeild-be/src/controllers/staff.controller.ts` → `rcfeild-be/src/services/staff.service.ts:submitInspection()`

#### Request body — thay đổi field `damageDetails` → `damageLineItems`

```typescript
{
  type: "CHECK_IN" | "CHECK_OUT";
  photos: {
    angle: "FRONT" | "BACK" | "LEFT" | "RIGHT";
    url: string;
    notes?: string;
  }[];
  checklist: {
    itemKey: string;
    itemLabel: string;
    status: "OK" | "BROKEN";
    note?: string;
  }[];
  staffNotes?: string;
  damageFlagged: boolean;

  // THAY THẾ damageDetails
  // Bắt buộc nếu damageFlagged = true và type = CHECK_OUT
  damageLineItems?: {
    partType: "TIRE_WHEEL" | "SPOILER" | "CHASSIS" | "MOTOR" | "SHELL" | "SERVO" | "REMOTE" | "OTHER";
    customPartName?: string;  // bắt buộc khi partType = "OTHER"
    partsPrice: number;       // >= 0, VNĐ, bắt buộc
    laborPrice?: number;      // >= 0, VNĐ, mặc định 0
  }[];
}
```

#### Thay đổi hành vi (so với hiện tại)

| Hành vi | Cũ | Mới |
|---------|----|-----|
| STAFF_MANUAL auto-settle | Gọi `settleSessionCheckoutBilling` ngay | KHÔNG, session → CHECKING_OUT |
| WebSocket to customer | Gửi `SESSION_CHECKOUT_INSPECTION` | KHÔNG gửi cho CHECK_OUT |
| Session state (non-STAFF_MANUAL) | CHECKING_OUT | CHECKING_OUT (giữ) |
| Lưu damage data | `damageCostEstimate` vào `inspections` | Lưu records vào `damage_line_items` |

#### Response (không đổi)
```typescript
{
  success: true;
  data: {
    inspectionId: string;
    sessionId: string;
    type: string;
    damageNoted: boolean;
    damageLineItems?: {
      id: string;
      partType: string;
      customPartName: string | null;
      partsPrice: number;
      laborPrice: number;
      lineTotal: number;
    }[];
    totalDamageCharge?: number;  // SUM của tất cả line items
  }
}
```

---

## Endpoint mới

### `POST /v1/staff/sessions/:sessionId/confirm-checkout`

**Mục đích**: Staff xác nhận checkout sau khi khách đồng ý tại quầy. Thay thế `customerConfirmInspection` cho CHECK_OUT flow.
**Auth**: STAFF

#### Request body
```typescript
{
  inspectionId: string;
}
```

#### Business logic (gọi trong `staff.service.ts:staffConfirmCheckout()`)
1. Validate session ở trạng thái `CHECKING_OUT`
2. Validate inspection thuộc session và type = `CHECK_OUT`
3. Đánh dấu `inspection.customerConfirmed = true`, `inspection.customerConfirmedAt = now()`
4. Gọi `settleSessionCheckoutBilling(sessionId, inspection)`
5. Session → `COMPLETED`, `actualEndAt = now()`
6. Cập nhật vehicle/sessionVehicle status
7. Booking → `AWAITING_PAYMENT` hoặc `COMPLETED`

#### Response
```typescript
{
  success: true;
  data: {
    sessionId: string;
    sessionStatus: "COMPLETED";
    settlement: {
      damageCharge: number;
      depositConsumedByDamage: number;
      depositRefundAmount: number;
      damageExceedingDeposit: number;
      totalCounterBill: number;
    }
  }
}
```

#### Error codes
| Code | HTTP | Khi nào |
|------|------|---------|
| `SESSION_NOT_CHECKING_OUT` | 400 | Session không ở CHECKING_OUT |
| `INSPECTION_NOT_FOUND` | 404 | inspectionId không tồn tại hoặc không thuộc session |
| `ALREADY_CONFIRMED` | 400 | inspection đã confirmed rồi |

---

### `PUT /v1/staff/sessions/:sessionId/inspections/:inspectionId/damage-items`

**Mục đích**: Staff chỉnh sửa danh sách hạng mục hư hỏng khi khách tranh chấp tại quầy.
**Auth**: STAFF

#### Request body
```typescript
{
  damageLineItems: {
    partType: "TIRE_WHEEL" | "SPOILER" | "CHASSIS" | "MOTOR" | "SHELL" | "SERVO" | "REMOTE" | "OTHER";
    customPartName?: string;
    partsPrice: number;  // >= 0
    laborPrice?: number; // >= 0, default 0
  }[];
}
```

#### Business logic
1. Validate session ở `CHECKING_OUT`
2. Soft-delete tất cả `damage_line_items` hiện tại của inspection
3. Tạo mới các items từ request body
4. Trả về danh sách mới và tổng mới

#### Response
```typescript
{
  success: true;
  data: {
    inspectionId: string;
    damageLineItems: {
      id: string;
      partType: string;
      customPartName: string | null;
      partsPrice: number;
      laborPrice: number;
      lineTotal: number;
    }[];
    totalDamageCharge: number;
  }
}
```

---

### `POST /v1/staff/sessions/:sessionId/escalate-dispute`

**Mục đích**: Staff leo thang tranh chấp lên Provider khi không thể thống nhất tại quầy.
**Auth**: STAFF

#### Request body
```typescript
{
  inspectionId: string;
  note: string;  // mô tả điểm tranh chấp, bắt buộc, không rỗng
}
```

#### Business logic
1. Validate session ở `CHECKING_OUT`
2. Tạo record `incidents` với `status = 'OPEN'`, `responsible_party`, `resolution_note = note`
3. Ghi nhận `escalated_at` timestamp trên incident
4. Session giữ nguyên `CHECKING_OUT` (luồng xử lý Provider nằm ngoài scope)

#### Response
```typescript
{
  success: true;
  data: {
    incidentId: string;
    sessionId: string;
    note: string;
    createdAt: string;
  }
}
```

---

## Endpoint GET sửa đổi

### `GET /v1/staff/sessions/:sessionId` (checkout summary)

**Thêm vào response** khi session ở `CHECKING_OUT` hoặc `COMPLETED`:

```typescript
// Thêm vào session detail response
checkoutInspection?: {
  inspectionId: string;
  damageNoted: boolean;
  checkInPhotos: { angle: string; url: string }[];
  checkOutPhotos: { angle: string; url: string }[];
  damageLineItems: {
    id: string;
    partType: string;
    customPartName: string | null;
    partsPrice: number;
    laborPrice: number;
    lineTotal: number;
  }[];
  totalDamageCharge: number;
  customerConfirmed: boolean;
}
```

---

## Endpoint giữ nguyên

- `POST /v1/staff/bookings/:bookingId/settle-pending-payments` — không thay đổi
- `POST /v1/sessions/:sessionId/inspections/:inspectionId/confirm` — giữ cho CHECK_IN flow (customer confirms check-in), không dùng cho CHECK_OUT nữa
- Tất cả các endpoint CHECK_IN inspection — không thay đổi

---

## Frontend API calls cần sửa

| File | Thay đổi |
|------|---------|
| `rcfield-fe/src/features/staff/api/staff.api.ts` | Sửa body của `submitInspection` (bỏ `damageDetails`, thêm `damageLineItems`) |
| `rcfield-fe/src/features/staff/api/staff.api.ts` | Thêm `confirmCheckout(sessionId, inspectionId)` |
| `rcfield-fe/src/features/staff/api/staff.api.ts` | Thêm `updateDamageItems(sessionId, inspectionId, items)` |
| `rcfield-fe/src/features/staff/api/staff.api.ts` | Thêm `escalateDispute(sessionId, inspectionId, note)` |
