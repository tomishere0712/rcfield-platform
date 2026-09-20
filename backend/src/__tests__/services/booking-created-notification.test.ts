import { AppDataSource } from '../../config/database';
import { matchBankTransaction } from '../../services/bank-webhook.service';
import { BankTransactionGateway, NotificationType, UserRole } from '../../types';
import { buildSePayPayload } from '../helpers/bank-webhook.helper';
import { seedBankPaymentScenario } from '../helpers/bank-payment.fixture';
import { createTestUser } from '../helpers';

/**
 * Đơn mới phải để lại dấu vết, không chỉ nháy một cái rồi thôi.
 *
 * Trước đây `pushBookingNew` chỉ bắn WebSocket. Nhân viên đang mở app thì thấy
 * toast; còn đóng tab, rớt mạng vài giây, hay đúng lúc giao ca thì đơn đó
 * **biến mất khỏi mọi nơi** — không vào chuông, không lịch sử, không log. Không
 * ai biết là đã lỡ một đơn, vì chẳng có gì để mà biết.
 *
 * Đây là loại lỗi không bao giờ tự lộ ra: hệ thống vẫn chạy đúng, tiền vẫn thu
 * đủ, chỉ là người cần biết thì không biết. Nên phải canh bằng test.
 */

async function ganNhanVienVaoChiNhanh(cafeId: string, assignedBy: string) {
  const staff = await createTestUser({ role: UserRole.STAFF });
  await AppDataSource.query(
    `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by) VALUES ($1, $2, $3)`,
    [staff.id, cafeId, assignedBy],
  );
  return staff;
}

type ThongBao = { type: string; title: string; message: string; data: unknown };

function truyVan(userId: string) {
  return AppDataSource.query<ThongBao[]>(
    `SELECT type, title, message, data FROM notifications WHERE user_id = $1`,
    [userId],
  );
}

const nghi = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Đọc thông báo, có chờ.
 *
 * `payment.service.ts` cố ý KHÔNG await khối gửi email/thông báo — nó chạy nền
 * để phản hồi thanh toán không phải đợi Brevo. Đúng cho chạy thật, nhưng test
 * mà đọc bảng ngay sau khi webhook trả về thì đang chạy đua với chính khối đó:
 * lúc xanh lúc đỏ, tuỳ máy nhanh chậm.
 *
 * Nên chờ tới khi đủ số bản ghi mong đợi, rồi nghỉ thêm một nhịp để những bản
 * ghi THỪA (nếu có) kịp hiện ra — không có nhịp đó thì ca chống-gửi-trùng luôn
 * xanh một cách vô nghĩa, vì nó thoát ngay khi thấy cái đầu tiên.
 */
async function docThongBao(userId: string, mongDoi: number): Promise<ThongBao[]> {
  const hetHan = Date.now() + 3000;
  let rows = await truyVan(userId);
  while (rows.length < mongDoi && Date.now() < hetHan) {
    await nghi(50);
    rows = await truyVan(userId);
  }
  await nghi(150);
  return truyVan(userId);
}

/** Trả tiền qua webhook ngân hàng — đúng luồng thật, không gọi tắt hàm nội bộ. */
async function traTienChoBooking(fx: Awaited<ReturnType<typeof seedBankPaymentScenario>>) {
  await matchBankTransaction(
    buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    }),
    BankTransactionGateway.SANDBOX,
  );
}

describe('đơn mới: báo cho nhân viên chi nhánh', () => {
  it('ghi thông báo bền cho nhân viên, không chỉ đẩy WebSocket', async () => {
    const fx = await seedBankPaymentScenario();
    const staff = await ganNhanVienVaoChiNhanh(fx.cafeId, fx.providerId);

    await traTienChoBooking(fx);

    const rows = await docThongBao(staff.id, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(NotificationType.BOOKING_CREATED);
    // Bấm vào chuông phải đi thẳng tới đơn — nhân viên cần chuẩn bị sân và xe
    // cho đúng suất đó, không phải tự đi dò trong danh sách.
    expect((rows[0].data as { route?: string }).route).toBe(`/staff/bookings/${fx.bookingId}`);
  });

  it('báo cho MỌI nhân viên của chi nhánh', async () => {
    // Quán có nhiều ca. Chỉ báo cho một người thì đúng lúc người đó nghỉ là đơn
    // rơi vào khoảng trống.
    const fx = await seedBankPaymentScenario();
    const a = await ganNhanVienVaoChiNhanh(fx.cafeId, fx.providerId);
    const b = await ganNhanVienVaoChiNhanh(fx.cafeId, fx.providerId);

    await traTienChoBooking(fx);

    expect(await docThongBao(a.id, 1)).toHaveLength(1);
    expect(await docThongBao(b.id, 1)).toHaveLength(1);
  });

  it('chủ sân cũng nhận, và tin của họ có tên chi nhánh', async () => {
    // Chủ sân theo dõi nhiều chi nhánh cùng lúc; "Đơn #A3F2B891" mà không nói
    // ở đâu thì đọc xong vẫn phải mở app ra tra.
    const fx = await seedBankPaymentScenario();

    await traTienChoBooking(fx);

    const rows = await docThongBao(fx.providerId, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('tại ');
    expect((rows[0].data as { route?: string }).route).toBe('/provider/bookings');
  });

  it('không báo cho nhân viên chi nhánh khác', async () => {
    const fx = await seedBankPaymentScenario();
    const nguoiKhac = await seedBankPaymentScenario({ refCode: 'RCF5W8Q2' });
    const staffQuanKhac = await ganNhanVienVaoChiNhanh(nguoiKhac.cafeId, nguoiKhac.providerId);

    await traTienChoBooking(fx);

    expect(await docThongBao(staffQuanKhac.id, 0)).toHaveLength(0);
  });

  it('webhook ngân hàng gửi lại nhiều lần chỉ báo MỘT lần', async () => {
    // Dịch vụ đối soát gửi lại là hành vi bình thường. Không chặn thì nhân viên
    // nhận năm cái chuông cho một đơn, và lần sau họ tắt thông báo.
    //
    // ⚠️ Ca này canh đường WEBHOOK NGÂN HÀNG, và thứ chặn nó là khoá trùng trên
    // `bank_transactions.external_id` — KHÔNG phải chốt `tx.status === SUCCESS`
    // trong `processConfirmationResult`. Đã kiểm bằng đột biến: vô hiệu hoá chốt
    // đó thì ca này vẫn xanh.
    //
    // Nghĩa là đường VNPay — nơi cổng có thể gọi lại cả returnUrl lẫn IPN cho
    // cùng một giao dịch — CHƯA được ca nào ở đây canh.
    const fx = await seedBankPaymentScenario();
    const staff = await ganNhanVienVaoChiNhanh(fx.cafeId, fx.providerId);

    const payload = buildSePayPayload({
      content: fx.refCode,
      accountNumber: fx.accountNumber,
      transferAmount: fx.amount,
    });
    for (let i = 0; i < 5; i += 1) {
      await matchBankTransaction(payload, BankTransactionGateway.SANDBOX);
    }

    expect(await docThongBao(staff.id, 1)).toHaveLength(1);
  });
});
