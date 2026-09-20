import { AppDataSource } from '../../config/database';
import {
  EXPORT_ROW_LIMIT,
  exportProviderReconciliationCsv,
  listProviderReconciliation,
} from '../../services/bank-reconciliation.service';
import { BankTransactionGateway, BankTransactionMatchStatus } from '../../types';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';
import { createTestCafe, createTestUser } from '../helpers';
import { UserRole } from '../../types';

/**
 * Sổ đối soát sao kê.
 *
 * Màn hình này tồn tại để trả lời đúng một câu: "ngân hàng báo có ngần này,
 * hệ thống ghi nhận ngần kia, phần lệch nằm ở đâu". Nên mọi ca dưới đây đều
 * kiểm một cách con số có thể sai mà nhìn vào bảng KHÔNG biết là nó sai:
 *
 *  - tổng tính trên toàn bảng thay vì trên kỳ đang lọc,
 *  - tiền của chủ sân khác lọt vào,
 *  - `numeric` của Postgres về dạng chuỗi rồi cộng thành nối chuỗi,
 *  - giao dịch chưa khớp biến mất vì `JOIN` thay vì `LEFT JOIN` — mà đó lại
 *    đúng là những dòng cần nhìn nhất.
 *
 * Con số sai kiểu này không làm hỏng gì lúc chạy. Nó chỉ khiến người đối soát
 * tin vào một tổng sai, và phát hiện ra khi đã chốt sổ với ngân hàng.
 */

const NGAY = (iso: string) => new Date(iso).toISOString();

let seq = 0;

