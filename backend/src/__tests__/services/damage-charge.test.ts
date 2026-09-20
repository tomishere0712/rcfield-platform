import {
  SubmitInspectionV2Schema,
  ConfirmCheckoutSchema,
  UpdateDamageItemsSchema,
} from '../../validate';
import { DamagePartType } from '../../types';
import {
  RENTAL_INSPECTION_MAX_PHOTOS,
  RENTAL_INSPECTION_MIN_PHOTOS,
  hasValidRentalInspectionPhotoCount,
} from '../../lib/inspection-photo-policy';

describe('inspection photo policy', () => {
  it('chấp nhận từ 4 đến 6 ảnh cho biên bản xe thuê', () => {
    expect(hasValidRentalInspectionPhotoCount(Array(RENTAL_INSPECTION_MIN_PHOTOS).fill({}))).toBe(
      true,
    );
    expect(hasValidRentalInspectionPhotoCount(Array(RENTAL_INSPECTION_MAX_PHOTOS).fill({}))).toBe(
      true,
    );
  });

  it('từ chối biên bản xe thuê thiếu ảnh hoặc vượt quá số ảnh tối đa', () => {
    expect(
      hasValidRentalInspectionPhotoCount(Array(RENTAL_INSPECTION_MIN_PHOTOS - 1).fill({})),
    ).toBe(false);
    expect(
      hasValidRentalInspectionPhotoCount(Array(RENTAL_INSPECTION_MAX_PHOTOS + 1).fill({})),
    ).toBe(false);
    expect(hasValidRentalInspectionPhotoCount(undefined)).toBe(false);
  });
});

// ── SubmitInspectionV2Schema — damageLineItems validation ──────────────────────

