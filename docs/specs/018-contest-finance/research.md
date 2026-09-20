# Research: Quản lý thu chi giải đấu

**Feature**: `018-contest-finance` | **Date**: 2026-08-08 | **Phase**: 0

Tài liệu này chốt các quyết định kỹ thuật trước khi thiết kế schema và hợp đồng API. Mỗi mục ghi lựa chọn, lý do, và phương án đã cân nhắc rồi loại.

---

## D1 — Một bảng sổ cái có cột `direction`, không tách hai bảng thu/chi

**Quyết định**: Một bảng `contest_ledger_entries` với cột `direction` nhận `IN` hoặc `OUT`.

**Lý do**: Hai chiều dùng chung y hệt bộ cột (số tiền, ngày phát sinh, tiêu đề, ghi chú, chứng từ, người tạo). Tách đôi sẽ nhân đôi entity, service, controller, zod schema và endpoint mà không thêm bất kỳ ràng buộc nào. Khác biệt duy nhất giữa hai chiều là tập giá trị hợp lệ của `category` và quyền của nhân viên — cả hai đều xử lý gọn bằng một guard trên `direction` (FR-019).

**Đã loại**:
- *Hai bảng `contest_incomes` / `contest_expenses`*: gấp đôi bề mặt code, và mọi truy vấn báo cáo đều phải `UNION ALL` lại.
- *Dùng số âm cho khoản chi trên một cột `amount`*: mất khả năng ràng buộc `amount > 0` (FR-004), và dễ sinh lỗi dấu khi cộng dồn.

---

## D2 — `category` là `varchar` kiểm ở tầng zod, không dùng native enum của Postgres

**Quyết định**: Cột `category varchar(30) NOT NULL`. Tập giá trị hợp lệ khai bằng TypeScript enum trong `src/types/index.ts` và ép ở zod theo `direction`. Không tạo `CREATE TYPE ... AS ENUM`.

**Lý do**: Feature 017 vừa phải bỏ ra nguyên một feature để gỡ `fnb_category_enum` khỏi Postgres, vì thêm/bớt giá trị đòi `ALTER TYPE` — thao tác không chạy được trong transaction cùng các DDL khác và không revert được sạch. Sổ thu chi có xác suất phải thêm loại khoản về sau cao hơn hẳn danh mục menu (mỗi kỳ kế toán một kiểu), nên đừng tự khoá lần nữa.

Ràng buộc "tập đóng" của FR-003a vẫn được giữ, chỉ là giữ ở tầng ứng dụng thay vì tầng kiểu dữ liệu.

**Đã loại**:
- *Native enum Postgres*: xem trên.
- *Bảng danh mục riêng*: FR-003a đã chốt tập đóng, chủ doanh nghiệp không tự thêm. Dựng bảng + CRUD + màn quản lý cho một danh sách 12 giá trị bất biến là thừa.
- *`CHECK` constraint liệt kê giá trị*: vẫn phải `ALTER TABLE` khi đổi, không hơn gì enum, mà lại tách nguồn sự thật khỏi TypeScript.

---

## D3 — Sổ cái KHÔNG phải `payment_components`

**Quyết định**: `contest_ledger_entries` là bảng độc lập, không đụng tới `payment_components` và không sinh `payment_transactions`.

**Lý do**: `payment_components` mô tả tiền chạy qua đường thanh toán của nền tảng — có `HELD → DISBURSED`, có phí nền tảng 15%, có đối soát VNPay. Sổ thu chi của giải mô tả tiền chảy **ngoài** nền tảng: chủ doanh nghiệp tự trả tiền thưởng bằng tiền mặt, tự nhận tài trợ qua chuyển khoản riêng. Nhét vào `payment_components` sẽ khiến những khoản này lọt vào mọi phép tính phí nền tảng và mọi báo cáo đối soát — sai về bản chất và nguy hiểm về tiền.

**Hệ quả với Nguyên tắc IV của Constitution**: Nguyên tắc IV ràng buộc `PaymentComponent` bất biến sau khi tạo. Sổ cái này KHÔNG phải `PaymentComponent` nên không rơi vào phạm vi điều đó. Xem D4 về cách vẫn giữ được tinh thần truy vết.

---

## D4 — Cho phép sửa/xoá bút toán, bù lại bằng audit trước–sau và xoá mềm

**Quyết định**: `PATCH` và `DELETE` bút toán được phép với chủ doanh nghiệp (FR-018). Xoá là xoá mềm qua `deleted_at`. Mỗi lần sửa ghi `contest_audit_logs` với đủ `before_json` và `after_json`.

