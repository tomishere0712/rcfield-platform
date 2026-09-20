import {
  calculateRefundAmounts,
  calculateRefundablePreorderAmount,
  getNetRefundablePrepaidAmounts,
} from '../../services/payment.service';
import { UserRole } from '../../types';

interface BookingSnapshot {
  slot_fee_total: number;
  vehicles: Array<{ rental_fee: number }>;
  fnb_total: number;
  discount_amount: number;
  total_charged: number;
}

function makeSnapshot(overrides: Partial<BookingSnapshot> = {}): BookingSnapshot {
  return {
    slot_fee_total: 300000,
    vehicles: [{ rental_fee: 200000 }],
    fnb_total: 0,
    discount_amount: 0,
    total_charged: 500000,
    ...overrides,
  };
}

describe('R1 — Customer cancellation refund rules', () => {
  const slotStart = new Date(Date.now() + 30 * 60 * 60 * 1000); // 30h from now

  it('>24h before: refunds 100% slot_fee + 100% rental; no vehicle deposit exists', () => {
    const snapshot = makeSnapshot();
    const result = calculateRefundAmounts(snapshot, UserRole.CUSTOMER, slotStart);

    expect(result.slotFeeRefund).toBe(300000);
    expect(result.rentalFeeRefund).toBe(200000);
    expect(result.depositRefund).toBe(0);
    expect(result.totalRefund).toBe(500000);
  });

  it('12–24h before: refunds 50% slot_fee + 100% rental', () => {
    const snapshot = makeSnapshot();
    const slotStart18h = new Date(Date.now() + 18 * 60 * 60 * 1000);
    const result = calculateRefundAmounts(snapshot, UserRole.CUSTOMER, slotStart18h);

    expect(result.slotFeeRefund).toBe(150000);
    expect(result.rentalFeeRefund).toBe(200000);
    expect(result.depositRefund).toBe(0);
    expect(result.totalRefund).toBe(350000);
  });

  it('<12h before: refunds 0% slot_fee + 100% rental', () => {
    const snapshot = makeSnapshot();
    const slotStart6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const result = calculateRefundAmounts(snapshot, UserRole.CUSTOMER, slotStart6h);

    expect(result.slotFeeRefund).toBe(0);
    expect(result.rentalFeeRefund).toBe(200000);
    expect(result.depositRefund).toBe(0);
    expect(result.totalRefund).toBe(200000);
  });

  it('with F&B: includes fnb_total in all windows', () => {
    const snapshot = makeSnapshot({ fnb_total: 50000, total_charged: 550000 });
    const slotStart6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const result = calculateRefundAmounts(snapshot, UserRole.CUSTOMER, slotStart6h);

    expect(result.fnbRefund).toBe(50000);
    expect(result.totalRefund).toBe(250000);
  });
});

describe('R2 — Provider cancellation (always 100%)', () => {
  it('refunds 100% of all components regardless of timing', () => {
    const snapshot = makeSnapshot({ fnb_total: 50000, total_charged: 550000 });
    const slotStart1h = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const result = calculateRefundAmounts(snapshot, UserRole.PROVIDER, slotStart1h);

    expect(result.slotFeeRefund).toBe(300000);
    expect(result.rentalFeeRefund).toBe(200000);
    expect(result.depositRefund).toBe(0);
    expect(result.fnbRefund).toBe(50000);
    expect(result.totalRefund).toBe(550000);
  });
});

describe('Promotion-safe refunds', () => {
  it('allocates the promotion across slot and rental before refunding', () => {
    const snapshot = makeSnapshot({ discount_amount: 100000, total_charged: 400000 });
    const net = getNetRefundablePrepaidAmounts(snapshot);
    const result = calculateRefundAmounts(
      snapshot,
      UserRole.CUSTOMER,
      new Date(Date.now() + 30 * 60 * 60 * 1000),
    );

    expect(net.slotFee).toBe(240000);
    expect(net.rentalFee).toBe(160000);
    expect(result.totalRefund).toBe(400000);
    expect(result.totalRefund).toBeLessThanOrEqual(snapshot.total_charged);
  });

  it('applies the 12–24h slot penalty to the discounted slot amount', () => {
    const snapshot = makeSnapshot({ discount_amount: 100000, total_charged: 400000 });
    const result = calculateRefundAmounts(
      snapshot,
      UserRole.CUSTOMER,
      new Date(Date.now() + 18 * 60 * 60 * 1000),
    );

    expect(result.slotFeeRefund).toBe(120000);
    expect(result.rentalFeeRefund).toBe(160000);
    expect(result.totalRefund).toBe(280000);
  });
});

describe('R3 — No-show / payment timeout', () => {
  it('refunds 0% slot_fee + 100% rental; no deposit is refunded', () => {
    const snapshot = makeSnapshot();
    const result = calculateRefundAmounts(snapshot, UserRole.CUSTOMER, new Date(0), true);

    expect(result.slotFeeRefund).toBe(0);
    expect(result.rentalFeeRefund).toBe(200000);
    expect(result.depositRefund).toBe(0);
    expect(result.totalRefund).toBe(200000);
  });
});

describe('F&B refund eligibility', () => {
  it('excludes the amount of a pre-order that has already been served', () => {
    expect(calculateRefundablePreorderAmount(55000, 25000)).toBe(30000);
  });

  it('never returns a negative refund when served amount exceeds the stored snapshot', () => {
    expect(calculateRefundablePreorderAmount(55000, 60000)).toBe(0);
  });
});

describe('Edge cases', () => {
  it('BYOC booking (no vehicles): only slot_fee refunded', () => {
    const snapshot = makeSnapshot({ vehicles: [], total_charged: 300000 });
    const result = calculateRefundAmounts(
      snapshot,
      UserRole.CUSTOMER,
      new Date(Date.now() + 30 * 60 * 60 * 1000),
    );

    expect(result.rentalFeeRefund).toBe(0);
    expect(result.depositRefund).toBe(0);
    expect(result.slotFeeRefund).toBe(300000);
  });
});
