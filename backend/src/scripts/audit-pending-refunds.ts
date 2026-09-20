/* eslint-disable no-console */
import { AppDataSource } from '../config/database';

interface PendingRefundAuditRow {
  booking_id: string;
  booking_status: string;
  slot_start: string;
  discount_amount: string;
  pending_component_refund: string;
  pending_refund_transaction: string;
  has_served_preorder: boolean;
}

/**
 * Read-only finance audit for refunds created before the promotion/F&B fixes.
 * It intentionally never updates a ledger entry: staff can verify the flagged
 * rows against proof of service before deciding whether to pay them out.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const rows = await AppDataSource.query<PendingRefundAuditRow[]>(
      `SELECT
         b.id AS booking_id,
         b.status AS booking_status,
         b.slot_start,
         b.discount_amount,
         COALESCE((
           SELECT SUM(pc.refunded_amount)
           FROM payment_components pc
           WHERE pc.booking_id = b.id
             AND pc.status = 'PENDING_REFUND'
         ), 0) AS pending_component_refund,
         COALESCE((
           SELECT SUM(pt.amount)
           FROM payment_transactions pt
           WHERE pt.booking_id = b.id
             AND pt.type = 'REFUND'
             AND pt.status = 'PENDING'
         ), 0) AS pending_refund_transaction,
         EXISTS(
           SELECT 1
           FROM fnb_orders fo
           WHERE fo.booking_id = b.id
             AND fo.order_type = 'PRE_ORDER'
             AND fo.status = 'DELIVERED'
         ) AS has_served_preorder
       FROM bookings b
       WHERE EXISTS(
         SELECT 1
         FROM payment_components pc
         WHERE pc.booking_id = b.id
           AND pc.status = 'PENDING_REFUND'
       )
          OR EXISTS(
            SELECT 1
            FROM payment_transactions pt
            WHERE pt.booking_id = b.id
              AND pt.type = 'REFUND'
              AND pt.status = 'PENDING'
          )
       ORDER BY b.slot_start ASC`,
    );

    const report = rows.map((row) => {
      const componentAmount = Number(row.pending_component_refund);
      const transactionAmount = Number(row.pending_refund_transaction);
      const warnings = [
        Number(row.discount_amount) > 0 ? 'PROMO_APPLIED' : null,
        row.has_served_preorder ? 'PREORDER_SERVED' : null,
        componentAmount !== transactionAmount ? 'LEDGER_AMOUNT_MISMATCH' : null,
      ].filter(Boolean);
      return {
        bookingId: row.booking_id,
        status: row.booking_status,
        slotStart: row.slot_start,
        pendingRefund: transactionAmount,
        componentRefund: componentAmount,
        warnings: warnings.join(', ') || 'OK',
      };
    });

    console.table(report);
    console.log(`\nĐã kiểm tra ${report.length} khoản hoàn tiền đang chờ.`);
    console.log('Các dòng có warning cần đối soát thủ công trước khi staff xác nhận hoàn tiền.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Không thể đối soát khoản hoàn tiền:', error);
  process.exitCode = 1;
});