/** Chèn thẳng một hàng sao kê — không đi qua webhook, để cố định được mốc giờ. */
async function themGiaoDich(opts: {
  cafeId: string;
  amount: number;
  transactionDate: string;
  status?: BankTransactionMatchStatus;
  paymentTransactionId?: string | null;
  content?: string;
  refCode?: string | null;
  externalId?: string;
  accountNumber?: string;
}): Promise<string> {
  seq += 1;
  const externalId = opts.externalId ?? `NH-${seq}`;
  await AppDataSource.query(
    `INSERT INTO bank_transactions
       (gateway, external_id, cafe_id, payment_transaction_id, account_number,
        amount, content, ref_code, transaction_date, match_status, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      BankTransactionGateway.SANDBOX,
      externalId,
      opts.cafeId,
      opts.paymentTransactionId ?? null,
      opts.accountNumber ?? '0123453210',
      opts.amount,
      opts.content ?? 'chuyen tien',
      opts.refCode ?? null,
      opts.transactionDate,
      opts.status ?? BankTransactionMatchStatus.NEEDS_REVIEW,
      JSON.stringify({}),
    ],
  );
  return externalId;
}

/**
 * Chèn một giao dịch qua cổng thanh toán, gắn vào booking sẵn có của fixture.
 *
 * `updated_at` phải ép bằng UPDATE riêng: TypeORM/Postgres tự đặt nó bằng NOW()
 * lúc chèn, mà đây lại là cột mốc thời gian của nguồn VNPAY — không ép được thì
 * mọi ca lọc theo kỳ đều vô nghĩa vì dòng nào cũng rơi vào hôm nay.
 */
async function themGiaoDichCong(opts: {
  bookingId?: string | null;
  customerPackageId?: string | null;
  amount: number;
  paidAt: string;
  gateway?: string;
  status?: string;
  gatewayTransactionId?: string | null;
}): Promise<string> {
  seq += 1;
  const [tx] = await AppDataSource.query(
    `INSERT INTO payment_transactions
       (booking_id, customer_package_id, subject_type, type, gateway, txn_ref,
        amount, status, gateway_transaction_id, raw_request)
     VALUES ($1, $2, 'BOOKING', 'PAYMENT', $3, $4, $5, $6, $7, '{}'::jsonb)
     RETURNING id`,
    [
      opts.bookingId ?? null,
      opts.customerPackageId ?? null,
      opts.gateway ?? 'VNPAY',
      `vnp_test_${seq}_${opts.amount}`,
      opts.amount,
      opts.status ?? 'SUCCESS',
      opts.gatewayTransactionId ?? null,
    ],
  );
  await AppDataSource.query(`UPDATE payment_transactions SET updated_at = $2 WHERE id = $1`, [
    tx.id,
    opts.paidAt,
  ]);
  return tx.id;
}

const THANG_7 = { from: NGAY('2026-07-01T00:00:00Z'), to: NGAY('2026-07-31T23:59:59Z') };

describe('đối soát sao kê: phạm vi dữ liệu', () => {
  it('không thấy giao dịch của chủ sân khác', async () => {
    // Rò tiền của quán khác vào sổ của mình là hỏng nặng nhất trong cả màn
    // hình: người dùng không có cách nào nhận ra, vì con số vẫn "hợp lý".
    const cua_toi = await seedBankPaymentScenario();
    const nguoi_khac = await createTestUser({ role: UserRole.PROVIDER });
    const quan_khac = await createTestCafe({ provider_id: nguoi_khac.id });

    await themGiaoDich({ cafeId: cua_toi.cafeId, amount: 100_000, transactionDate: THANG_7.from });
    await themGiaoDich({ cafeId: quan_khac.id, amount: 999_000, transactionDate: THANG_7.from });

    const kq = await listProviderReconciliation(cua_toi.providerId, { page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.summary.total_amount).toBe(100_000);
    expect(kq.items.map((i) => i.amount)).toEqual([100_000]);
  });

  it('gộp mọi chi nhánh của cùng một chủ sân', async () => {
    // Lý do màn hình này tồn tại: một chủ sân nhiều chi nhánh không phải mở
    // lần lượt từng trang rồi tự cộng tay.
    const fx = await seedBankPaymentScenario();
    const chi_nhanh_2 = await createTestCafe({ provider_id: fx.providerId });

    await themGiaoDich({ cafeId: fx.cafeId, amount: 100_000, transactionDate: THANG_7.from });
    await themGiaoDich({ cafeId: chi_nhanh_2.id, amount: 250_000, transactionDate: THANG_7.from });

    const kq = await listProviderReconciliation(fx.providerId, { page: 1, limit: 50 });

    expect(kq.total).toBe(2);
    expect(kq.summary.total_amount).toBe(350_000);
    // Mỗi dòng phải chỉ ra được nó thuộc chi nhánh nào — gộp mà không ghi tên
    // thì thấy tổng nhưng không truy được tiền vào chi nhánh nào.
    expect(new Set(kq.items.map((i) => i.cafe_id))).toEqual(new Set([fx.cafeId, chi_nhanh_2.id]));
    expect(kq.items.every((i) => !!i.cafe_name)).toBe(true);
  });

  it('lọc được về một chi nhánh', async () => {
    const fx = await seedBankPaymentScenario();
    const chi_nhanh_2 = await createTestCafe({ provider_id: fx.providerId });

    await themGiaoDich({ cafeId: fx.cafeId, amount: 100_000, transactionDate: THANG_7.from });
    await themGiaoDich({ cafeId: chi_nhanh_2.id, amount: 250_000, transactionDate: THANG_7.from });

    const kq = await listProviderReconciliation(fx.providerId, {
      cafeId: chi_nhanh_2.id,
      page: 1,
      limit: 50,
    });

    expect(kq.total).toBe(1);
    expect(kq.summary.total_amount).toBe(250_000);
  });
});

describe('đối soát sao kê: tổng phải tính theo KỲ', () => {
  it('tổng tiền chỉ cộng các giao dịch trong khoảng ngày đang lọc', async () => {
    // Đây chính là lỗi của sổ per-cafe cũ: `matched_total` tính trên cả bảng,
    // nên dù lọc kiểu gì nó cũng ra một con số không ứng với sao kê tháng nào.
    const fx = await seedBankPaymentScenario();

    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: NGAY('2026-06-15T10:00:00Z'),
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 200_000,
      transactionDate: NGAY('2026-07-10T10:00:00Z'),
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 400_000,
      transactionDate: NGAY('2026-08-02T10:00:00Z'),
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.summary.total_count).toBe(1);
    expect(kq.summary.total_amount).toBe(200_000);
  });

  it('tổng tính trên cả kỳ chứ không phải trên trang đang xem', async () => {
    // Người đối soát so tổng với sao kê, mà sao kê thì không phân trang. Nếu
    // tổng chạy theo trang thì mỗi lần bấm sang trang sau con số lại đổi.
    const fx = await seedBankPaymentScenario();
    for (let i = 0; i < 5; i += 1) {
      await themGiaoDich({
        cafeId: fx.cafeId,
        amount: 100_000,
        transactionDate: NGAY(`2026-07-0${i + 1}T10:00:00Z`),
      });
    }

    const trang1 = await listProviderReconciliation(fx.providerId, {
      ...THANG_7,
      page: 1,
      limit: 2,
    });

    expect(trang1.items).toHaveLength(2);
    expect(trang1.total).toBe(5);
    expect(trang1.summary.total_amount).toBe(500_000);
  });

  it('cộng tiền ra SỐ, không nối chuỗi', async () => {
    // `numeric` của Postgres về driver dưới dạng chuỗi. Quên ép kiểu thì hai
    // giao dịch 100000 cộng ra "100000100000" — sai gấp một triệu lần mà vẫn
    // hiện ra một con số trông như tiền.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({ cafeId: fx.cafeId, amount: 100_000, transactionDate: THANG_7.from });
    await themGiaoDich({ cafeId: fx.cafeId, amount: 100_000, transactionDate: THANG_7.from });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.summary.total_amount).toBe(200_000);
    expect(typeof kq.summary.total_amount).toBe('number');
    expect(typeof kq.items[0].amount).toBe('number');
  });
});

describe('đối soát sao kê: phần lệch', () => {
  it('tách rõ đã khớp / cần kiểm tra / bỏ qua và tính phần chưa đối soát', async () => {
    const fx = await seedBankPaymentScenario();

    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 300_000,
      transactionDate: THANG_7.from,
      status: BankTransactionMatchStatus.MATCHED,
      paymentTransactionId: fx.paymentTransactionId,
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 70_000,
      transactionDate: THANG_7.from,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 30_000,
      transactionDate: THANG_7.from,
      status: BankTransactionMatchStatus.IGNORED,
    });

    const s = (await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 }))
      .summary;

    expect(s.total_amount).toBe(400_000);
    expect(s.matched_amount).toBe(300_000);
    expect(s.needs_review_amount).toBe(70_000);
    expect(s.ignored_amount).toBe(30_000);
    // Con số cần đưa về 0 khi chốt sổ: tiền ngân hàng đã ghi có mà hệ thống
    // chưa gắn được vào đơn nào. Tiền bỏ qua VẪN tính vào đây — đánh dấu bỏ
    // qua là quyết định của người dùng, không phải là đã đối soát xong.
    expect(s.unreconciled_amount).toBe(100_000);
  });

  it('giao dịch chưa khớp vẫn hiện ra — đó là dòng cần nhìn nhất', async () => {
    // `JOIN` thay vì `LEFT JOIN` sang payment_transactions sẽ nuốt sạch những
    // dòng này, và bảng trông sạch sẽ đúng vào lúc đang có tiền treo.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 55_000,
      transactionDate: THANG_7.from,
      status: BankTransactionMatchStatus.NEEDS_REVIEW,
      paymentTransactionId: null,
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.items[0].txn_ref).toBeNull();
    expect(kq.items[0].expected_amount).toBeNull();
    expect(kq.items[0].subject).toBeNull();
  });

  it('hàng đã khớp mang theo số tiền hệ thống chờ thu, để thấy thu thiếu', async () => {
    const fx = await seedBankPaymentScenario({ amount: 350_000 });
    await themGiaoDich({
      cafeId: fx.cafeId,
      // Khách chuyển thiếu 50k. Không có `expected_amount` cạnh bên thì nhìn
      // vào bảng chỉ thấy một con số, không biết là thiếu.
      amount: 300_000,
      transactionDate: THANG_7.from,
      status: BankTransactionMatchStatus.MATCHED,
      paymentTransactionId: fx.paymentTransactionId,
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.items[0].expected_amount).toBe(350_000);
    expect(kq.items[0].amount).toBe(300_000);
    expect(kq.items[0].subject).toBe('BOOKING');
    expect(kq.items[0].subject_id).toBe(fx.bookingId);
    expect(kq.items[0].txn_ref).toBe(fx.txnRef);
  });
});

describe('đối soát sao kê: mã ngân hàng trả về', () => {
  it('trả ra mã ngân hàng, cổng và số tài khoản', async () => {
    // Ba trường sổ per-cafe không trả ra. Thiếu `external_id` thì không dò
    // ngược được một dòng trên sao kê về bản ghi nào trong hệ thống — hai bên
    // chỉ còn so được bằng số tiền, mà số tiền thì trùng nhau đầy.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: THANG_7.from,
      externalId: 'FT26071234567',
      accountNumber: '9988776655',
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.items[0].external_id).toBe('FT26071234567');
    expect(kq.items[0].account_number).toBe('9988776655');
    expect(kq.items[0].gateway).toBe(BankTransactionGateway.SANDBOX);
  });

  it('tìm được theo mã ngân hàng, mã tham chiếu, và nội dung', async () => {
    // Người đối soát cầm trong tay một trong ba thứ, tuỳ họ đang tra từ phía
    // nào: dòng sao kê, ảnh QR khách gửi, hay chỉ nhớ mang máng nội dung.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: THANG_7.from,
      externalId: 'FT26071234567',
      refCode: 'RCFABC12',
      content: 'thanh toan san co nho',
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 200_000,
      transactionDate: THANG_7.from,
      externalId: 'FT26079999999',
      content: 'khong lien quan',
    });

    const theoMaNH = await listProviderReconciliation(fx.providerId, {
      q: '1234567',
      page: 1,
      limit: 50,
    });
    const theoMaTC = await listProviderReconciliation(fx.providerId, {
      q: 'RCFABC12',
      page: 1,
      limit: 50,
    });
    const theoNoiDung = await listProviderReconciliation(fx.providerId, {
      q: 'san co nho',
      page: 1,
      limit: 50,
    });

    expect(theoMaNH.total).toBe(1);
    expect(theoMaTC.total).toBe(1);
    expect(theoNoiDung.total).toBe(1);
    expect(theoMaNH.items[0].external_id).toBe('FT26071234567');
    // Bộ đếm tổng cũng phải theo bộ lọc tìm kiếm, không chỉ bảng.
    expect(theoMaNH.summary.total_amount).toBe(100_000);
  });
});

describe('đối soát: nguồn VNPay', () => {
  it('tiền qua cổng cũng vào sổ, kèm mã cổng trả về', async () => {
    // `txn_ref` là mã mình tự sinh, phía cổng không dùng nó làm khoá. Không có
    // `vnp_TransactionNo` thì khi hai bên lệch số không có gì để đối chiếu.
    const fx = await seedBankPaymentScenario();
    await themGiaoDichCong({
      bookingId: fx.bookingId,
      amount: 500_000,
      paidAt: NGAY('2026-07-15T10:00:00Z'),
      gatewayTransactionId: '14892375',
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.items[0].channel).toBe('VNPAY');
    expect(kq.items[0].external_id).toBe('14892375');
    expect(kq.items[0].amount).toBe(500_000);
    expect(kq.items[0].match_status).toBe('MATCHED');
  });

  it('chỉ lấy giao dịch ĐÃ THÀNH CÔNG', async () => {
    // Giao dịch treo hoặc hỏng là tiền CHƯA từng chuyển. Đưa vào sổ là tự tính
    // cho mình một khoản doanh thu không tồn tại, và tổng sẽ vượt báo cáo của
    // cổng đúng bằng số tiền của những lần khách bỏ dở.
    const fx = await seedBankPaymentScenario();
    for (const status of ['PENDING', 'FAILED', 'SUCCESS']) {
      await themGiaoDichCong({
        bookingId: fx.bookingId,
        amount: 100_000,
        paidAt: NGAY('2026-07-15T10:00:00Z'),
        status,
      });
    }

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.summary.vnpay_amount).toBe(100_000);
  });

  it('không lấy tiền mặt tại quầy và giao dịch giả lập', async () => {
    // DIRECT là khách đưa tiền mặt cho nhân viên — không có bên thứ ba nào để
    // đối soát cùng. MOCK là dữ liệu thử. Cả hai lọt vào là tổng phình lên mà
    // không đối chiếu được với báo cáo nào.
    const fx = await seedBankPaymentScenario();
    for (const gateway of ['DIRECT', 'MOCK']) {
      await themGiaoDichCong({
        bookingId: fx.bookingId,
        amount: 700_000,
        paidAt: NGAY('2026-07-15T10:00:00Z'),
        gateway,
      });
    }

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(0);
    expect(kq.summary.total_amount).toBe(0);
  });

  it('cộng RIÊNG hai nguồn — gộp một số thì không khớp bên nào cả', async () => {
    // Tiền chuyển khoản vào thẳng tài khoản ngân hàng của chi nhánh; tiền VNPay
    // nằm ở tài khoản người bán của cổng rồi mới quyết toán về sau. Cộng chung
    // thì con số ấy vừa không khớp sao kê ngân hàng, vừa không khớp báo cáo
    // VNPay — không đối chiếu được với ai.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 300_000,
      transactionDate: NGAY('2026-07-10T10:00:00Z'),
    });
    await themGiaoDichCong({
      bookingId: fx.bookingId,
      amount: 500_000,
      paidAt: NGAY('2026-07-15T10:00:00Z'),
    });

    const s = (await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 }))
      .summary;

    expect(s.bank_amount).toBe(300_000);
    expect(s.vnpay_amount).toBe(500_000);
    expect(s.total_amount).toBe(800_000);
    expect(s.bank_count).toBe(1);
    expect(s.vnpay_count).toBe(1);
  });

  it('lọc được về đúng một nguồn', async () => {
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 300_000,
      transactionDate: NGAY('2026-07-10T10:00:00Z'),
    });
    await themGiaoDichCong({
      bookingId: fx.bookingId,
      amount: 500_000,
      paidAt: NGAY('2026-07-15T10:00:00Z'),
    });

    const chiVnpay = await listProviderReconciliation(fx.providerId, {
      ...THANG_7,
      channel: 'VNPAY',
      page: 1,
      limit: 50,
    });
    const chiBank = await listProviderReconciliation(fx.providerId, {
      ...THANG_7,
      channel: 'BANK',
      page: 1,
      limit: 50,
    });

    expect(chiVnpay.total).toBe(1);
    expect(chiVnpay.summary.total_amount).toBe(500_000);
    expect(chiBank.total).toBe(1);
    expect(chiBank.summary.total_amount).toBe(300_000);
  });

  it('không thấy tiền VNPay của chủ sân khác', async () => {
    // Nhánh VNPay đi về chi nhánh qua booking/gói/giải, KHÁC hẳn đường của
    // nhánh ngân hàng — nên phải kiểm riêng, không suy ra từ ca kia được.
    const fx = await seedBankPaymentScenario();
    // Mã tham chiếu phải khác: nó là duy nhất toàn hệ thống, dựng hai kịch bản
    // cùng mã thì hỏng ngay ở bước chèn.
    const nguoi_khac = await seedBankPaymentScenario({ refCode: 'RCF9Z4X1' });
    await themGiaoDichCong({
      bookingId: nguoi_khac.bookingId,
      amount: 999_000,
      paidAt: NGAY('2026-07-15T10:00:00Z'),
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(0);
  });

  it('kỳ lọc áp cho cả nguồn VNPay', async () => {
    const fx = await seedBankPaymentScenario();
    await themGiaoDichCong({
      bookingId: fx.bookingId,
      amount: 100_000,
      paidAt: NGAY('2026-06-15T10:00:00Z'),
    });
    await themGiaoDichCong({
      bookingId: fx.bookingId,
      amount: 200_000,
      paidAt: NGAY('2026-07-15T10:00:00Z'),
    });

    const kq = await listProviderReconciliation(fx.providerId, { ...THANG_7, page: 1, limit: 50 });

    expect(kq.total).toBe(1);
    expect(kq.summary.vnpay_amount).toBe(200_000);
  });
});

describe('đối soát sao kê: xuất tệp', () => {
  it('mở được bằng Excel tiếng Việt và không lệch cột khi nội dung có dấu phẩy', async () => {
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: THANG_7.from,
      content: 'chuyen tien, dot 1, con lai sau',
    });

    const csv = await exportProviderReconciliationCsv(fx.providerId, THANG_7);
    const dong = csv.split('\r\n');

    // BOM: thiếu nó thì Excel trên Windows đọc theo bảng mã hệ thống và mọi
    // tên chi nhánh có dấu hiện thành ký tự rác.
    expect(csv.startsWith('﻿')).toBe(true);
    expect(dong).toHaveLength(2);
    expect(dong[1]).toContain('"chuyen tien, dot 1, con lai sau"');
    // Bọc đúng thì dòng dữ liệu tách ra đúng bằng số cột tiêu đề. Bọc sai thì
    // ba dấu phẩy trong nội dung đẩy mọi cột sau nó lệch đi ba ô — và tệp vẫn
    // mở được bình thường, chỉ là số tiền nằm dưới nhãn của cột khác.
    expect(demCot(dong[1])).toBe(dong[0].split(',').length);
  });

  it('ghi ngày trước giờ, giờ Việt Nam — để sort được trong Excel', async () => {
    // `toLocaleString('vi-VN')` mặc định ra "21:53:58 11/8/2026": giờ đứng
    // trước, nên sort cột ngày trong Excel là xếp theo giờ trong ngày và các
    // tháng trộn lẫn vào nhau. Và múi giờ phải là VN — lệch 7 tiếng thì giao
    // dịch lúc 21:53 ngày 11 nhảy sang ngày 11 lúc 14:53, đối chiếu với sao kê
    // giấy là lệch hẳn.
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: NGAY('2026-07-11T14:53:58Z'),
    });

    const csv = await exportProviderReconciliationCsv(fx.providerId, THANG_7);

    expect(csv).toContain('"11/07/2026 21:53:58"');
  });

  it('xuất theo đúng kỳ đang lọc, không xuất cả bảng', async () => {
    const fx = await seedBankPaymentScenario();
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 100_000,
      transactionDate: NGAY('2026-06-15T10:00:00Z'),
    });
    await themGiaoDich({
      cafeId: fx.cafeId,
      amount: 200_000,
      transactionDate: NGAY('2026-07-10T10:00:00Z'),
    });

    const csv = await exportProviderReconciliationCsv(fx.providerId, THANG_7);

    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('200000');
    expect(csv).not.toContain('100000');
  });

  it('không xuất tiền của chủ sân khác', async () => {
    const fx = await seedBankPaymentScenario();
    const nguoi_khac = await createTestUser({ role: UserRole.PROVIDER });
    const quan_khac = await createTestCafe({ provider_id: nguoi_khac.id });
    await themGiaoDich({
      cafeId: quan_khac.id,
      amount: 999_000,
      transactionDate: THANG_7.from,
      externalId: 'NH-CUA-NGUOI-KHAC',
    });

    const csv = await exportProviderReconciliationCsv(fx.providerId, THANG_7);

    expect(csv).not.toContain('NH-CUA-NGUOI-KHAC');
    expect(csv.split('\r\n')).toHaveLength(1);
  });

  it('trần số dòng là một con số dương — xuất thiếu trang thì tổng sai mà không ai biết', () => {
    expect(EXPORT_ROW_LIMIT).toBeGreaterThan(0);
  });
});

/** Đếm số cột thật của một dòng CSV: dấu phẩy trong cặp nháy không ngăn cột. */
function demCot(line: string): number {
  let inQuote = false;
  let cot = 1;
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) cot += 1;
  }
  return cot;
}
