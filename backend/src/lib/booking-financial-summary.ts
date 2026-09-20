import { PaymentComponent } from '../models/payment-component.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import {
  PaymentComponentStatus,
  PaymentComponentType,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '../types';

export type FinancialLineGroup = 'PREPAID' | 'ON_SITE';

export interface FinancialPaymentReference {
  transactionId: string;
  txnRef: string;
  gateway: string;
  paidAt: string;
}

export interface FinancialLine {
  componentId: string;
  type: PaymentComponentType;
  label: string;
  amount: number;
  status: PaymentComponentStatus;
  group: FinancialLineGroup;
  payment?: FinancialPaymentReference;
}

export interface BookingFinancialSummary {
  prepaidLines: FinancialLine[];
  additionalLines: FinancialLine[];
  prepaidServiceTotal: number;
  prepaidDiscountAmount: number;
  prepaidPaidAmount: number;
  prepaidOutstandingAmount: number;
  additionalTotal: number;
  additionalPaidAmount: number;
  additionalOutstandingAmount: number;
  totalPaidAmount: number;
  totalRefundedAmount: number;
  netPaidAmount: number;
  outstandingAmount: number;
  isSettled: boolean;
}

/**
 * A PENDING booking deliberately has no persisted payment components yet: those
 * components are created only after the gateway confirms the payment.  Its
 * checkout snapshot is therefore the source for the amount being held/owed.
 */
export interface PendingInitialPaymentSnapshot {
  slot_fee_total?: number;
  slot_fee?: number;
  vehicles?: Array<{ rental_fee?: number }>;
  rental_fee?: number;
  fnb_total?: number;
  fnb_preorder_fee?: number;
  contest_entry_fee?: number;
}

type TransactionComponentSnapshot = {
  id?: string;
  type?: string;
  amount?: number;
};

type PaymentRequestSnapshot = {
  additionalPayment?: boolean;
  counterSettlement?: boolean;
  components?: TransactionComponentSnapshot[];
};

function asPaymentRequestSnapshot(value: object | null): PaymentRequestSnapshot {
  return (value ?? {}) as PaymentRequestSnapshot;
}

function isAdditionalPayment(transaction: PaymentTransaction): boolean {
  const request = asPaymentRequestSnapshot(transaction.rawRequest);
  return (
    request.additionalPayment === true ||
    request.counterSettlement === true ||
    transaction.txnRef.startsWith('ctr_')
  );
}

function componentSnapshots(transaction: PaymentTransaction): TransactionComponentSnapshot[] {
  const value = asPaymentRequestSnapshot(transaction.rawRequest).components;
  return Array.isArray(value) ? value : [];
}

function componentLabel(component: PaymentComponent): string {
  switch (component.type) {
    case PaymentComponentType.SLOT_FEE:
      return 'Phí lịch chơi';
    case PaymentComponentType.RENTAL_FEE:
      return 'Phí thuê xe';
    case PaymentComponentType.CONTEST_ENTRY_FEE:
      return 'Phí tham gia giải đấu';
    case PaymentComponentType.FB_PREORDER:
      return 'Đồ ăn & thức uống đặt trước';
    case PaymentComponentType.FNB_ON_SITE:
      return 'Đồ ăn & thức uống gọi tại quầy';
    case PaymentComponentType.EXTENSION_FEE:
      return 'Phí gia hạn ca chơi';
    case PaymentComponentType.DAMAGE_CHARGE:
      return 'Phí bồi thường hư hỏng';
    case PaymentComponentType.SECURITY_DEPOSIT:
      return 'Tiền cọc xe';
    default:
      return 'Khoản thanh toán khác';
  }
}

function isPrepaidComponent(component: PaymentComponent): boolean {
  return (
    component.type === PaymentComponentType.SLOT_FEE ||
    component.type === PaymentComponentType.RENTAL_FEE ||
    component.type === PaymentComponentType.CONTEST_ENTRY_FEE ||
    component.type === PaymentComponentType.FB_PREORDER
  );
}

function pendingPrepaidLines(snapshot: PendingInitialPaymentSnapshot): FinancialLine[] {
  const slotFee = Number(snapshot.slot_fee_total ?? snapshot.slot_fee ?? 0);
  const rentalFee = Array.isArray(snapshot.vehicles)
    ? snapshot.vehicles.reduce((sum, vehicle) => sum + Number(vehicle.rental_fee ?? 0), 0)
    : Number(snapshot.rental_fee ?? 0);
  const fnbPreorderFee = Number(snapshot.fnb_total ?? snapshot.fnb_preorder_fee ?? 0);
  const contestEntryFee = Number(snapshot.contest_entry_fee ?? 0);

  return [
    {
      componentId: 'pending-slot-fee',
      type: PaymentComponentType.SLOT_FEE,
      label: 'Phí lịch chơi',
      amount: slotFee,
      status: PaymentComponentStatus.PENDING,
      group: 'PREPAID' as const,
    },
    {
      componentId: 'pending-rental-fee',
      type: PaymentComponentType.RENTAL_FEE,
      label: 'Phí thuê xe',
      amount: rentalFee,
      status: PaymentComponentStatus.PENDING,
      group: 'PREPAID' as const,
    },
    {
      componentId: 'pending-fnb-preorder',
      type: PaymentComponentType.FB_PREORDER,
      label: 'Đồ ăn & thức uống đặt trước',
      amount: fnbPreorderFee,
      status: PaymentComponentStatus.PENDING,
      group: 'PREPAID' as const,
    },
    {
      componentId: 'pending-contest-entry-fee',
      type: PaymentComponentType.CONTEST_ENTRY_FEE,
      label: 'Phí tham gia giải đấu',
      amount: contestEntryFee,
      status: PaymentComponentStatus.PENDING,
      group: 'PREPAID' as const,
    },
  ].filter((line) => Number.isFinite(line.amount) && line.amount > 0);
}

