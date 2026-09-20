# Data Model: Quản lý thu chi giải đấu

**Feature**: `018-contest-finance` | **Date**: 2026-08-08 | **Phase**: 1

---

## Tổng quan thay đổi

| Đối tượng | Loại | Mô tả |
|---|---|---|
| `contest_ledger_entries` | **Bảng mới** | Sổ cái thu/chi thủ công của một giải |
| `contest_registrations.entry_fee_payment_method` | **Cột mới** | Phương thức đã nhận tiền lệ phí, nullable |
| Báo cáo tài chính | **Không lưu trữ** | Tính tại chỗ từ 3 nguồn, xem [D10](./research.md#d10--báo-cáo-tính-tại-chỗ-không-bảng-tổng-hợp) |

Không có bảng nào bị xoá, không có cột nào đổi kiểu. Toàn bộ thay đổi là cộng thêm, nên migration không phá dữ liệu sẵn có.

---

## Bảng mới: `contest_ledger_entries`

```sql
CREATE TABLE IF NOT EXISTS contest_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id      UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  direction       VARCHAR(3)  NOT NULL,
  category        VARCHAR(30) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  amount          NUMERIC(15,2) NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  note            TEXT,
  receipt_url     TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_by_role VARCHAR(30) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT chk_contest_ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_contest_ledger_direction CHECK (direction IN ('IN','OUT'))
);

CREATE INDEX idx_contest_ledger_contest
  ON contest_ledger_entries(contest_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_contest_ledger_contest_direction
  ON contest_ledger_entries(contest_id, direction) WHERE deleted_at IS NULL;

CREATE INDEX idx_contest_ledger_creator
  ON contest_ledger_entries(contest_id, created_by) WHERE deleted_at IS NULL;
```

### Giải thích từng cột

| Cột | Quyết định | Căn cứ |
|---|---|---|
| `contest_id` | `ON DELETE CASCADE` | Giải bị xoá cứng thì sổ của nó vô nghĩa. Thực tế `contests` dùng xoá mềm nên nhánh này gần như không chạy. |
| `direction` | `varchar(3)` + `CHECK`, không native enum | [D2](./research.md#d2--category-là-varchar-kiểm-ở-tầng-zod-không-dùng-native-enum-của-postgres). `direction` chỉ có 2 giá trị và sẽ không bao giờ thêm, nên `CHECK` ở đây an toàn. |
| `category` | `varchar(30)`, **không** `CHECK` | Tập giá trị ép ở zod. Cố ý không khoá ở DB để thêm loại khoản về sau không cần `ALTER TABLE`. |
| `amount` | `numeric(15,2)` | Khớp `contests.entry_fee` và `contest_registrations.entry_fee_amount`. Hiển thị làm tròn về đồng ở tầng FE (FR-030), **không** làm tròn khi lưu. |
| `amount > 0` | `CHECK` ở DB | FR-004. Đặt ở DB vì đây là bất biến tuyệt đối, không phụ thuộc ngữ cảnh. |
| `occurred_at` | Người dùng nhập, mặc định hôm nay | Khác `created_at`. Tiền cọc trả tuần trước vẫn ghi được hôm nay với `occurred_at` đúng ngày thật. |
| `note` | `TEXT`, nullable ở DB | Bắt buộc với nhân viên (FR-020) nhưng tuỳ chọn với chủ doanh nghiệp → ràng buộc thuộc về zod theo vai trò, không phải DB. |
| `created_by_role` | `varchar(30)`, chụp lại lúc tạo | FR-006. Nhân viên có thể đổi vai trò hoặc bị gỡ phân công về sau; báo cáo vẫn phải nói đúng "ai ghi, với tư cách gì". |
| `deleted_at` | Xoá mềm | FR-007 + quy ước bắt buộc của Constitution. |

### Index — vì sao chọn như vậy

Cả ba index đều `WHERE deleted_at IS NULL`, vì mọi truy vấn của tính năng đều lọc bản ghi chưa xoá:

- `idx_contest_ledger_contest` — truy vấn nền của báo cáo và danh sách sổ.
- `idx_contest_ledger_contest_direction` — báo cáo tách nhóm thu/chi (FR-014).
- `idx_contest_ledger_creator` — nhân viên xem lại bút toán của chính mình (FR-021).

Không index `category`: mỗi giải chỉ vài chục dòng, gom nhóm trong bộ nhớ rẻ hơn duy trì thêm index.

---

## Cột mới: `contest_registrations.entry_fee_payment_method`

```sql
ALTER TABLE contest_registrations
  ADD COLUMN IF NOT EXISTS entry_fee_payment_method VARCHAR(20);
```

Nullable, không `DEFAULT`, không backfill — xem [D9](./research.md#d9--entry_fee_payment_method-nullable-không-backfill).

| Giá trị | Ghi khi nào |
|---|---|
| `ONLINE` | Thanh toán VNPay hoàn tất |
| `CASH` | Người vận hành chọn khi đánh dấu đã thu tiền mặt |
| `TRANSFER` | Người vận hành chọn khi đánh dấu đã nhận chuyển khoản |
| `NULL` | Bản ghi cũ, hoặc `payment_status` chưa phải `MARKED_PAID` |

**Bất biến**: cột này chỉ có nghĩa khi `payment_status = 'MARKED_PAID'`. Ở mọi trạng thái khác nó phải là `NULL`. Không ràng buộc ở DB vì `WAIVED` và `MARKED_PAID` có thể chuyển qua lại; giữ ở tầng service.

---

## Enum TypeScript (`src/types/index.ts`)

```typescript
export enum ContestLedgerDirection {
  IN = 'IN',
  OUT = 'OUT',
}

/** Loại khoản thu — hợp lệ khi direction = IN. FR-002. */
export enum ContestLedgerIncomeCategory {
  ENTRY_FEE_ADJUSTMENT = 'ENTRY_FEE_ADJUSTMENT',
  SPONSORSHIP = 'SPONSORSHIP',
  TICKET = 'TICKET',
  FNB = 'FNB',
  OTHER = 'OTHER',
}

/** Loại khoản chi — hợp lệ khi direction = OUT. FR-003. */
export enum ContestLedgerExpenseCategory {
  PRIZE_CASH = 'PRIZE_CASH',
  PRIZE_ITEM = 'PRIZE_ITEM',
  VENUE = 'VENUE',
  STAFF = 'STAFF',
  MARKETING = 'MARKETING',
  FNB = 'FNB',
  OTHER = 'OTHER',
}

export enum ContestEntryFeePaymentMethod {
  ONLINE = 'ONLINE',
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}
```

`FNB` và `OTHER` xuất hiện ở cả hai enum. Đó là chủ ý — quán có thể vừa thu tiền đồ uống bán trong ngày thi, vừa chi tiền mua nước cho trọng tài. Cột `direction` phân biệt, nên trùng tên không gây nhập nhằng.

---

## Entity (`src/models/contest-ledger-entry.entity.ts`)

```typescript
@Entity('contest_ledger_entries')
@Index(['contestId', 'direction'])
@Index(['contestId', 'createdBy'])
export class ContestLedgerEntry {
  @PrimaryGeneratedColumn('uuid')  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })          contestId: string;
  @Column({ type: 'varchar', length: 3 })                direction: ContestLedgerDirection;
  @Column({ type: 'varchar', length: 30 })               category: string;
  @Column({ type: 'varchar', length: 255 })              title: string;
  @Column({ type: 'numeric', precision: 15, scale: 2 })  amount: number;
  @Column({ name: 'occurred_at', type: 'timestamptz' })  occurredAt: Date;
  @Column({ type: 'text', nullable: true })              note: string | null;
  @Column({ name: 'receipt_url', type: 'text', nullable: true }) receiptUrl: string | null;
  @Column({ name: 'created_by', type: 'uuid' })          createdBy: string;
  @Column({ name: 'created_by_role', type: 'varchar', length: 30 }) createdByRole: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
}
```

⚠️ **Bẫy `numeric`**: TypeORM trả cột `numeric` về dưới dạng **chuỗi**, không phải số. Mọi phép cộng phải bọc `Number(...)` — đúng như `contest-fee.service.ts:46` (`amount: Number(order.amount)`) và `registrations.ts:190` đang làm. Cộng thẳng sẽ ra chuỗi nối, ví dụ `"1500000" + "200000" = "1500000200000"`.

---

## Migration

`src/migrations/1785700000000-ContestLedgerAndEntryFeeMethod.ts`

Timestamp kế tiếp sau `1785600000000-AddProviderTaxVerification.ts` (migration mới nhất hiện tại).

```typescript
export class ContestLedgerAndEntryFeeMethod1785700000000 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS contest_ledger_entries ( ... );   -- DDL ở trên
      CREATE INDEX ...;                                            -- 3 index ở trên
    `);
    await qr.query(`
      ALTER TABLE contest_registrations
        ADD COLUMN IF NOT EXISTS entry_fee_payment_method VARCHAR(20)
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE contest_registrations DROP COLUMN IF EXISTS entry_fee_payment_method`);
    await qr.query(`DROP TABLE IF EXISTS contest_ledger_entries CASCADE`);
  }
}
```

Chạy với `--transaction each` theo `package.json:17`. Không có `ALTER TYPE` nên toàn bộ nằm gọn trong một transaction — đây chính là lợi ích của [D2](./research.md#d2--category-là-varchar-kiểm-ở-tầng-zod-không-dùng-native-enum-của-postgres).

---

## Hình dạng báo cáo (không lưu trữ)

Kết quả của `buildContestFinanceReport(contestId)`. Mọi số là **number**, đơn vị đồng.

```typescript
{
  contest_id: string;

  entry_fee: {
    collected_total: number;              // Σ entry_fee_amount, payment_status = MARKED_PAID
    collected_by_method: {
      ONLINE: number;
      CASH: number;
      TRANSFER: number;
      UNKNOWN: number;                    // entry_fee_payment_method IS NULL — FR-029
    };
    pending_total: number;                // PENDING_PAYMENT + PENDING_REVIEW — D8
    waived_total: number;                 // WAIVED — tham khảo, KHÔNG vào tổng thu (FR-011)
    counts: { collected: number; pending: number; waived: number };
  };

  income: {
    total: number;                        // Σ bút toán IN
    by_category: Array<{ category: string; total: number; count: number }>;
  };

  expense: {
    total: number;                        // Σ bút toán OUT + platform_fee.amount
    by_category: Array<{ category: string; total: number; count: number }>;
    platform_fee: {                       // dòng ảo — D11
      amount: number;                     // 0 nếu chưa có đơn PAID
      plan_name: string | null;
      editable: false;                    // FR-013
    };
  };

  summary: {
    total_income: number;                 // entry_fee.collected_total + income.total
    total_expense: number;                // expense.total
    net: number;                          // total_income − total_expense
  };
}
```

### Ba nguồn dữ liệu

| Nguồn | Bảng | Lọc |
|---|---|---|
| Lệ phí | `contest_registrations` | `contest_id = $1`, loại đăng ký `CANCELLED` chưa từng `MARKED_PAID` (FR-009a) |
| Thu/chi thủ công | `contest_ledger_entries` | `contest_id = $1 AND deleted_at IS NULL` |
| Phí tổ chức | `contest_fee_orders` ⋈ `contest_fee_plans` | `contest_id = $1 AND status = 'PAID'` (FR-012) |

**`waived_total` không nằm trong `summary.total_income`.** Nó là con số tham khảo về doanh thu đã bỏ qua, đặt cạnh nhau để chủ doanh nghiệp thấy mình miễn bao nhiêu. Cộng nhầm vào tổng thu là lỗi dễ mắc nhất — đã có test bắt (research D14, bất biến #3).

---

## Vòng đời bút toán

```
        tạo                sửa (chỉ chủ DN)
  ─────────────►  [ACTIVE]  ◄──────────────┐
                     │                     │
                     │ xoá (chỉ chủ DN)    │
                     ▼                     │
                 [DELETED]  ───────────────┘  (không có đường quay lại)
                deleted_at != NULL