**Lý do**: Đây là sổ tay ghi chép của chủ doanh nghiệp, không phải sổ cái kế toán pháp lý. Gõ nhầm 1.500.000 thành 15.000.000 là chuyện thường; bắt họ tạo bút toán đối ứng để chữa sẽ làm sổ đầy rác và báo cáo khó đọc.

Tinh thần "tái dựng được lịch sử" của Nguyên tắc IV vẫn giữ nguyên: hàng không bao giờ mất khỏi bảng (xoá mềm), và mọi thay đổi để lại cặp giá trị trước–sau trong `contest_audit_logs` — bảng đã có sẵn cả hai cột `before_json`, `after_json`.

**Đã loại**:
- *Append-only tuyệt đối*: đúng chuẩn kế toán nhưng sai với mức độ trang trọng của bài toán; chủ doanh nghiệp sẽ bỏ dùng.
- *Xoá cứng*: mất dấu vết, đi ngược quy ước `deleted_at` bắt buộc của Constitution.

---

## D5 — Guard mới `assertContestFinanceOwner`, KHÔNG tái dùng guard sẵn có

**Quyết định**: Viết hàm mới trong `src/services/contest/guards.ts`, chỉ chấp nhận `PROVIDER` sở hữu giải.

**Lý do**: Hai guard sẵn có đều sai cho tính năng này:

| Guard | Chấp nhận | Vì sao không dùng được |
|---|---|---|
| `assertContestOperator` (`contest.helpers.ts:59`) | PROVIDER owner **hoặc** STAFF được phân công | Cho nhân viên xem báo cáo — vi phạm FR-021 |
| `getContestForProvider` (`contest-fee.service.ts:65`) | PROVIDER owner **hoặc** ADMIN | Cho quản trị viên nền tảng xem — vi phạm FR-017a |

`assertContestOwner` (`contest.helpers.ts:22`) thì đúng ngữ nghĩa (chỉ PROVIDER owner) và **dùng lại được nguyên si**. Guard mới chỉ cần bọc thêm ngữ nghĩa tên gọi cho rõ ý đồ tại điểm gọi. Đây là điểm dễ sai nhất của cả feature: người triển khai theo quán tính sẽ với tay lấy `assertContestOperator` vì các hàm contest khác đều dùng nó.

---

## D6 — `requireActiveProvider` chỉ áp cho endpoint ghi, không áp cho endpoint đọc

**Quyết định**: Các route `POST`/`PATCH`/`DELETE` sổ cái mang `requireActiveProvider`. Route `GET` báo cáo và `GET` danh sách bút toán thì không.

**Lý do**: Chủ doanh nghiệp bị tạm khoá vẫn phải xem lại được sổ sách của mình — chặn đọc là giữ con tin dữ liệu tài chính của họ, không phục vụ mục đích vận hành nào. Ngược lại, tài khoản đang bị khoá thì không nên ghi thêm dữ liệu mới.

Bản rà soát luồng contest (`07-contest-flow-audit.md`, mục P1-6) đã chỉ ra `requireActiveProvider` hiện áp không nhất quán khắp module contest. Quyết định này ghi rõ nguyên tắc để không góp thêm vào sự lộn xộn đó.

---

## D7 — Lệ phí đọc từ `contest_registrations.entry_fee_amount`, tuyệt đối không từ `contests.entry_fee`

**Quyết định**: Mọi phép cộng lệ phí trong báo cáo đọc `contest_registrations.entry_fee_amount`.

**Lý do**: Đây là Nguyên tắc I của Constitution áp vào contest. `entry_fee_amount` được chốt vào lúc đăng ký (`registrations.ts:190` — `registration.entryFeeAmount = Number(contest.entryFee ?? 0)`), đúng nghĩa một snapshot. Chủ doanh nghiệp hoàn toàn có thể sửa `contests.entry_fee` giữa chừng; lúc đó `contests.entry_fee × số người` sẽ ra một con số chưa từng tồn tại trong thực tế.

Cách sai — nhân mức phí hiện tại với số đăng ký — lại là cách trực giác nhất và nhanh nhất, nên phải chặn bằng test (xem quickstart).

---

## D8 — Ánh xạ trạng thái thanh toán vào nhóm báo cáo

**Quyết định**:

| `payment_status` của đăng ký | Nhóm trong báo cáo | Cộng vào tổng thu? |
|---|---|---|
| `MARKED_PAID` | Đã thu | Có |
| `PENDING_PAYMENT` | Chờ thu | Không |
| `PENDING_REVIEW` | Chờ thu | Không |
| `WAIVED` | Đã miễn (tham khảo) | Không |
| `NOT_REQUIRED` | Không xuất hiện | Không |
| Bất kỳ trạng thái nào, khi `registration.status = CANCELLED` và chưa từng `MARKED_PAID` | Bị loại khỏi mọi nhóm | Không |

