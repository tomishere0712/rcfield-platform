import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Ngân hàng mô phỏng — đóng vai người dùng bấm nút trong app ngân hàng thật.
 *
 * ⚠️ RANH GIỚI BẮT BUỘC: file này KHÔNG được import `payment.service`,
 * `booking.service`, hay bất kỳ entity nào. Nó chỉ đọc dữ liệu hiển thị bằng
 * SQL thô và gọi webhook của hệ thống **qua HTTP**, đúng như một dịch vụ bên
 * thứ ba sẽ làm.
 *
 * Ràng buộc đó không phải sạch sẽ hình thức: nó là thứ khiến "gỡ bỏ phần mô
 * phỏng thì luồng thanh toán vẫn chạy" trở thành sự thật kiểm chứng được, và là
 * bằng chứng khi bảo vệ rằng phần đối soát là mã production chứ không phải
 * đồ chơi. `sandbox-bank-isolation.test.ts` kiểm ràng buộc này tự động.
 */

export interface SandboxPaymentInfo {
  refCode: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /**
   * Mã tra cứu đơn, hiện lên màn hình sau khi bấm thanh toán.
   *
   * Trang này là XÁC NHẬN CHÍNH THỨC cho khách đặt qua Facebook: họ không đăng
   * nhập được, và tin nhắn Messenger có thể không gửi tới nơi (token hết hạn,
   * chi nhánh vừa ngắt kết nối). Không hiện mã đơn ở đây thì khách trả tiền
   * xong mà không cầm được gì để tra cứu.
   *
   * `null` với khoản không gắn phiếu đặt sân, ví dụ mua gói slot.
   */
  bookingCode: string | null;
}

/**
 * Tra thông tin hiển thị cho trang thanh toán mô phỏng.
 *
 * Dùng SQL thô có chủ đích — nạp entity vào đây sẽ kéo theo phụ thuộc mà ranh
 * giới ở trên tồn tại để ngăn.
 */
export async function findPendingPayment(refCode: string): Promise<SandboxPaymentInfo | null> {
  // Chi nhánh nhận tiền suy ra từ CHÍNH đối tượng đang được trả — phiếu đặt sân
  // hoặc gói slot. Nối cứng vào `bookings` như trước thì mọi khoản không phải
  // đặt sân đều báo "giao dịch không còn hiệu lực": mã QR hiện ra bình thường,
  // quét xong lại không có gì xảy ra, và chẳng có gì chỉ ra vì sao.
  const rows = await AppDataSource.query(
    `SELECT pt.payment_ref_code,
            pt.amount,
            pt.booking_id,
            cps.bank_code,
            cps.account_number,
            cps.account_name
       FROM payment_transactions pt
       LEFT JOIN bookings b           ON b.id = pt.booking_id
       LEFT JOIN customer_packages cp ON cp.id = pt.customer_package_id
       JOIN cafe_payment_settings cps
              ON cps.cafe_id = COALESCE(b.cafe_id, cp.cafe_id)
             AND cps.deleted_at IS NULL
      WHERE pt.payment_ref_code = $1
        AND pt.status = 'PENDING'
      LIMIT 1`,
    [refCode],
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    refCode: row.payment_ref_code,
    // ⚠️ `numeric` về dạng chuỗi.
    amount: Number(row.amount),
    bankName: row.bank_code ?? 'Ngân hàng',
    accountNumber: row.account_number,
    accountName: row.account_name,
    bookingCode: row.booking_id ? `RCF-${String(row.booking_id).slice(0, 4).toUpperCase()}` : null,
  };
}

/**
 * Phát ra một thông báo "tiền đã về" đúng định dạng dịch vụ đối soát thật.
 *
 * Gọi qua HTTP chứ không gọi hàm trực tiếp: đây là chỗ duy nhất trong hệ thống
 * mô phỏng bên ngoài, và đi qua đúng đường mạng mà SePay sẽ đi nghĩa là mọi thứ
 * dưới nó — xác thực khoá, giới hạn tần suất, chống trùng, đối soát — đều được
 * chạy thật trong lúc demo.
 */
export async function emitTransferNotification(
  payment: SandboxPaymentInfo,
): Promise<{ ok: boolean }> {
  const payload = {
    id: Date.now(),
    gateway: 'SANDBOX',
    transactionDate: formatBankDate(new Date()),
    accountNumber: payment.accountNumber,
    content: payment.refCode,
    transferType: 'in' as const,
    transferAmount: payment.amount,
    referenceCode: `SANDBOX.${Date.now()}`,
    accumulated: 0,
    subAccount: null,
    code: null,
    description: 'Giao dịch mô phỏng',
  };

  const url = new URL('/api/v1/payments/bank-webhook', env.apiBaseUrl).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${env.bankWebhook.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.error('SandboxBank', 'webhook từ chối thông báo mô phỏng', {
      status: response.status,
      refCode: payment.refCode,
    });
    return { ok: false };
  }

  logger.info('SandboxBank', 'đã phát thông báo tiền về', {
    refCode: payment.refCode,
    amount: payment.amount,
  });
  return { ok: true };
}

/** Định dạng `YYYY-MM-DD HH:mm:ss` mà dịch vụ đối soát dùng. */
function formatBankDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