function findSuccessfulPayment(
  component: PaymentComponent,
  transactions: PaymentTransaction[],
  additional: boolean,
): FinancialPaymentReference | undefined {
  const successfulTransactions = transactions.filter(
    (transaction) =>
      transaction.type === PaymentTransactionType.PAYMENT &&
      transaction.status === PaymentTransactionStatus.SUCCESS &&
      isAdditionalPayment(transaction) === additional,
  );

  const transaction = successfulTransactions.find((candidate) =>
    componentSnapshots(candidate).some(
      (snapshot) =>
        snapshot.id === component.id ||
        (!snapshot.id &&
          snapshot.type === component.type &&
          Number(snapshot.amount) === Number(component.amount)),
    ),
  );

  if (!transaction) return undefined;
  return {
    transactionId: transaction.id,
    txnRef: transaction.txnRef,
    gateway: transaction.gateway,
    paidAt: transaction.updatedAt.toISOString(),
  };
}

/**
 * Financial source of truth shared by customer booking and staff session views.
 * F&B orders remain operational records; only payment components may determine
 * the amount due/paid in a settlement.
 */
export function buildBookingFinancialSummary(
  components: PaymentComponent[],
  transactions: PaymentTransaction[],
  discountAmount = 0,
  pendingInitialPaymentSnapshot?: PendingInitialPaymentSnapshot | null,
): BookingFinancialSummary {
  const chargeComponents = components.filter(
    (component) => component.type !== PaymentComponentType.SECURITY_DEPOSIT,
  );
  const prepaidComponents = chargeComponents.filter(isPrepaidComponent);
  const additionalComponents = chargeComponents.filter(
    (component) => !isPrepaidComponent(component),
  );

  const seenPrepaidKeys = new Set<string>();
  const uniquePrepaidComponents = prepaidComponents.filter((component) => {
    const key = component.bookingVehicleId
      ? `${component.type}_${component.bookingVehicleId}`
      : `${component.type}`;
    if (seenPrepaidKeys.has(key)) {
      return false;
    }
    seenPrepaidKeys.add(key);
    return true;
  });

  const persistedPrepaidLines = uniquePrepaidComponents.map((component) => ({
    componentId: component.id,
    type: component.type,
    label: componentLabel(component),
    amount: Number(component.amount),
    status: component.status,
    group: 'PREPAID' as const,
    payment: findSuccessfulPayment(component, transactions, false),
  }));
  const prepaidLines =
    persistedPrepaidLines.length > 0 || !pendingInitialPaymentSnapshot
      ? persistedPrepaidLines
      : pendingPrepaidLines(pendingInitialPaymentSnapshot);
  const additionalLines = additionalComponents.map((component) => ({
    componentId: component.id,
    type: component.type,
    label: componentLabel(component),
    amount: Number(component.amount),
    status: component.status,
    group: 'ON_SITE' as const,
    payment: findSuccessfulPayment(component, transactions, true),
  }));

  const successfulPayments = transactions.filter(
    (transaction) =>
      transaction.type === PaymentTransactionType.PAYMENT &&
      transaction.status === PaymentTransactionStatus.SUCCESS,
  );
  const successfulRefunds = transactions.filter(
    (transaction) =>
      transaction.type === PaymentTransactionType.REFUND &&
      transaction.status === PaymentTransactionStatus.SUCCESS,
  );
  const prepaidPayments = successfulPayments.filter(
    (transaction) => !isAdditionalPayment(transaction),
  );
  const additionalPayments = successfulPayments.filter(isAdditionalPayment);

  const prepaidServiceTotal = prepaidLines.reduce((sum, line) => sum + line.amount, 0);
  const normalizedDiscountAmount = Math.max(0, Number(discountAmount) || 0);
  const additionalTotal = additionalLines.reduce((sum, line) => sum + line.amount, 0);
  const additionalOutstandingAmount = additionalLines
    .filter((line) => line.status === PaymentComponentStatus.PENDING)
    .reduce((sum, line) => sum + line.amount, 0);
  const totalRefundedAmount = successfulRefunds.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  const prepaidPaidAmount = prepaidPayments.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  const prepaidOutstandingAmount = Math.max(
    0,
    prepaidServiceTotal - normalizedDiscountAmount - prepaidPaidAmount,
  );
  const outstandingAmount = prepaidOutstandingAmount + additionalOutstandingAmount;

  const grossPaidAmount = successfulPayments.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  const netPaidAmount = Math.max(0, grossPaidAmount - totalRefundedAmount);

  return {
    prepaidLines,
    additionalLines,
    prepaidServiceTotal,
    prepaidDiscountAmount: normalizedDiscountAmount,
    prepaidPaidAmount,
    prepaidOutstandingAmount,
    additionalTotal,
    additionalPaidAmount: additionalPayments.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0,
    ),
    additionalOutstandingAmount,
    totalPaidAmount: grossPaidAmount,
    totalRefundedAmount,
    netPaidAmount,
    outstandingAmount,
    isSettled: outstandingAmount === 0,
  };
}