**Lý do**: `PENDING_REVIEW` là "đã khai chuyển khoản, chờ đối soát" — tiền chưa chắc chắn, xếp vào đã thu là tự lừa mình (FR-010). `NOT_REQUIRED` nghĩa là giải miễn phí, đưa vào báo cáo chỉ tạo dòng 0đ vô nghĩa. Đăng ký huỷ chưa trả tiền bị loại hẳn theo FR-009a.

Trường hợp `CANCELLED` nhưng **đã** `MARKED_PAID` vẫn nằm ở nhóm đã thu — tiền đã vào thật, theo Assumptions của spec.

---

## D9 — `entry_fee_payment_method` nullable, không backfill

**Quyết định**: Thêm cột `entry_fee_payment_method varchar(20) NULL` vào `contest_registrations`. Giá trị: `ONLINE | CASH | TRANSFER`. Các bản ghi cũ giữ `NULL`.

**Lý do**: Không có cách nào suy ngược phương thức của các khoản đã thu trước đây — đúng như FR-029 nói, gán bừa còn tệ hơn để trống. Báo cáo hiển thị nhóm `NULL` thành dòng "chưa rõ phương thức".

Giá trị `ONLINE` được gán tự động khi thanh toán qua VNPay hoàn tất; `CASH`/`TRANSFER` do người đánh dấu chọn (FR-028).

**Đã loại**: *Cột `NOT NULL DEFAULT 'CASH'`* — biến dữ liệu không biết thành dữ liệu sai, và không cách nào phân biệt lại về sau.

---

## D10 — Báo cáo tính tại chỗ, không bảng tổng hợp

**Quyết định**: Endpoint báo cáo chạy vài câu `SUM ... GROUP BY` ngay lúc gọi. Không materialized view, không bảng cache, không cột tổng trên `contests`.

**Lý do**: Một giải có cỡ vài chục đăng ký và vài chục bút toán. Phép cộng trên vài trăm dòng có index theo `contest_id` là chuyện vặt với Postgres. Thêm tầng cache sẽ đẻ ra bài toán vô hiệu hoá cache mỗi lần sửa/xoá bút toán — chính là thứ FR-015 cấm ("phản ánh thay đổi ngay, không cần thao tác đồng bộ").

