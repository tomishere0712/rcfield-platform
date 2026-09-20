import { PaymentComponent } from '../../models/payment-component.entity';
import { PaymentTransaction } from '../../models/payment-transaction.entity';
import {
  PaymentComponentStatus,
  PaymentComponentType,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '../../types';
import { buildBookingFinancialSummary } from '../../lib/booking-financial-summary';

function component(
  id: string,
  type: PaymentComponentType,
  amount: number,
  status: PaymentComponentStatus,
  extra?: Partial<PaymentComponent>,
): PaymentComponent {
  return { id, type, amount, status, ...extra } as PaymentComponent;
}

function payment(id: string, amount: number, rawRequest: object): PaymentTransaction {
  return {
    id,
    txnRef: id,
    amount,
    type: PaymentTransactionType.PAYMENT,
    status: PaymentTransactionStatus.SUCCESS,
    gateway: 'VNPAY',
    rawRequest,
    updatedAt: new Date('2026-07-24T10:00:00.000Z'),
  } as PaymentTransaction;
}

describe('buildBookingFinancialSummary', () => {
  it('separates prepaid and on-site fees without treating an F&B order as a second source of money', () => {
    const summary = buildBookingFinancialSummary(
      [
        component('slot', PaymentComponentType.SLOT_FEE, 50_000, PaymentComponentStatus.HELD),
        component('rental', PaymentComponentType.RENTAL_FEE, 150_000, PaymentComponentStatus.HELD),
        component(
          'preorder',
          PaymentComponentType.FB_PREORDER,
          140_000,
          PaymentComponentStatus.HELD,
        ),
        component(
          'onsite',
          PaymentComponentType.FNB_ON_SITE,
          25_000,
          PaymentComponentStatus.DISBURSED,
        ),
        component(
          'damage',
          PaymentComponentType.DAMAGE_CHARGE,
          60_000,
          PaymentComponentStatus.PENDING,
        ),
        component(
          'legacy-deposit',
          PaymentComponentType.SECURITY_DEPOSIT,
          500_000,
          PaymentComponentStatus.HELD,
        ),
      ],
      [
        payment('initial-payment', 340_000, {
          components: [
            { id: 'slot', type: PaymentComponentType.SLOT_FEE, amount: 50_000 },
            { id: 'rental', type: PaymentComponentType.RENTAL_FEE, amount: 150_000 },
            { id: 'preorder', type: PaymentComponentType.FB_PREORDER, amount: 140_000 },
          ],
        }),
        payment('ctr-onsite', 25_000, {
          additionalPayment: true,
          components: [{ id: 'onsite', type: PaymentComponentType.FNB_ON_SITE, amount: 25_000 }],
        }),
      ],
    );

    expect(summary.prepaidLines.map((line) => line.label)).toEqual([
      'Phí lịch chơi',
      'Phí thuê xe',
      'Đồ ăn & thức uống đặt trước',
    ]);
    expect(summary.prepaidServiceTotal).toBe(340_000);
    expect(summary.prepaidPaidAmount).toBe(340_000);
    expect(summary.additionalLines.map((line) => line.label)).toEqual([
      'Đồ ăn & thức uống gọi tại quầy',
      'Phí bồi thường hư hỏng',
    ]);
    expect(summary.additionalTotal).toBe(85_000);
    expect(summary.additionalPaidAmount).toBe(25_000);
    expect(summary.additionalOutstandingAmount).toBe(60_000);
    expect(summary.totalPaidAmount).toBe(365_000);
    expect(summary.isSettled).toBe(false);
  });

  it('classifies a contest entry fee collected in checkout as prepaid', () => {
    const summary = buildBookingFinancialSummary(
      [
        component('slot', PaymentComponentType.SLOT_FEE, 50_000, PaymentComponentStatus.HELD),
        component(
          'entry-fee',
          PaymentComponentType.CONTEST_ENTRY_FEE,
          150_000,
          PaymentComponentStatus.HELD,
        ),
      ],
      [
        payment('initial-payment', 200_000, {
          components: [
            { id: 'slot', type: PaymentComponentType.SLOT_FEE, amount: 50_000 },
            {
              id: 'entry-fee',
              type: PaymentComponentType.CONTEST_ENTRY_FEE,
              amount: 150_000,
            },
          ],
        }),
      ],
    );

    expect(summary.prepaidLines.map((line) => line.label)).toEqual([
      'Phí lịch chơi',
      'Phí tham gia giải đấu',
    ]);
    expect(summary.prepaidServiceTotal).toBe(200_000);
    expect(summary.prepaidPaidAmount).toBe(200_000);
    expect(summary.additionalLines).toEqual([]);
  });

  it('shows a pending booking hold as unpaid from its frozen checkout snapshot', () => {
    const summary = buildBookingFinancialSummary([], [], 10_000, {
      slot_fee_total: 50_000,
      vehicles: [{ rental_fee: 115_000 }],
      fnb_total: 10_000,
    });

    expect(summary.prepaidLines.map((line) => [line.label, line.status, line.amount])).toEqual([
      ['Phí lịch chơi', PaymentComponentStatus.PENDING, 50_000],
      ['Phí thuê xe', PaymentComponentStatus.PENDING, 115_000],
      ['Đồ ăn & thức uống đặt trước', PaymentComponentStatus.PENDING, 10_000],
    ]);
    expect(summary.prepaidServiceTotal).toBe(175_000);
    expect(summary.prepaidPaidAmount).toBe(0);
    expect(summary.prepaidOutstandingAmount).toBe(165_000);
    expect(summary.outstandingAmount).toBe(165_000);
    expect(summary.isSettled).toBe(false);
  });

  it('keeps totalPaidAmount as gross paid amount and tracks totalRefundedAmount and netPaidAmount separately', () => {
    const refundTx = {
      id: 'refund-1',
      txnRef: 'refund-1',
      amount: 170_000,
      type: PaymentTransactionType.REFUND,
      status: PaymentTransactionStatus.SUCCESS,
      gateway: 'VNPAY',
      updatedAt: new Date('2026-07-24T12:00:00.000Z'),
    } as PaymentTransaction;

    const summary = buildBookingFinancialSummary(
      [
        component('slot', PaymentComponentType.SLOT_FEE, 100_000, PaymentComponentStatus.REFUNDED),
        component(
          'rental',
          PaymentComponentType.RENTAL_FEE,
          120_000,
          PaymentComponentStatus.REFUNDED,
        ),
      ],
      [
        payment('initial-payment', 220_000, {
          components: [
            { id: 'slot', type: PaymentComponentType.SLOT_FEE, amount: 100_000 },
            { id: 'rental', type: PaymentComponentType.RENTAL_FEE, amount: 120_000 },
          ],
        }),
        refundTx,
      ],
    );

    expect(summary.prepaidPaidAmount).toBe(220_000);
    expect(summary.totalPaidAmount).toBe(220_000);
    expect(summary.totalRefundedAmount).toBe(170_000);
    expect(summary.netPaidAmount).toBe(50_000);
    expect(summary.outstandingAmount).toBe(0);
    expect(summary.isSettled).toBe(true);
  });

  it('deduplicates duplicate prepaid components for the same vehicle/slot', () => {
    const summary = buildBookingFinancialSummary(
      [
        component('slot-1', PaymentComponentType.SLOT_FEE, 50_000, PaymentComponentStatus.HELD),
        component(
          'rental-1',
          PaymentComponentType.RENTAL_FEE,
          75_000,
          PaymentComponentStatus.HELD,
          {
            bookingVehicleId: 'bv-1',
          },
        ),
        // Duplicate records created accidentally or by double webhook
        component('slot-2', PaymentComponentType.SLOT_FEE, 50_000, PaymentComponentStatus.HELD),
        component(
          'rental-2',
          PaymentComponentType.RENTAL_FEE,
          75_000,
          PaymentComponentStatus.HELD,
          {
            bookingVehicleId: 'bv-1',
          },
        ),
        component('fnb-1', PaymentComponentType.FB_PREORDER, 100_000, PaymentComponentStatus.HELD),
      ],
      [
        payment('initial-payment', 225_000, {
          components: [
            { id: 'slot-1', type: PaymentComponentType.SLOT_FEE, amount: 50_000 },
            { id: 'rental-1', type: PaymentComponentType.RENTAL_FEE, amount: 75_000 },
            { id: 'fnb-1', type: PaymentComponentType.FB_PREORDER, amount: 100_000 },
          ],
        }),
      ],
    );

    expect(summary.prepaidLines.map((l) => [l.label, l.amount])).toEqual([
      ['Phí lịch chơi', 50_000],
      ['Phí thuê xe', 75_000],
      ['Đồ ăn & thức uống đặt trước', 100_000],
    ]);
    expect(summary.prepaidServiceTotal).toBe(225_000);
    expect(summary.prepaidPaidAmount).toBe(225_000);
  });
});