describe('SubmitInspectionV2Schema — damageLineItems', () => {
  const base = { type: 'CHECK_OUT' as const, damageFlagged: true };

  it('chấp nhận 1 line item hợp lệ', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [
        { partType: DamagePartType.TIRE_WHEEL, partsPrice: 150000, laborPrice: 50000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('chấp nhận N line items hợp lệ và tính tổng đúng', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [
        { partType: DamagePartType.TIRE_WHEEL, partsPrice: 150000, laborPrice: 50000 },
        { partType: DamagePartType.SHELL, partsPrice: 80000, laborPrice: 0 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.damageLineItems).toHaveLength(2);
    }
  });

  it('chấp nhận mảng rỗng (không hư hỏng)', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      type: 'CHECK_OUT',
      damageFlagged: false,
      damageLineItems: [],
    });
    expect(result.success).toBe(true);
  });

  it('laborPrice mặc định = 0 khi không truyền', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [{ partType: DamagePartType.SPOILER, partsPrice: 80000 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.damageLineItems![0].laborPrice).toBe(0);
    }
  });

  it('từ chối partsPrice < 0', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [{ partType: DamagePartType.SHELL, partsPrice: -1000, laborPrice: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes('0'))).toBe(true);
  });

  it('từ chối laborPrice < 0', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [{ partType: DamagePartType.MOTOR, partsPrice: 100000, laborPrice: -500 }],
    });
    expect(result.success).toBe(false);
  });

  it('từ chối partType=OTHER khi không có customPartName', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [{ partType: DamagePartType.OTHER, partsPrice: 30000, laborPrice: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes('Vui lòng nhập tên hư hỏng'))).toBe(
      true,
    );
  });

  it('từ chối partType=OTHER khi customPartName là chuỗi rỗng/khoảng trắng', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [
        { partType: DamagePartType.OTHER, customPartName: '   ', partsPrice: 30000, laborPrice: 0 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes('Vui lòng nhập tên hư hỏng'))).toBe(
      true,
    );
  });

  it('chấp nhận partType=OTHER với customPartName hợp lệ', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [
        {
          partType: DamagePartType.OTHER,
          customPartName: 'Ăng-ten gãy',
          partsPrice: 30000,
          laborPrice: 20000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('từ chối giá trị partType không tồn tại trong enum', () => {
    const result = SubmitInspectionV2Schema.safeParse({
      ...base,
      damageLineItems: [{ partType: 'BUMPER', partsPrice: 50000, laborPrice: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

// ── ConfirmCheckoutSchema ──────────────────────────────────────────────────────

describe('ConfirmCheckoutSchema', () => {
  it('chấp nhận UUID hợp lệ', () => {
    const result = ConfirmCheckoutSchema.safeParse({
      inspectionId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('từ chối chuỗi không phải UUID', () => {
    const result = ConfirmCheckoutSchema.safeParse({ inspectionId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('UUID');
  });

  it('từ chối body thiếu inspectionId', () => {
    const result = ConfirmCheckoutSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── UpdateDamageItemsSchema ────────────────────────────────────────────────────

describe('UpdateDamageItemsSchema', () => {
  it('chấp nhận mảng hợp lệ', () => {
    const result = UpdateDamageItemsSchema.safeParse({
      damageLineItems: [{ partType: 'CHASSIS', partsPrice: 200000, laborPrice: 50000 }],
    });
    expect(result.success).toBe(true);
  });

  it('chấp nhận mảng rỗng (xóa hết hạng mục)', () => {
    const result = UpdateDamageItemsSchema.safeParse({ damageLineItems: [] });
    expect(result.success).toBe(true);
  });

  it('từ chối partType=OTHER không có customPartName', () => {
    const result = UpdateDamageItemsSchema.safeParse({
      damageLineItems: [{ partType: 'OTHER', partsPrice: 30000 }],
    });
    expect(result.success).toBe(false);
  });

  it('từ chối thiếu field damageLineItems', () => {
    const result = UpdateDamageItemsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── settleSessionCheckoutBilling & damage update ─────────────────────────────

import { settleSessionCheckoutBilling } from '../../services/staff.service';
import { AppDataSource } from '../../config/database';
import { Session } from '../../models/session.entity';
import { Booking } from '../../models/booking.entity';
import { Inspection } from '../../models/inspection.entity';
import { DamageLineItem } from '../../models/damage-line-item.entity';
import { PaymentComponent } from '../../models/payment-component.entity';
import { User } from '../../models/user.entity';
import { Cafe } from '../../models/cafe.entity';
import {
  BookingMode,
  BookingStatus,
  BookingSource,
  InspectionType,
  InspectionSubjectType,
  PaymentComponentType,
  PaymentComponentStatus,
  SessionStatus,
  UserRole,
} from '../../types';
import { createTestUser, createTestCafe } from '../helpers';

describe('settleSessionCheckoutBilling — damage updates and deposit reconciliation', () => {
  let staffUser: User;
  let customer: User;
  let cafe: Cafe;
  let booking: Booking;
  let session: Session;
  let checkoutInspection: Inspection;

  beforeEach(async () => {
    staffUser = await createTestUser({ role: UserRole.STAFF });
    customer = await createTestUser({ role: UserRole.CUSTOMER });
    cafe = await createTestCafe();

    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);
    const now = new Date();
    const later = new Date(now.getTime() + 3600000);

    // Create booking
    const bookingRepo = AppDataSource.getRepository(Booking);
    booking = bookingRepo.create({
      customerId: customer.id,
      cafeId: cafe.id,
      trackTypeId: trackType?.id || customer.id,
      source: BookingSource.APP,
      status: BookingStatus.CONFIRMED,
      playMode: BookingMode.RENTAL,
      slotStart: now,
      slotEnd: later,
      paymentExpiresAt: later,
      snapshot: {},
    });
    booking = await bookingRepo.save(booking);

    // Create session
    const sessionRepo = AppDataSource.getRepository(Session);
    session = sessionRepo.create({
      bookingId: booking.id,
      cafeId: cafe.id,
      checkedInBy: staffUser.id,
      actualStartAt: now,
      plannedEndAt: later,
      status: SessionStatus.CHECKING_OUT,
    });
    session = await sessionRepo.save(session);

    // Create checkout inspection
    const inspRepo = AppDataSource.getRepository(Inspection);
    checkoutInspection = inspRepo.create({
      sessionId: session.id,
      type: InspectionType.CHECK_OUT,
      subjectType: InspectionSubjectType.RENTAL_VEHICLE,
      performedBy: staffUser.id,
      damageNoted: true,
      damageDescription: 'Hỏng bánh xe',
      customerConfirmed: false,
    });
    checkoutInspection = await inspRepo.save(checkoutInspection);
  });

  it('tạo và cập nhật đúng tiền bồi thường sửa xe khi staff chỉnh sửa giá phụ tùng', async () => {
    const compRepo = AppDataSource.getRepository(PaymentComponent);
    const liRepo = AppDataSource.getRepository(DamageLineItem);

    // Initial damage = 50.000đ
    const item1 = liRepo.create({
      inspectionId: checkoutInspection.id,
      partType: DamagePartType.SHELL,
      partsPrice: 50000,
      laborPrice: 0,
    });
    await liRepo.save(item1);

    await settleSessionCheckoutBilling(session.id, checkoutInspection);

    let damageComp = await compRepo.findOne({
      where: { bookingId: booking.id, type: PaymentComponentType.DAMAGE_CHARGE },
    });
    expect(damageComp?.status).toBe(PaymentComponentStatus.PENDING);
    expect(Number(damageComp?.amount)).toBe(50000);

    // Staff edits damage price to 120.000đ
    await liRepo.delete({ inspectionId: checkoutInspection.id });
    const item2 = liRepo.create({
      inspectionId: checkoutInspection.id,
      partType: DamagePartType.SHELL,
      partsPrice: 120000,
      laborPrice: 0,
    });
    await liRepo.save(item2);

    await settleSessionCheckoutBilling(session.id, checkoutInspection);

    damageComp = await compRepo.findOne({
      where: { bookingId: booking.id, type: PaymentComponentType.DAMAGE_CHARGE },
    });
    expect(damageComp?.status).toBe(PaymentComponentStatus.PENDING);
    expect(Number(damageComp?.amount)).toBe(120000); // Updated to 120k!

    // Staff removes all damage items (price = 0đ)
    await liRepo.delete({ inspectionId: checkoutInspection.id });
    checkoutInspection.damageNoted = false;
    await AppDataSource.getRepository(Inspection).save(checkoutInspection);

    await settleSessionCheckoutBilling(session.id, checkoutInspection);

    damageComp = await compRepo.findOne({
      where: { bookingId: booking.id, type: PaymentComponentType.DAMAGE_CHARGE },
    });
    expect(damageComp).toBeNull(); // Cleaned up!
  });
});