Quyết định này cũng là hệ quả trực tiếp của việc spec chốt không làm báo cáo đa giải (Clarification #4): không có truy vấn nào phải quét nhiều giải cùng lúc.

---

## D11 — Phí tổ chức giải là dòng chi tính động, không phải bút toán

**Quyết định**: Báo cáo `LEFT JOIN` sang `contest_fee_orders` lấy đơn `status = 'PAID'` và dựng một dòng chi ảo. Không chèn hàng vào `contest_ledger_entries`.

**Lý do**: FR-013 cấm sửa/xoá dòng này. Nếu nó là một hàng thật trong sổ cái thì phải viết thêm guard chặn `PATCH`/`DELETE` cho riêng nó, và phải đồng bộ mỗi khi quản trị viên xác nhận hoặc từ chối đơn phí. Tính động thì luôn đúng theo nguồn, không bao giờ lệch.

---

## D12 — Ảnh chứng từ upload qua endpoint riêng, trả URL

**Quyết định**: `POST /contests/:contestId/ledger-entries/receipt` nhận multipart, gọi `uploadImage` của `cloudinary.service`, trả `{ url }`. Client gắn URL đó vào `receipt_url` khi tạo hoặc sửa bút toán.

**Lý do**: Đúng khuôn mẫu `uploadContestBanner` (`contests-crud.ts:489`) đã dùng trong chính module này — multer memory storage, kiểm mimetype ở controller, `uploadImage` với `folder`/`publicIdPrefix`. Tách upload khỏi thao tác tạo giúp người dùng chọn ảnh trước rồi vẫn sửa được các trường khác mà không phải upload lại.

**Đã loại**: *Multipart ngay trên endpoint tạo bút toán* — buộc mọi lần sửa nhỏ cũng phải gửi lại file, và trộn hai loại lỗi (validate dữ liệu vs lỗi upload) vào một phản hồi.

---

## D13 — Đường dẫn route

**Quyết định**: Bổ sung vào `contest.routes.ts` sẵn có, theo đúng hai khuôn mẫu đang dùng ở đó:

- Thao tác trong phạm vi một giải → `/contests/:contestId/...`
- Thao tác trên một bản ghi con theo id → tài nguyên cấp cao nhất, ví dụ `/contest-ledger-entries/:entryId`, giống hệt `/contest-registrations/:registrationId/...` và `/contest-matches/:matchId/...`

**Không có bẫy thứ tự đăng ký route** ở đây: `/contests/:contestId/finance` và `/contests/:contestId/ledger-entries` đều sâu hơn `/contests/:contestId` một đoạn nên Express khớp chính xác, khác với tình huống `/categories` vs `/:itemId` của feature 017.

**Đã loại**: *Tách file `contest-finance.routes.ts`* — `contest.routes.ts` đã dài, nhưng tách ra sẽ phải mount thêm một router và làm khó việc đọc toàn cảnh quyền của module contest ở một chỗ. Controller thì tách riêng (`contest-finance.controller.ts`) để không phình `contest.controller.ts`.

---

## D14 — Test viết trước cho hàm tổng hợp báo cáo

**Quyết định**: `src/__tests__/services/contest-finance.test.ts` viết trước và phải fail trước khi hiện thực `buildContestFinanceReport`.

**Lý do**: Nguyên tắc V của Constitution bắt buộc test-first cho "payment rules". Hàm tổng hợp này quyết định con số tiền mà chủ doanh nghiệp dựa vào để ra quyết định kinh doanh, và nó có đúng 6 nhánh phân loại trạng thái (D8) cộng quy tắc loại đăng ký huỷ — đủ nhiều nhánh để sai âm thầm.

Các bất biến bắt buộc có test:
1. Lệ phí đọc từ snapshot chứ không từ `contests.entry_fee` (D7)
2. `PENDING_REVIEW` nằm ở chờ thu, không ở đã thu (D8)
3. `WAIVED` không cộng vào tổng thu (FR-011)
4. Đăng ký huỷ chưa trả tiền biến mất khỏi mọi nhóm (FR-009a)
5. Đăng ký huỷ đã trả tiền vẫn ở nhóm đã thu
6. Phí tổ chức chỉ tính đơn `PAID` (FR-012)
7. Ròng = tổng thu − tổng chi, có cả phí tổ chức trong tổng chi
8. Bút toán đã xoá mềm không lọt vào bất kỳ tổng nào

---

## Rủi ro kế thừa, không xử lý trong feature này

Hai mục dưới đây đã ghi trong spec, nhắc lại để người triển khai không tưởng nhầm là đã xong:

- **P0-2 (lệ phí thu hai lần) đã không còn — đừng lập kế hoạch quanh nó.** Bản rà soát ngày 02/08 mô tả code cũ. Trên code hiện tại:
  - `createContestRegistration` đặt thẳng `registration.bookingId = null` (`registrations.ts:183-184`); phiếu mượn xe 0đ chỉ sinh lúc check-in, sau khi lệ phí đã thu xong.
  - `snapshot.contest_entry_fee` **chưa bao giờ được ghi** — grep toàn repo chỉ ra 4 điểm, đều là đọc (`payment.service.ts:81,129,330,377`). Dòng biên lai `CONTEST_ENTRY_FEE` do đó luôn bằng 0 và bị `.filter(c => c.amount !== 0)` loại.
  - `createContestEntryPaymentUrl` là đường thu lệ phí duy nhất, đã chặn hai lớp: 409 `ENTRY_FEE_ALREADY_SETTLED` (`:958-964`) và 409 `ENTRY_FEE_TRANSACTION_PENDING` (`:966-981`).

  Còn sót lại là **code chết chưa dọn**, không phải rủi ro tiền: trường `snapshot.contest_entry_fee` đọc-mà-không-ai-ghi, và `markContestEntryFeePaidOnBookingSuccess` (`payment.service.ts:620`) tìm đăng ký theo `booking_id` — liên kết mà luồng đăng ký hiện tại không tạo ra. Hai thứ này vô hại với báo cáo nhưng dễ làm người đọc code kết luận sai, đúng như đã xảy ra khi soạn bản spec này.
- **Gỡ luồng khách tự huỷ đăng ký.** Chủ dự án dự định làm ở thay đổi khác. Khi làm, nhớ rằng trạng thái `CANCELLED` vẫn phát sinh qua `cleanUpContestOnCancel` (huỷ cả giải), nên quy tắc FR-009a KHÔNG được coi là nhánh chết; và `createContestRegistration:148` đang dựa vào `CANCELLED` để cho đăng ký lại.
