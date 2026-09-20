import type { SePayWebhookPayload } from '../../services/bank-webhook.service';

/**
 * Dựng payload đúng định dạng dịch vụ đối soát ngân hàng (SePay).
 *
 * Bám sát định dạng thật là ràng buộc thiết kế, không phải chi tiết test: khi
 * chuyển sang dịch vụ thương mại, chỉ đổi URL và khoá API — nếu test dùng một
 * định dạng tự chế thì mọi bảo đảm ở đây đều vô nghĩa.
 */

let counter = 0;

interface Overrides {
  id?: number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  content?: string;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  referenceCode?: string;
}

export function buildSePayPayload(overrides: Overrides = {}): SePayWebhookPayload {
  counter += 1;
  return {
    id: overrides.id ?? 900000 + counter,
    gateway: overrides.gateway ?? 'Vietcombank',
    transactionDate: overrides.transactionDate ?? '2026-08-11 14:02:37',
    accountNumber: overrides.accountNumber ?? '0123453210',
    content: overrides.content ?? 'RCF7K2M9 chuyen tien',
    transferType: overrides.transferType ?? 'in',
    transferAmount: overrides.transferAmount ?? 350000,
    referenceCode: overrides.referenceCode ?? `MBVCB.${900000 + counter}`,
    accumulated: 19077000,
    subAccount: null,
    code: null,
    description: '',
  };
}