```

Không phải state machine theo nghĩa Nguyên tắc II của Constitution — không có cột `status`, không có bảng chuyển trạng thái, chỉ là xoá mềm. `transition()` không áp dụng ở đây.

Bản ghi `DELETED` biến mất khỏi mọi truy vấn báo cáo và danh sách, nhưng vẫn nằm nguyên trong bảng và vẫn truy được qua `contest_audit_logs`.

---

## Sự kiện audit

Ghi vào `contest_audit_logs` sẵn có qua `writeContestAudit` (`contest.helpers.ts:91`). Bảng này đã có đủ `before_json`, `after_json`, `actor_id`, `actor_role`, `reason` — không cần đổi gì.

| `event_type` | Khi nào | `before_json` | `after_json` |
|---|---|---|---|
| `ledger.entry_created` | Tạo bút toán | `null` | Toàn bộ trường của bút toán |
| `ledger.entry_updated` | Sửa | Giá trị cũ của các trường đổi | Giá trị mới |
| `ledger.entry_deleted` | Xoá mềm | Toàn bộ trường trước khi xoá | `null` |

⚠️ `contest_audit_logs` **không có cột `ledger_entry_id`** — nó chỉ có `registration_id` và `match_id`. Đặt id bút toán vào `metadata.ledger_entry_id` thay vì thêm cột mới, để tránh sửa một bảng đang có 44 điểm gọi.

`event_type` là `varchar(80)` nên ba chuỗi trên thoải mái vừa.
