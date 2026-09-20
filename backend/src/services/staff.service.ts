/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { In, IsNull, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import {
  AppError,
  AuthProvider,
  BookingMode,
  BookingSource,
  BookingStatus,
  UserRole,
  SessionStatus,
  ParticipantRole,
  VehicleSource,
  SessionVehicleStatus,
  InspectionType,
  InspectionSubjectType,
  DamagePartType,
  PhotoAngle,
  InspectionItemStatus,
  ExtensionProposalStatus,
  VehicleStatus,
  FnbOrderType,
  FnbOrderStatus,
  NotificationType,
  PaymentComponentType,
  PaymentComponentStatus,
  PaymentTransactionType,
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  BookingParticipantType,
  CafeOperatingHours,
} from '../types';
import { User } from '../models/user.entity';
import { PaymentComponent } from '../models/payment-component.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import { StaffInviteToken } from '../models/staff-invite-token.entity';
import { Session } from '../models/session.entity';
import { SessionParticipant } from '../models/session-participant.entity';
import { SessionVehicle } from '../models/session-vehicle.entity';
import { Booking } from '../models/booking.entity';
import { BookingParticipant } from '../models/booking-participant.entity';
import { BookingVehicle } from '../models/booking-vehicle.entity';
import { Cafe } from '../models/cafe.entity';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { TrackType } from '../models/track-type.entity';
import { Vehicle } from '../models/vehicle.entity';
import { Inspection } from '../models/inspection.entity';
import { DamageLineItem } from '../models/damage-line-item.entity';
import { InspectionPhoto } from '../models/inspection-photo.entity';
import { InspectionChecklist } from '../models/inspection-checklist.entity';
import { ExtensionProposal } from '../models/extension-proposal.entity';
import { FnbOrder } from '../models/fnb-order.entity';
import { FnbOrderItem } from '../models/fnb-order-item.entity';
import { MenuItem } from '../models/menu-item.entity';
import { MenuItemVariant } from '../models/menu-item-variant.entity';
import { emailService } from './email.service';
import { authService } from './auth.service';
import { transition } from './booking.service';
import {
  allocatePaymentRefCode,
  buildBankTransferCheckout,
  type BankTransferCheckout,
} from './bank-transfer-checkout.service';
import { env } from '../config/env';
import { wsService } from './websocket.service';
import { createBookingReviewRequestNotification, createNotification } from './notification.service';
import { notifyCafeStaffAboutFnbPrep } from './fnb-order-notification.service';
import { createWalkInBooking as createWalkInBookingService } from './booking.service';
import { getSessionOperationalTiming } from '../lib/session-operational-timing';
import { isRangeWithinOperatingHours } from '../lib/vietnam-time';
import {
  buildBookingFinancialSummary,
  type PendingInitialPaymentSnapshot,
} from '../lib/booking-financial-summary';
import {
  RENTAL_INSPECTION_MAX_PHOTOS,
  RENTAL_INSPECTION_MIN_PHOTOS,
  hasValidRentalInspectionPhotoCount,
} from '../lib/inspection-photo-policy';
import {
  logContestVehicleCheckedOut,
  syncContestRegistrationOnVehicleCheckIn,
} from './contest-rental.service';

/**
 * All active staff assigned to a cafe need the same operational state, while
 * the payload remains deliberately minimal. Each screen refetches through its
 * existing authorised API rather than receiving inspection or payment details
 * over WebSocket.
 */
function broadcastSessionUpdated(input: {
  cafeId: string;
  bookingId: string;
  sessionId: string;
  sessionStatus: SessionStatus;
  action: string;
}): void {
  wsService.pushToCafe(input.cafeId, 'SESSION_UPDATED', {
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

async function notifyCustomerToReviewBooking(booking: Booking): Promise<void> {
  if (!booking.customerId || booking.source === BookingSource.STAFF_MANUAL) return;

  const notificationCreated = await createBookingReviewRequestNotification(
    booking.customerId,
    booking.id,
  );
  if (notificationCreated) {
    wsService.pushToUser(booking.customerId, 'BOOKING_REVIEW_REQUEST', {
      bookingId: booking.id,
      route: `/customer/bookings?reviewBookingId=${booking.id}`,
    });
  }
}

function broadcastFnbOrderUpdated(input: {
  cafeId: string;
  bookingId: string;
  sessionId?: string | null;
  orderId: string;
  status: string;
}): void {
  wsService.pushToCafe(input.cafeId, 'FNB_ORDER_UPDATED', {
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

export interface CreateStaffInput {
  cafe_id: string;
  full_name: string;
  email: string;
  phone?: string;
}

export interface StaffProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole.STAFF;
  cafeId: string;
  assignedBy: string;
  emailSent: boolean;
}

export interface StaffListItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  cafeId: string;
  cafeName: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  createdAt: string;
  activatedAt: string | null;
  inviteExpiresAt: string | null;
  lastActiveAt: string | null;
}

export interface TodayBookingItem {
  bookingId: string;
  shortCode: string;
  cafeId: string;
  cafeName: string;
  cafeAddress: string;
  cafePhone: string;
  trackName: string;
  trackType: string;
  bookingMode: 'SINGLE' | 'PACKAGE' | 'SUBSCRIPTION';
  playMode: BookingMode;
  source: BookingSource;
  contestId: string | null;
  status: BookingStatus;
  slotStart: string;
  slotEnd: string;
  slotCount: number;
  depositAmount: number;
  slotFee: number;
  rentalFee: number;
  fnbPreorderFee: number;
  fnbOnsiteFee: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: 'UNPAID' | 'PAID';
  payment_components: PaymentComponent[];
  plannedParticipants: string[];
  participantDetails: { name: string; phone?: string; isBooker: boolean }[];
  plannedVehicles: string[];
  sessions: any[];
  hasPendingRefund?: boolean;
  createdAt?: string;
}

const INVITE_TOKEN_TTL_HOURS = 48;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createStaffForProvider(
  providerId: string,
  input: CreateStaffInput,
): Promise<StaffProfile> {
  const email = input.email.toLowerCase().trim();
  logger.info('Staff', 'invite staff requested', { providerId, cafeId: input.cafe_id, email });

  const profile = await AppDataSource.transaction(async (manager) => {
    const [cafe] = await manager.query<{ id: string; provider_id: string }[]>(
      `SELECT id, provider_id
       FROM cafes
       WHERE id = $1 AND provider_id = $2 AND deleted_at IS NULL`,
      [input.cafe_id, providerId],
    );

    if (!cafe) {
      logger.warn('Staff', 'provider tried to invite staff outside owned cafe', {
        providerId,
        cafeId: input.cafe_id,
        email,
      });
      throw new AppError('Cafe không tồn tại hoặc không thuộc Provider này', 404, 'CAFE_NOT_FOUND');
    }

    const existing = await manager.getRepository(User).findOne({ where: { email } });
    if (existing) {
      logger.warn('Staff', 'staff email already exists', { providerId, cafeId: cafe.id, email });
      throw new AppError('Email đã được sử dụng', 409, 'EMAIL_ALREADY_EXISTS');
    }

    const userRepo = manager.getRepository(User);
    const staff = await userRepo.save(
      userRepo.create({
        email,
        full_name: input.full_name.trim(),
        phone: input.phone ?? null,
        password_hash: null,
        role: UserRole.STAFF,
        auth_provider: AuthProvider.LOCAL,
        is_active: false,
      }),
    );

    await manager.query(
      `INSERT INTO staff_cafe_assignments (staff_id, cafe_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [staff.id, cafe.id, providerId],
    );

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    await manager.getRepository(StaffInviteToken).save(
      manager.getRepository(StaffInviteToken).create({
        user_id: staff.id,
        token: hashToken(rawToken),
        expires_at: expiresAt,
      }),
    );

    return {
      id: staff.id,
      email: staff.email,
      fullName: staff.full_name,
      phone: staff.phone,
      role: UserRole.STAFF as const,
      cafeId: cafe.id,
      assignedBy: providerId,
      rawToken,
    };
  });

  const inviteUrl = `${env.frontendUrl}/staff-invite/activate?token=${profile.rawToken}`;
  let emailSent = false;

  try {
    await emailService.sendStaffInvite({
      to: profile.email,
      fullName: profile.fullName,
      inviteUrl,
    });
    emailSent = true;
  } catch (err) {
    logger.error('Staff', 'failed to send invite email', err);
  }

  logger.info('Staff', 'staff invited', {
    providerId,
    cafeId: profile.cafeId,
    staffId: profile.id,
    email: profile.email,
    emailSent,
  });

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    role: profile.role,
    cafeId: profile.cafeId,
    assignedBy: profile.assignedBy,
    emailSent,
  };
}

export async function listStaffForProvider(
  providerId: string,
  cafeId?: string,
): Promise<StaffListItem[]> {
  const params: unknown[] = [providerId];
  let cafeFilter = '';
  if (cafeId) {
    params.push(cafeId);
    cafeFilter = `AND c.id = $${params.length}`;
  }

  const rows = await AppDataSource.query<
    {
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      cafe_id: string;
      cafe_name: string;
      is_active: boolean;
      created_at: Date;
      activated_at: Date | null;
      has_active_token: boolean;
      invite_expires_at: Date | null;
      last_active_at: Date | null;
    }[]
  >(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.phone,
       c.id      AS cafe_id,
       c.name    AS cafe_name,
       u.is_active,
       u.created_at,
       u.updated_at AS activated_at,
       u.last_active_at,
       EXISTS(
         SELECT 1 FROM staff_invite_tokens t
         WHERE t.user_id = u.id
           AND t.used_at IS NULL
           AND t.expires_at > NOW()
       ) AS has_active_token,
       (
         SELECT t.expires_at FROM staff_invite_tokens t
         WHERE t.user_id = u.id
           AND t.used_at IS NULL
         ORDER BY t.created_at DESC
         LIMIT 1
       ) AS invite_expires_at
     FROM users u
     JOIN staff_cafe_assignments a ON a.staff_id = u.id
     JOIN cafes c ON c.id = a.cafe_id
     WHERE c.provider_id = $1
       AND u.deleted_at IS NULL
       ${cafeFilter}
     ORDER BY u.created_at DESC`,
    params,
  );

  return rows.map((row) => {
    let status: 'PENDING' | 'ACTIVE' | 'DISABLED';
    if (row.is_active) {
      status = 'ACTIVE';
    } else if (row.has_active_token) {
      status = 'PENDING';
    } else {
      status = 'DISABLED';
    }

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      cafeId: row.cafe_id,
      cafeName: row.cafe_name,
      status,
      createdAt: row.created_at.toISOString(),
      activatedAt: status === 'ACTIVE' && row.activated_at ? row.activated_at.toISOString() : null,
      inviteExpiresAt:
        status === 'PENDING' && row.invite_expires_at ? row.invite_expires_at.toISOString() : null,
      lastActiveAt: row.last_active_at ? row.last_active_at.toISOString() : null,
    };
  });
}

export async function deactivateStaff(providerId: string, staffId: string): Promise<void> {
  const staff = await getStaffOwnedByProvider(providerId, staffId);

  const hasActiveToken = await hasActiveInviteToken(staffId);

  if (!staff.is_active && !hasActiveToken) {
    throw new AppError('Nhân viên đã bị vô hiệu hóa', 409, 'STAFF_ALREADY_DISABLED');
  }

  await AppDataSource.getRepository(User).update(staffId, { is_active: false });
  logger.info('Staff', 'staff deactivated', { providerId, staffId });
}

export async function reactivateStaff(providerId: string, staffId: string): Promise<void> {
  const staff = await getStaffOwnedByProvider(providerId, staffId);

  if (staff.is_active) {
    throw new AppError('Nhân viên đang hoạt động', 409, 'STAFF_NOT_DISABLED');
  }

  const hasActiveToken = await hasActiveInviteToken(staffId);
  if (hasActiveToken) {
    throw new AppError(
      'Nhân viên chưa kích hoạt tài khoản. Dùng "Gửi lại lời mời" thay vì kích hoạt lại.',
      409,
      'STAFF_PENDING_ACTIVATION',
    );
  }

  await AppDataSource.getRepository(User).update(staffId, { is_active: true });
  logger.info('Staff', 'staff reactivated', { providerId, staffId });
}

export async function resendInvite(
  providerId: string,
  staffId: string,
): Promise<{ emailSent: boolean }> {
  const staff = await getStaffOwnedByProvider(providerId, staffId);

  if (staff.is_active) {
    throw new AppError(
      'Tài khoản đã được kích hoạt. Không thể gửi lại lời mời.',
      409,
      'STAFF_ALREADY_ACTIVE',
    );
  }

  const tokenRepo = AppDataSource.getRepository(StaffInviteToken);
  await tokenRepo.delete({ user_id: staffId });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await tokenRepo.save(
    tokenRepo.create({
      user_id: staffId,
      token: hashToken(rawToken),
      expires_at: expiresAt,
    }),
  );

  const inviteUrl = `${env.frontendUrl}/staff-invite/activate?token=${rawToken}`;
  let emailSent = false;

  try {
    await emailService.sendStaffInvite({
      to: staff.email,
      fullName: staff.full_name,
      inviteUrl,
    });
    emailSent = true;
  } catch (err) {
    logger.error('Staff', 'failed to resend invite email', err);
  }

  logger.info('Staff', 'invite resent', { providerId, staffId, emailSent });
  return { emailSent };
}

export async function validateInviteToken(
  rawToken: string,
): Promise<{ email: string; fullName: string }> {
  const tokenRepo = AppDataSource.getRepository(StaffInviteToken);
  const row = await tokenRepo.findOne({
    where: { token: hashToken(rawToken) },
  });

  if (!row || row.used_at) {
    throw new AppError(
      'Link kích hoạt không hợp lệ hoặc đã được sử dụng',
      400,
      'INVITE_TOKEN_INVALID',
    );
  }

  if (row.expires_at <= new Date()) {
    throw new AppError(
      'Link kích hoạt đã hết hạn. Vui lòng liên hệ Provider để gửi lại lời mời.',
      410,
      'INVITE_TOKEN_EXPIRED',
    );
  }

  const user = await AppDataSource.getRepository(User).findOne({ where: { id: row.user_id } });
  if (!user) {
    throw new AppError('Tài khoản không tồn tại', 404, 'USER_NOT_FOUND');
  }

  return { email: user.email, fullName: user.full_name };
}

export async function activateStaffAccount(
  rawToken: string,
  password: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; fullName: string; role: string; cafeId: string | null };
}> {
  const tokenRepo = AppDataSource.getRepository(StaffInviteToken);
  const row = await tokenRepo.findOne({ where: { token: hashToken(rawToken) } });

  if (!row || row.used_at) {
    throw new AppError(
      'Link kích hoạt không hợp lệ hoặc đã được sử dụng',
      400,
      'INVITE_TOKEN_INVALID',
    );
  }

  if (row.expires_at <= new Date()) {
    throw new AppError('Link kích hoạt đã hết hạn', 410, 'INVITE_TOKEN_EXPIRED');
  }

  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { id: row.user_id } });
  if (!user) {
    throw new AppError('Tài khoản không tồn tại', 404, 'USER_NOT_FOUND');
  }

  user.password_hash = await bcrypt.hash(password, 10);
  user.is_active = true;
  await userRepo.save(user);

  await tokenRepo.update(row.id, { used_at: new Date() });

  const tokens = await authService.issueTokenPair(user);

  const [assignment] = await AppDataSource.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [user.id],
  );

  logger.info('Staff', 'staff account activated', { staffId: user.id, email: user.email });

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      cafeId: assignment?.cafe_id ?? null,
    },
  };
}

function getVietnamCalendarDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function getTodayBookings(cafeId: string): Promise<TodayBookingItem[]> {
  return getBookingsByDate(cafeId, getVietnamCalendarDate());
}

export async function getBookingsByDate(
  cafeId: string,
  bookingDate: string,
): Promise<TodayBookingItem[]> {
  const rows = await AppDataSource.query<any[]>(
    `SELECT
       b.id,
       b.status,
       b.play_mode,
       b.source,
       b.contest_id,
       b.slot_start,
       b.slot_end,
       b.slot_count,
       b.discount_amount,
       b.created_at,
       b.notes,
       c.name AS cafe_name,
       c.address AS cafe_address,
       c.phone AS cafe_phone,
       tt.name AS track_name,
       (SELECT EXISTS (SELECT 1 FROM payment_transactions WHERE booking_id = b.id AND type = 'REFUND' AND status = 'PENDING')) AS "hasPendingRefund"
     FROM bookings b
     JOIN cafes c ON c.id = b.cafe_id
     LEFT JOIN track_types tt ON tt.id = b.track_type_id
     WHERE b.cafe_id = $1
       AND (b.slot_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
       AND b.status IN ('PENDING', 'CONFIRMED', 'NO_SHOW', 'AWAITING_PAYMENT', 'COMPLETED', 'CANCELLED')
     ORDER BY b.slot_start ASC`,
    [cafeId, bookingDate],
  );

  const bookingsList: TodayBookingItem[] = [];

  for (const row of rows) {
    // 1. Fetch planned participants
    const bpList = await AppDataSource.getRepository(BookingParticipant).find({
      where: { bookingId: row.id },
    });
    const plannedParticipants = [];
    const participantDetails: { name: string; phone?: string; isBooker: boolean }[] = [];
    for (const bp of bpList) {
      let name: string;
      let phone: string | undefined;
      if (bp.userId) {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id: bp.userId } });
        name = user?.full_name || bp.guestName || 'Người chơi';
        phone = user?.phone || bp.guestPhone || undefined;
      } else {
        name = bp.guestName || 'Người chơi';
        phone = bp.guestPhone || undefined;
      }
      plannedParticipants.push(name);
      participantDetails.push({
        name,
        phone,
        isBooker: bp.participantType === BookingParticipantType.BOOKER,
      });
    }

    // 2. Fetch planned vehicles
    const bvList = await AppDataSource.getRepository(BookingVehicle).find({
      where: { bookingId: row.id },
    });
    const plannedVehicles = [];
    for (const bv of bvList) {
      const vehicle = await AppDataSource.getRepository(Vehicle).findOne({
        where: { id: bv.vehicleId },
        relations: ['catalog'],
      });
      plannedVehicles.push(vehicle?.catalog?.name || vehicle?.identifier || 'Xe thuê');
    }

    // 3. Fetch sessions
    const sessionsInDb = await AppDataSource.getRepository(Session).find({
      where: { bookingId: row.id },
    });
    const sessionsList = [];
    for (const s of sessionsInDb) {
      const sDetail = await getSessionDetail(s.id);
      sessionsList.push(sDetail);
    }

    // 4. Load real payment components and compute fees
    const comps = await AppDataSource.getRepository(PaymentComponent).find({
      where: { bookingId: row.id },
    });

    const depositComp = comps.find((c) => c.type === PaymentComponentType.SECURITY_DEPOSIT);
    const slotComp = comps.find((c) => c.type === PaymentComponentType.SLOT_FEE);
    const rentalComps = comps.filter((c) => c.type === PaymentComponentType.RENTAL_FEE);

    const depositAmount = depositComp ? Number(depositComp.amount) : 0;
    const slotFee = slotComp ? Number(slotComp.amount) : 120000;
    const rentalFee =
      rentalComps.length > 0
        ? rentalComps.reduce((sum, c) => sum + Number(c.amount), 0)
        : bvList.length * 100000;
    const fnbOrders = await AppDataSource.getRepository(FnbOrder).find({
      where: { bookingId: row.id },
    });
    const fnbPreorderFee = fnbOrders
      .filter(
        (o) => o.orderType === FnbOrderType.PRE_ORDER && o.status !== FnbOrderStatus.CANCELLED,
      )
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const fnbOnsiteFee = fnbOrders
      .filter((o) => o.orderType === FnbOrderType.ON_SITE && o.status !== FnbOrderStatus.CANCELLED)
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalAmount = slotFee + rentalFee + fnbPreorderFee;

    bookingsList.push({
      bookingId: row.id,
      shortCode: `RCF-${row.id.substring(0, 4).toUpperCase()}`,
      cafeId: cafeId,
      cafeName: row.cafe_name,
      cafeAddress: row.cafe_address,
      cafePhone: row.cafe_phone,
      trackName: row.track_name || 'Đường đua Super Drift A',
      trackType: row.play_mode === 'BYOC' ? 'DRIFT_ASPHALT' : 'DRIFT_CARPET',
      bookingMode: 'SINGLE',
      playMode: row.play_mode,
      source: row.source,
      contestId: row.contest_id ?? null,
      status: row.status,
      slotStart: row.slot_start.toISOString(),
      slotEnd: row.slot_end.toISOString(),
      slotCount: Number(row.slot_count),
      depositAmount,
      slotFee,
      rentalFee,
      fnbPreorderFee,
      fnbOnsiteFee,
      discountAmount: Number(row.discount_amount) || 0,
      totalAmount,
      paymentStatus:
        row.status === 'PENDING' ||
        comps.some(
          (c) =>
            c.status === PaymentComponentStatus.PENDING ||
            c.status === PaymentComponentStatus.PENDING_REFUND,
        )
          ? 'UNPAID'
          : 'PAID',
      payment_components: comps,
      plannedParticipants,
      participantDetails,
      plannedVehicles,
      sessions: sessionsList,
      hasPendingRefund: row.hasPendingRefund,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    });
  }

  return bookingsList;
}

export interface FnbOrderItemDetail {
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
}

export interface TodayFnbOrderItem {
  id: string;
  bookingId: string;
  orderType: FnbOrderType;
  status: string;
  totalAmount: number;
  createdAt: string;
  slotStart: string;
  customerName: string;
  items: FnbOrderItemDetail[];
}

export async function getTodayFnbOrders(cafeId: string): Promise<TodayFnbOrderItem[]> {
  const rows = await AppDataSource.query<
    {
      id: string;
      booking_id: string;
      order_type: FnbOrderType;
      status: string;
      total_amount: string;
      created_at: Date;
      slot_start: Date;
      customer_name: string;
      items: FnbOrderItemDetail[] | null;
    }[]
  >(
    `SELECT
       fo.id,
       fo.booking_id,
       fo.status,
       fo.order_type,
       fo.total_amount,
       fo.created_at,
       b.slot_start,
       COALESCE(u.full_name, 'Khách tại quầy') AS customer_name,
       json_agg(
         json_build_object(
           'name',      COALESCE(mi.name, foi.item_name_snapshot, 'Món ăn'),
           'variantName', foi.variant_name_snapshot,
           'quantity',  foi.quantity,
           'unitPrice', foi.unit_price,
           'subtotal',  foi.subtotal,
           'notes',     foi.notes
         ) ORDER BY foi.created_at
       ) FILTER (WHERE foi.id IS NOT NULL) AS items
     FROM fnb_orders fo
     JOIN bookings b ON b.id = fo.booking_id
     LEFT JOIN users u ON u.id = b.customer_id
     LEFT JOIN fnb_order_items foi ON foi.fnb_order_id = fo.id
     LEFT JOIN menu_items mi       ON mi.id = foi.menu_item_id
     WHERE b.cafe_id = $1
       AND fo.status != 'CANCELLED'
       AND (
         (fo.order_type = 'PRE_ORDER'
           AND b.status IN ('CONFIRMED', 'COMPLETED')
           AND (b.slot_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
         OR
         (fo.order_type = 'ON_SITE'
           AND (fo.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
       )
     GROUP BY fo.id, b.slot_start, u.full_name
     ORDER BY
       CASE WHEN fo.order_type = 'ON_SITE' THEN 0 ELSE 1 END,
       CASE WHEN fo.order_type = 'ON_SITE' THEN fo.created_at END DESC,
       CASE WHEN fo.order_type = 'PRE_ORDER' THEN b.slot_start END ASC`,
    [cafeId],
  );

  return rows.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    orderType: row.order_type,
    status: row.status,
    totalAmount: Number(row.total_amount),
    createdAt: row.created_at.toISOString(),
    slotStart: row.slot_start.toISOString(),
    customerName: row.customer_name,
    items: row.items ?? [],
  }));
}

export async function updateFnbOrderStatus(
  orderId: string,
  cafeId: string,
  newStatus: string,
  staffUserId: string,
): Promise<void> {
  const [order] = await AppDataSource.query<
    {
      id: string;
      status: string;
      booking_id: string;
      session_id: string | null;
      order_type: FnbOrderType;
      total_amount: string;
    }[]
  >(
    `SELECT fo.id, fo.status, fo.booking_id, fo.session_id, fo.order_type, fo.total_amount
     FROM fnb_orders fo
     JOIN bookings b ON b.id = fo.booking_id
     WHERE fo.id = $1 AND b.cafe_id = $2`,
    [orderId, cafeId],
  );

  if (!order) {
    throw new AppError('Đơn F&B không tồn tại', 404, 'FNB_ORDER_NOT_FOUND');
  }

  const allowed: Record<string, string[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['DELIVERED'],
  };

  if (!allowed[order.status]?.includes(newStatus)) {
    throw new AppError(
      `Không thể chuyển trạng thái từ ${order.status} sang ${newStatus}`,
      409,
      'FNB_ORDER_INVALID_TRANSITION',
    );
  }

  await AppDataSource.query(
    `UPDATE fnb_orders
        SET status = $1::fnb_order_status_enum,
            confirmed_by = CASE
              WHEN $1::fnb_order_status_enum = 'CONFIRMED'::fnb_order_status_enum THEN $2::uuid
              ELSE confirmed_by
            END,
            confirmed_at = CASE
              WHEN $1::fnb_order_status_enum = 'CONFIRMED'::fnb_order_status_enum THEN NOW()
              ELSE confirmed_at
            END
      WHERE id = $3`,
    [newStatus, staffUserId, orderId],
  );

  if (newStatus === FnbOrderStatus.CANCELLED && order.session_id) {
    const session = await AppDataSource.getRepository(Session).findOne({
      where: { id: order.session_id },
    });
    if (session) {
      session.actualTotalAmount = Math.max(
        0,
        Number(session.actualTotalAmount) - Number(order.total_amount),
      );
      await AppDataSource.getRepository(Session).save(session);
    }
  }

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: order.booking_id },
  });

  if (order.order_type === FnbOrderType.ON_SITE) {
    await syncOnsiteFnbFeeComponent(order.booking_id);
    if (booking?.customerId) {
      wsService.pushToUser(booking.customerId, 'SESSION_FNB_ORDER_UPDATED', {
        bookingId: booking.id,
        sessionId: order.session_id ?? undefined,
        orderId,
        status: newStatus,
      });
    }
  }

  if (newStatus === FnbOrderStatus.DELIVERED && booking?.customerId) {
    try {
      const orderSource = order.order_type === FnbOrderType.ON_SITE ? 'gọi tại quầy' : 'đặt trước';
      const message = `Đơn đồ ăn & thức uống ${orderSource} của bạn đã được phục vụ.`;
      const data = { bookingId: booking.id, orderId, route: `/booking/${booking.id}` };
      await createNotification(
        booking.customerId,
        NotificationType.FNB_ORDER_SERVED,
        'Món của bạn đã sẵn sàng',
        message,
        data,
      );
      wsService.pushToUser(booking.customerId, 'FNB_ORDER_SERVED', data);
    } catch (error) {
      logger.error(
        'FnbOrderNotification',
        'Failed to notify customer about served F&B order',
        error,
      );
    }
  }

  broadcastFnbOrderUpdated({
    cafeId,
    bookingId: order.booking_id,
    sessionId: order.session_id,
    orderId,
    status: newStatus,
  });

  logger.info('Staff', 'fnb order status updated', { orderId, cafeId, newStatus });
}

export async function transferStaff(
  providerId: string,
  staffId: string,
  newCafeId: string,
): Promise<void> {
  await getStaffOwnedByProvider(providerId, staffId);

  const [newCafe] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM cafes WHERE id = $1 AND provider_id = $2 AND deleted_at IS NULL`,
    [newCafeId, providerId],
  );

  if (!newCafe) {
    throw new AppError(
      'Chi nhánh không tồn tại hoặc không thuộc Provider này',
      404,
      'CAFE_NOT_FOUND',
    );
  }

  const [current] = await AppDataSource.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [staffId],
  );

  if (current?.cafe_id === newCafeId) {
    throw new AppError('Nhân viên đã thuộc chi nhánh này', 409, 'STAFF_ALREADY_IN_CAFE');
  }

  await AppDataSource.query(`UPDATE staff_cafe_assignments SET cafe_id = $1 WHERE staff_id = $2`, [
    newCafeId,
    staffId,
  ]);

  logger.info('Staff', 'staff transferred', { providerId, staffId, newCafeId });
}

export interface StaffDetailProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cafeName: string;
  cafeId: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  createdAt: string;
  activatedAt: string | null;
  lastActiveAt: string | null;
}

export interface StaffKpiSummary {
  staffId: string;
  period: '7d' | '30d' | '90d';
  totalCheckIns: number;
  totalFnbOrdersHandled: number;
  totalExtensionsApproved: number;
  onTimeCheckInRate: number | null;
  activeDaysCount: number;
}

export interface StaffActivityEvent {
  id: string;
  type: 'CHECK_IN' | 'CHECK_OUT' | 'FNB_ORDER' | 'EXTENSION_APPROVED';
  eventTime: string;
  label: string;
  bookingId: string;
  bookingSource: 'APP' | 'STAFF_MANUAL';
}

export interface StaffActivityPage {
  events: StaffActivityEvent[];
  total: number;
  hasMore: boolean;
}

export async function getStaffDetail(
  providerId: string,
  staffId: string,
): Promise<StaffDetailProfile> {
  const [row] = await AppDataSource.query<
    {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      cafe_id: string;
      cafe_name: string;
      is_active: boolean;
      created_at: Date;
      activated_at: Date | null;
      invite_expires_at: Date | null;
      has_active_token: boolean;
      last_active_at: Date | null;
    }[]
  >(
    `SELECT
       u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, u.last_active_at,
       u.updated_at AS activated_at,
       c.id AS cafe_id, c.name AS cafe_name,
       EXISTS(
         SELECT 1 FROM staff_invite_tokens t
         WHERE t.user_id = u.id AND t.used_at IS NULL AND t.expires_at > NOW()
       ) AS has_active_token,
       (
         SELECT t.expires_at FROM staff_invite_tokens t
         WHERE t.user_id = u.id AND t.used_at IS NULL
         ORDER BY t.created_at DESC LIMIT 1
       ) AS invite_expires_at
     FROM users u
     JOIN staff_cafe_assignments a ON a.staff_id = u.id
     JOIN cafes c ON c.id = a.cafe_id
     WHERE u.id = $1 AND c.provider_id = $2 AND u.deleted_at IS NULL`,
    [staffId, providerId],
  );

  if (!row) {
    throw new AppError(
      'Nhân viên không tồn tại hoặc không thuộc Provider này',
      404,
      'STAFF_NOT_FOUND',
    );
  }

  let status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  if (row.is_active) {
    status = 'ACTIVE';
  } else if (row.has_active_token) {
    status = 'PENDING';
  } else {
    status = 'DISABLED';
  }

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    cafeName: row.cafe_name,
    cafeId: row.cafe_id,
    status,
    createdAt: row.created_at.toISOString(),
    activatedAt: status === 'ACTIVE' && row.activated_at ? row.activated_at.toISOString() : null,
    lastActiveAt: row.last_active_at ? row.last_active_at.toISOString() : null,
  };
}

export async function getStaffKpi(
  providerId: string,
  staffId: string,
  period: '7d' | '30d' | '90d',
): Promise<StaffKpiSummary> {
  await getStaffOwnedByProvider(providerId, staffId);

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  const [checkInsRow, fnbRow, extensionsRow, onTimeRow, activeDaysRow] = await Promise.all([
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(*)::int AS count FROM sessions
       WHERE checked_in_by = $1 AND created_at >= NOW() - INTERVAL '${days} days'`,
      [staffId],
    ),
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(*)::int AS count FROM fnb_orders
       WHERE created_by = $1 AND status = 'DELIVERED'
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [staffId],
    ),
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(*)::int AS count FROM extension_proposals
       WHERE proposed_by = $1 AND status = 'APPROVED'
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [staffId],
    ),
    AppDataSource.query<[{ rate: string | null }]>(
      `SELECT
         COUNT(*) FILTER (
           WHERE s.created_at BETWEEN b.slot_start - INTERVAL '15 minutes'
                                  AND b.slot_start + INTERVAL '15 minutes'
         )::float / NULLIF(COUNT(*), 0) * 100 AS rate
       FROM sessions s
       JOIN bookings b ON b.id = s.booking_id
       WHERE s.checked_in_by = $1
       AND s.created_at >= NOW() - INTERVAL '${days} days'`,
      [staffId],
    ),
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(DISTINCT DATE(event_time))::int AS count FROM (
         SELECT created_at AS event_time FROM sessions WHERE checked_in_by = $1
           AND created_at >= NOW() - INTERVAL '${days} days'
         UNION ALL
         SELECT created_at FROM fnb_orders WHERE created_by = $1
           AND created_at >= NOW() - INTERVAL '${days} days'
         UNION ALL
         SELECT created_at FROM extension_proposals WHERE proposed_by = $1
           AND created_at >= NOW() - INTERVAL '${days} days'
       ) sub`,
      [staffId],
    ),
  ]);

  const rate = onTimeRow[0]?.rate;

  return {
    staffId,
    period,
    totalCheckIns: Number(checkInsRow[0]?.count ?? 0),
    totalFnbOrdersHandled: Number(fnbRow[0]?.count ?? 0),
    totalExtensionsApproved: Number(extensionsRow[0]?.count ?? 0),
    onTimeCheckInRate: rate != null ? Math.round(Number(rate) * 10) / 10 : null,
    activeDaysCount: Number(activeDaysRow[0]?.count ?? 0),
  };
}

export async function getStaffActivity(
  providerId: string,
  staffId: string,
  limit: number,
  offset: number,
): Promise<StaffActivityPage> {
  await getStaffOwnedByProvider(providerId, staffId);

  const [events, totalRow] = await Promise.all([
    AppDataSource.query<
      {
        id: string;
        type: string;
        event_time: Date;
        label: string;
        booking_id: string;
        booking_source: string;
      }[]
    >(
      `SELECT type, ref_id AS id, event_time, label, booking_id, booking_source FROM (
         SELECT 'CHECK_IN' AS type, s.id AS ref_id, s.created_at AS event_time,
                'Check-in' AS label,
                s.booking_id,
                b.source AS booking_source
         FROM sessions s JOIN bookings b ON b.id = s.booking_id
         WHERE s.checked_in_by = $1
         UNION ALL
         SELECT 'FNB_ORDER', fo.id, fo.created_at,
                'Order #' || UPPER(SUBSTRING(fo.id::text, 1, 4)),
                fo.booking_id,
                b.source
         FROM fnb_orders fo JOIN bookings b ON b.id = fo.booking_id
         WHERE fo.created_by = $1
         UNION ALL
         SELECT 'EXTENSION_APPROVED', ep.id, ep.created_at,
                'Gia hạn +' || ep.duration_minutes || ' phút',
                s.booking_id,
                b.source
         FROM extension_proposals ep
         JOIN sessions s ON s.id = ep.session_id
         JOIN bookings b ON b.id = s.booking_id
         WHERE ep.proposed_by = $1 AND ep.status = 'APPROVED'
         UNION ALL
         SELECT 'CHECK_OUT', s.id, s.actual_end_at,
                'Check-out',
                s.booking_id,
                b.source
         FROM sessions s JOIN bookings b ON b.id = s.booking_id
         WHERE s.checked_out_by = $1 AND s.actual_end_at IS NOT NULL
       ) events
       ORDER BY event_time DESC
       LIMIT $2 OFFSET $3`,
      [staffId, limit, offset],
    ),
    AppDataSource.query<[{ count: string }]>(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT id FROM sessions WHERE checked_in_by = $1
         UNION ALL
         SELECT id FROM fnb_orders WHERE created_by = $1
         UNION ALL
         SELECT id FROM extension_proposals WHERE proposed_by = $1 AND status = 'APPROVED'
         UNION ALL
         SELECT id FROM sessions WHERE checked_out_by = $1 AND actual_end_at IS NOT NULL
       ) sub`,
      [staffId],
    ),
  ]);

  const total = Number(totalRow[0]?.count ?? 0);

  return {
    events: events.map((e) => ({
      id: e.id,
      type: e.type as StaffActivityEvent['type'],
      eventTime: e.event_time.toISOString(),
      label: e.label,
      bookingId: e.booking_id,
      bookingSource: e.booking_source as StaffActivityEvent['bookingSource'],
    })),
    total,
    hasMore: offset + events.length < total,
  };
}

async function getStaffOwnedByProvider(providerId: string, staffId: string): Promise<User> {
  const [row] = await AppDataSource.query<{ id: string }[]>(
    `SELECT u.id
     FROM users u
     JOIN staff_cafe_assignments a ON a.staff_id = u.id
     JOIN cafes c ON c.id = a.cafe_id
     WHERE u.id = $1 AND c.provider_id = $2 AND u.deleted_at IS NULL`,
    [staffId, providerId],
  );

  if (!row) {
    throw new AppError(
      'Nhân viên không tồn tại hoặc không thuộc Provider này',
      404,
      'STAFF_NOT_FOUND',
    );
  }

  const user = await AppDataSource.getRepository(User).findOneOrFail({ where: { id: staffId } });
  return user;
}

export async function getStaffForImpersonation(
  providerId: string,
  staffId: string,
): Promise<{ id: string; email: string; fullName: string; cafeName: string; cafeId: string }> {
  const [row] = await AppDataSource.query<
    {
      id: string;
      email: string;
      full_name: string;
      cafe_id: string;
      cafe_name: string;
      is_active: boolean;
    }[]
  >(
    `SELECT u.id, u.email, u.full_name, c.id AS cafe_id, c.name AS cafe_name, u.is_active
     FROM users u
     JOIN staff_cafe_assignments a ON a.staff_id = u.id
     JOIN cafes c ON c.id = a.cafe_id
     WHERE u.id = $1 AND c.provider_id = $2 AND u.deleted_at IS NULL`,
    [staffId, providerId],
  );

  if (!row) {
    throw new AppError(
      'Nhân viên không tồn tại hoặc không thuộc Provider này',
      404,
      'STAFF_NOT_FOUND',
    );
  }

  if (!row.is_active) {
    throw new AppError(
      'Chỉ có thể xem phiên của nhân viên đang hoạt động',
      400,
      'STAFF_NOT_ACTIVE',
    );
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    cafeName: row.cafe_name,
    cafeId: row.cafe_id,
  };
}

async function hasActiveInviteToken(staffId: string): Promise<boolean> {
  const [result] = await AppDataSource.query<{ exists: boolean }[]>(
    `SELECT EXISTS(
       SELECT 1 FROM staff_invite_tokens
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
     ) AS exists`,
    [staffId],
  );
  return result.exists;
}

export async function startCheckIn(bookingId: string, staffUserId: string): Promise<any> {
  const booking = await AppDataSource.getRepository(Booking).findOne({ where: { id: bookingId } });
  if (!booking) {
    throw new AppError('Đơn đặt lịch không tồn tại', 404, 'BOOKING_NOT_FOUND');
  }
  if (booking.status !== 'CONFIRMED') {
    throw new AppError(
      'Chỉ có thể Check-In đơn đặt lịch có trạng thái CONFIRMED',
      400,
      'INVALID_BOOKING_STATUS',
    );
  }

  const existing = await AppDataSource.getRepository(Session).findOne({ where: { bookingId } });
  // A session that has already become active is safe to reopen. CHECKED_IN only
  // means the handover is pending, so it must still obey the check-in deadline.
  if (existing && existing.status !== SessionStatus.CHECKED_IN) {
    return existing;
  }

  const isWalkIn = booking.source === BookingSource.STAFF_MANUAL;
  const isSlotActive = booking.slotEnd.getTime() > Date.now();
  const isRecentlyCreated = booking.createdAt.getTime() + 30 * 60 * 1000 > Date.now();

  if (!isWalkIn && booking.slotStart.getTime() + 30 * 60 * 1000 < Date.now()) {
    throw new AppError(
      'Đơn đã quá thời hạn check-in 30 phút kể từ giờ bắt đầu',
      400,
      'CHECK_IN_WINDOW_EXPIRED',
    );
  }

  if (isWalkIn && !isSlotActive && !isRecentlyCreated) {
    throw new AppError('Khung giờ của đơn vãng lai đã kết thúc', 400, 'CHECK_IN_WINDOW_EXPIRED');
  }

  if (existing) {
    return existing;
  }

  const isByoc = booking.playMode === 'BYOC';
  const session = new Session();
  session.bookingId = bookingId;
  session.cafeId = booking.cafeId;
  session.status = SessionStatus.CHECKED_IN;
  session.checkedInBy = staffUserId;
  session.actualStartAt = new Date();
  session.plannedEndAt = booking.slotEnd;
  session.actualTotalAmount = 0;
  await AppDataSource.getRepository(Session).save(session);

  // Mark initial prepaid components as DISBURSED if they are still PENDING
  const compRepo = AppDataSource.getRepository(PaymentComponent);
  const pendingPrepaidComps = await compRepo.find({
    where: {
      bookingId,
      status: PaymentComponentStatus.PENDING,
      type: In([
        PaymentComponentType.SLOT_FEE,
        PaymentComponentType.RENTAL_FEE,
        PaymentComponentType.FB_PREORDER,
        PaymentComponentType.CONTEST_ENTRY_FEE,
      ]),
    },
  });
  if (pendingPrepaidComps.length > 0) {
    for (const comp of pendingPrepaidComps) {
      comp.status = PaymentComponentStatus.DISBURSED;
      await compRepo.save(comp);
    }
  }

  const bookingParticipants = await AppDataSource.getRepository(BookingParticipant).find({
    where: { bookingId },
  });

  for (const bp of bookingParticipants) {
    const sp = new SessionParticipant();
    sp.sessionId = session.id;
    sp.bookingParticipantId = bp.id;
    sp.userId = bp.userId;
    if (bp.userId) {
      const user = await AppDataSource.getRepository(User).findOne({ where: { id: bp.userId } });
      sp.displayName = user?.full_name || bp.guestName || 'Khách chơi';
      sp.phone = user?.phone || bp.guestPhone;
    } else {
      sp.displayName = bp.guestName || 'Khách chơi';
      sp.phone = bp.guestPhone;
    }
    sp.role = ParticipantRole.DRIVER;
    sp.isPrimaryResponsible = bp.isPrimaryResponsible;
    sp.checkedInAt = new Date();
    await AppDataSource.getRepository(SessionParticipant).save(sp);
  }

  const bookingVehicles = await AppDataSource.getRepository(BookingVehicle).find({
    where: { bookingId },
  });

  if (bookingVehicles.length > 0) {
    for (const bv of bookingVehicles) {
      const sv = new SessionVehicle();
      sv.sessionId = session.id;
      sv.bookingVehicleId = bv.id;
      sv.vehicleSource = VehicleSource.RENTAL;
      sv.vehicleId = bv.vehicleId;
      sv.status = SessionVehicleStatus.ASSIGNED;
      await AppDataSource.getRepository(SessionVehicle).save(sv);
    }
  } else if (isByoc) {
    // One BYOC vehicle slot per participant — link via assigned_to_participant_id for labeling
    const sessionParticipants = await AppDataSource.getRepository(SessionParticipant).find({
      where: { sessionId: session.id },
    });
    const slots = sessionParticipants.length > 0 ? sessionParticipants : [null];
    for (const sp of slots) {
      const sv = new SessionVehicle();
      sv.sessionId = session.id;
      sv.vehicleSource = VehicleSource.BYOC;
      sv.status = SessionVehicleStatus.IN_USE;
      if (sp) sv.assignedToParticipantId = sp.id;
      await AppDataSource.getRepository(SessionVehicle).save(sv);
    }
  }

  // Mirror contest registration check-in for contest rental bookings. The sync
  // never blocks the vehicle check-in — failures are logged only.
  if (booking.contestId) {
    try {
      const contestCheckin = await syncContestRegistrationOnVehicleCheckIn(booking, {
        staffUserId,
      });
      (session as any).contest_checkin = contestCheckin;
    } catch (error) {
      logger.warn('Staff', 'startCheckIn: contest registration sync failed', {
        bookingId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  broadcastSessionUpdated({
    cafeId: booking.cafeId,
    bookingId: booking.id,
    sessionId: session.id,
    sessionStatus: session.status,
    action: 'CHECK_IN_STARTED',
  });

  if (booking.customerId) {
    wsService.pushToUser(booking.customerId, 'BOOKING_CHECKED_IN', {
      bookingId: booking.id,
      sessionId: session.id,
      sessionStatus: session.status,
      action: 'CHECK_IN_STARTED',
    });
    wsService.pushToUser(booking.customerId, 'SESSION_UPDATED', {
      bookingId: booking.id,
      sessionId: session.id,
      sessionStatus: session.status,
      action: 'CHECK_IN_STARTED',
    });
  }

  return session;
}

export async function getSessionDetail(sessionId: string): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const staffUser = await AppDataSource.getRepository(User).findOne({
    where: { id: session.checkedInBy },
  });

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (!booking) {
    throw new AppError('Không tìm thấy đơn đặt lịch gốc của phiên này', 404, 'BOOKING_NOT_FOUND');
  }
  const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: booking.cafeId } });
  if (!cafe) {
    throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  }
  const trackType = await AppDataSource.getRepository(TrackType).findOne({
    where: { id: booking.trackTypeId },
  });

  // Chỉ cần biết CÓ mật khẩu hay không, không lấy chuỗi băm ra khỏi cơ sở dữ
  // liệu — thứ đó không có lý do gì để đi qua tầng API.
  const [chuDon] = await AppDataSource.query<{ co_mat_khau: boolean }[]>(
    `SELECT (password_hash IS NOT NULL) AS co_mat_khau FROM users WHERE id = $1`,
    [booking.customerId],
  );
  const customerHasPassword = Boolean(chuDon?.co_mat_khau);

  const participants = await AppDataSource.getRepository(SessionParticipant).find({
    where: { sessionId },
  });
  const participantUserIds = participants
    .map((participant) => participant.userId)
    .filter((userId): userId is string => Boolean(userId));
  const participantUsers = participantUserIds.length
    ? await AppDataSource.getRepository(User).findByIds(participantUserIds)
    : [];
  const participantUserById = new Map(participantUsers.map((user) => [user.id, user]));
  // A session keeps a display-name snapshot for walk-in guests, but registered
  // customers must always be shown by their current profile name. Otherwise a
  // name change after check-in is never reflected in staff/customer history.
  const getParticipantName = (participant: SessionParticipant) =>
    (participant.userId
      ? participantUserById.get(participant.userId)?.full_name?.trim()
      : undefined) ||
    participant.displayName ||
    'Người chơi';

  const sessionVehicles = await AppDataSource.getRepository(SessionVehicle).find({
    where: { sessionId },
  });
  const vehiclesList = [];
  for (const sv of sessionVehicles) {
    let name = 'Xe tự mang (BYOC)';
    let imageUrl = undefined;
    if (sv.vehicleSource === VehicleSource.RENTAL && sv.vehicleId) {
      const vehicle = await AppDataSource.getRepository(Vehicle).findOne({
        where: { id: sv.vehicleId },
        relations: ['catalog'],
      });
      if (vehicle) {
        name = vehicle.catalog?.name || vehicle.identifier || 'Xe thuê';
        imageUrl = vehicle.distinctiveImageUrl || vehicle.catalog?.coverImageUrl || undefined;
      }
    } else if (sv.vehicleSource === VehicleSource.BYOC && sv.assignedToParticipantId) {
      const sp = participants.find((p) => p.id === sv.assignedToParticipantId);
      if (sp) name = `Xe của ${getParticipantName(sp)} (BYOC)`;
    }
    vehiclesList.push({
      vehicleId: sv.vehicleId || sv.id,
      name,
      type: sv.vehicleSource === VehicleSource.RENTAL ? 'RENT' : 'BYOC',
      imageUrl,
    });
  }

  const rawInspections = await AppDataSource.getRepository(Inspection).find({
    where: { sessionId },
    order: { createdAt: 'DESC' },
  });
  const latestInspectionByType = new Map<InspectionType, Inspection>();
  for (const inspection of rawInspections) {
    if (!latestInspectionByType.has(inspection.type)) {
      latestInspectionByType.set(inspection.type, inspection);
    }
  }
  const inspections = [
    latestInspectionByType.get(InspectionType.CHECK_IN),
    latestInspectionByType.get(InspectionType.CHECK_OUT),
  ].filter((inspection): inspection is Inspection => Boolean(inspection));
  const mappedInspections = [];
  let damageClaim = undefined;

  let checkoutInspection: any = undefined;

  for (const insp of inspections) {
    const photos = await AppDataSource.getRepository(InspectionPhoto).find({
      where: { inspectionId: insp.id },
    });
    const checklist = await AppDataSource.getRepository(InspectionChecklist).find({
      where: { inspectionId: insp.id },
    });

    let damageLineItemsMapped: any[] = [];
    let totalDamageCharge = 0;
    if (insp.type === InspectionType.CHECK_OUT) {
      const lineItems = await AppDataSource.getRepository(DamageLineItem).find({
        where: { inspectionId: insp.id },
      });
      damageLineItemsMapped = lineItems.map((li) => ({
        id: li.id,
        partType: li.partType,
        customPartName: li.customPartName,
        partsPrice: Number(li.partsPrice),
        laborPrice: Number(li.laborPrice),
        lineTotal: Number(li.partsPrice) + Number(li.laborPrice),
      }));
      if (lineItems.length > 0) {
        totalDamageCharge = lineItems.reduce(
          (sum, li) => sum + Number(li.partsPrice) + Number(li.laborPrice),
          0,
        );
      }
    }

    let mappedChecklist = checklist.map((c) => ({
      itemKey: c.itemKey,
      itemLabel: c.itemLabel,
      status: c.status,
      note: c.note,
      id: c.itemKey,
      label: c.itemLabel,
      checked: c.status === InspectionItemStatus.OK,
      notes: c.note ?? '',
    }));

    if (mappedChecklist.length === 0) {
      const damageTypes = new Set(damageLineItemsMapped.map((d) => d.partType));
      mappedChecklist = [
        {
          itemKey: 'ck-chassis',
          itemLabel: 'Khung gầm xe (nứt, gãy, cong vênh, biến dạng)',
          status: damageTypes.has(DamagePartType.CHASSIS)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.CHASSIS) ? 'Phát hiện hư hại' : null,
          id: 'ck-chassis',
          label: 'Khung gầm xe (nứt, gãy, cong vênh, biến dạng)',
          checked: !damageTypes.has(DamagePartType.CHASSIS),
          notes: damageTypes.has(DamagePartType.CHASSIS) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-shell',
          itemLabel: 'Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)',
          status: damageTypes.has(DamagePartType.SHELL)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.SHELL) ? 'Phát hiện hư hại' : null,
          id: 'ck-shell',
          label: 'Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)',
          checked: !damageTypes.has(DamagePartType.SHELL),
          notes: damageTypes.has(DamagePartType.SHELL) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-spoiler',
          itemLabel: 'Cánh gió (gãy, biến dạng, rơi rụng)',
          status: damageTypes.has(DamagePartType.SPOILER)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.SPOILER) ? 'Phát hiện hư hại' : null,
          id: 'ck-spoiler',
          label: 'Cánh gió (gãy, biến dạng, rơi rụng)',
          checked: !damageTypes.has(DamagePartType.SPOILER),
          notes: damageTypes.has(DamagePartType.SPOILER) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-tire',
          itemLabel: 'Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)',
          status: damageTypes.has(DamagePartType.TIRE_WHEEL)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.TIRE_WHEEL) ? 'Phát hiện hư hại' : null,
          id: 'ck-tire',
          label: 'Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)',
          checked: !damageTypes.has(DamagePartType.TIRE_WHEEL),
          notes: damageTypes.has(DamagePartType.TIRE_WHEEL) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-motor',
          itemLabel: 'Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)',
          status: damageTypes.has(DamagePartType.MOTOR)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.MOTOR) ? 'Phát hiện hư hại' : null,
          id: 'ck-motor',
          label: 'Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)',
          checked: !damageTypes.has(DamagePartType.MOTOR),
          notes: damageTypes.has(DamagePartType.MOTOR) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-servo',
          itemLabel: 'Hệ thống lái / Servo (kẹt góc, trượt bánh răng)',
          status: damageTypes.has(DamagePartType.SERVO)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.SERVO) ? 'Phát hiện hư hại' : null,
          id: 'ck-servo',
          label: 'Hệ thống lái / Servo (kẹt góc, trượt bánh răng)',
          checked: !damageTypes.has(DamagePartType.SERVO),
          notes: damageTypes.has(DamagePartType.SERVO) ? 'Phát hiện hư hại' : '',
        },
        {
          itemKey: 'ck-remote',
          itemLabel: 'Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)',
          status: damageTypes.has(DamagePartType.REMOTE)
            ? InspectionItemStatus.BROKEN
            : InspectionItemStatus.OK,
          note: damageTypes.has(DamagePartType.REMOTE) ? 'Phát hiện hư hại' : null,
          id: 'ck-remote',
          label: 'Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)',
          checked: !damageTypes.has(DamagePartType.REMOTE),
          notes: damageTypes.has(DamagePartType.REMOTE) ? 'Phát hiện hư hại' : '',
        },
      ];
    }

    const mappedInsp = {
      inspectionId: insp.id,
      type: insp.type,
      photos: photos.map((p) => ({
        url: p.url,
        angle: p.angle,
        direction: p.angle,
        notes: p.metadata?.notes ?? '',
      })),
      checklist: mappedChecklist,
      staffNotes: insp.damageDescription || '',
      customerConfirmed: insp.customerConfirmed,
      customerConfirmedAt: insp.customerConfirmedAt?.toISOString(),
      damageFlagged: insp.damageNoted,
      damageLineItems: damageLineItemsMapped,
      totalDamageCharge,
    };
    mappedInspections.push(mappedInsp);

    if (insp.type === InspectionType.CHECK_OUT) {
      checkoutInspection = mappedInsp;

      if (insp.damageNoted) {
        const checkInPhoto = inspections.find((i) => i.type === InspectionType.CHECK_IN)?.id;
        const checkInPhotoUrl = checkInPhoto
          ? (
              await AppDataSource.getRepository(InspectionPhoto).findOne({
                where: { inspectionId: checkInPhoto },
              })
            )?.url || ''
          : '';
        const checkOutPhotoUrl = photos[0]?.url || '';

        damageClaim = {
          claimId: insp.id,
          description: insp.damageDescription || 'Hư hỏng thiết bị',
          damageLineItems: damageLineItemsMapped,
          totalDamageCharge,
          checkInPhoto: checkInPhotoUrl,
          checkOutPhoto: checkOutPhotoUrl,
          status: session.status === SessionStatus.COMPLETED ? 'CONFIRMED' : 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
        };
      }
    }
  }

  // Include both on-site session orders AND the booking's pre-order
  const fnbOrders = await AppDataSource.getRepository(FnbOrder).find({
    where: [{ sessionId }, { bookingId: session.bookingId, orderType: FnbOrderType.PRE_ORDER }],
    order: { createdAt: 'ASC' },
  });
  const mappedFnbOrders = [];
  for (const order of fnbOrders) {
    const items = await AppDataSource.getRepository(FnbOrderItem).find({
      where: { fnbOrderId: order.id },
      order: { createdAt: 'ASC' },
    });
    const itemDetails = [];
    for (const item of items) {
      const menuItem = item.menuItemId
        ? await AppDataSource.getRepository(MenuItem).findOne({ where: { id: item.menuItemId } })
        : null;
      itemDetails.push({
        name: menuItem?.name || item.itemNameSnapshot || 'Món ăn',
        variantName: item.variantNameSnapshot,
        qty: item.quantity,
        price: Number(item.unitPrice),
        notes: item.notes,
      });
    }
    mappedFnbOrders.push({
      orderId: order.id,
      orderType: order.orderType,
      status: order.status,
      items: itemDetails,
      total: Number(order.totalAmount),
      createdAt: order.createdAt,
    });
  }

  const latestProposal = await AppDataSource.getRepository(ExtensionProposal).findOne({
    where: { sessionId },
    order: { createdAt: 'DESC' },
  });
  const approvedExtensions = await AppDataSource.getRepository(ExtensionProposal).find({
    where: { sessionId, status: ExtensionProposalStatus.APPROVED },
  });
  const approvedExtensionFee = approvedExtensions.reduce(
    (sum, ext) => sum + Number(ext.feeAmount),
    0,
  );
  const approvedExtensionMinutes = approvedExtensions.reduce(
    (sum, ext) => sum + Number(ext.durationMinutes),
    0,
  );
  const mappedApprovedExtensions = approvedExtensions
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((ext) => ({
      proposalId: ext.id,
      extraMinutes: ext.durationMinutes,
      additionalFee: Number(ext.feeAmount),
      approvedAt: ext.respondedAt?.toISOString() ?? ext.updatedAt.toISOString(),
    }));

  let extensionProposal = undefined;
  if (latestProposal) {
    extensionProposal = {
      proposalId: latestProposal.id,
      extraMinutes: latestProposal.durationMinutes,
      additionalFee: Number(latestProposal.feeAmount),
      newPlannedEnd: new Date(
        session.plannedEndAt.getTime() + latestProposal.durationMinutes * 60000,
      ).toISOString(),
      expiresAt: new Date(latestProposal.createdAt.getTime() + 10 * 60000).toISOString(),
      status: latestProposal.status,
    };
  }
  const extensionPricingOptions = await buildExtensionPricingOptions(booking, session, cafe);
  const paymentComponents = await AppDataSource.getRepository(PaymentComponent).find({
    where: { bookingId: booking.id },
  });
  const paymentTransactions = await AppDataSource.getRepository(PaymentTransaction).find({
    where: { bookingId: booking.id },
    order: { createdAt: 'ASC' },
  });
  const financialSummary = buildBookingFinancialSummary(
    paymentComponents,
    paymentTransactions,
    Number(booking.discountAmount) || 0,
    booking.status === BookingStatus.PENDING
      ? (booking.snapshot as PendingInitialPaymentSnapshot | null)
      : undefined,
  );
  const slotFee = paymentComponents
    .filter((component) => component.type === PaymentComponentType.SLOT_FEE)
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const rentalFee = paymentComponents
    .filter((component) => component.type === PaymentComponentType.RENTAL_FEE)
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const fnbPreorderFee = mappedFnbOrders
    .filter(
      (order) =>
        order.orderType === FnbOrderType.PRE_ORDER && order.status !== FnbOrderStatus.CANCELLED,
    )
    .reduce((sum, order) => sum + Number(order.total), 0);
  const pendingPaymentComponents = paymentComponents.filter(
    (component) => component.status === PaymentComponentStatus.PENDING,
  );
  const pendingRefundComponents = paymentComponents.filter(
    (component) => component.status === PaymentComponentStatus.PENDING_REFUND,
  );
  const pendingRefundAmount = pendingRefundComponents.reduce(
    (sum, component) => sum + Number(component.refundedAmount || 0),
    0,
  );
  const requiresSettlement =
    pendingPaymentComponents.length > 0 || pendingRefundComponents.length > 0;

  return {
    sessionId: session.id,
    bookingId: session.bookingId,
    cafeId: booking.cafeId,
    cafeName: cafe.name,
    cafeAddress: cafe.address,
    bookingSource: booking.source,
    contestId: booking.contestId ?? null,
    playMode: booking.playMode,
    status: session.status,
    staffName: staffUser?.full_name || 'Nhân viên trực ca',
    actualStart: session.actualStartAt ? session.actualStartAt.toISOString() : undefined,
    actualEnd: session.actualEndAt ? session.actualEndAt.toISOString() : undefined,
    plannedEnd: session.plannedEndAt.toISOString(),
    operationalTiming: getSessionOperationalTiming(session.plannedEndAt, session.status),
    participants: participants.map((p) => ({
      name: getParticipantName(p),
      type: 'PLAYER',
      avatarUrl: p.userId ? participantUserById.get(p.userId)?.avatar_url || undefined : undefined,
    })),
    vehicles: vehiclesList,
    inspections: mappedInspections,
    checkoutInspection,
    damageClaim,
    extensionProposal,
    approvedExtensionFee,
    approvedExtensionMinutes,
    approvedExtensions: mappedApprovedExtensions,
    extensionPricingOptions,
    fnbOrders: mappedFnbOrders,
    financialSummary,
    paymentSummary: {
      outstandingAmount: financialSummary.outstandingAmount,
      pendingRefundAmount,
      pendingPaymentCount: pendingPaymentComponents.length,
      pendingRefundCount: pendingRefundComponents.length,
      requiresSettlement,
    },
    // A session can be opened from the staff's historical list, where the
    // in-memory "today" context does not contain its booking. Return the
    // booking summary here so that page can render after a reload as well.
    booking: {
      bookingId: booking.id,
      shortCode: `RCF-${booking.id.substring(0, 4).toUpperCase()}`,
      cafeId: cafe.id,
      cafeName: cafe.name,
      cafeAddress: cafe.address,
      cafePhone: cafe.phone,
      trackName: trackType?.name || 'Đường đua',
      trackType: trackType?.code || '',
      bookingMode: 'SINGLE',
      playMode: booking.playMode,
      source: booking.source,
      /*
        Khách này có tự bấm xác nhận được không.

        Tài khoản mềm (đặt qua Messenger, hoặc khách vãng lai do nhân viên tạo)
        không có mật khẩu nên KHÔNG đăng nhập được. Những bước bắt buộc khách
        xác nhận — biên bản nhận xe, biên bản trả xe, đồng ý gia hạn — vì vậy
        phải đi qua đường thao tác hộ.

        Giao diện nhân viên cần biết điều này để hiện đúng nút. Không có cờ này
        thì màn hình chỉ có thể đoán theo `source`, mà đoán sẽ sai với khách
        vãng lai tạo tại quầy — cũng là tài khoản mềm nhưng `source` khác.

        Điều kiện trùng với `assertActingOnBehalfAllowed` ở tầng dịch vụ.
      */
      customerCanSelfServe: customerHasPassword,
      status: booking.status,
      slotStart: booking.slotStart.toISOString(),
      slotEnd: booking.slotEnd.toISOString(),
      slotCount: booking.slotCount,
      depositAmount: paymentComponents
        .filter((component) => component.type === PaymentComponentType.SECURITY_DEPOSIT)
        .reduce((sum, component) => sum + Number(component.amount), 0),
      slotFee,
      rentalFee,
      fnbPreorderFee,
      discountAmount: Number(booking.discountAmount) || 0,
      totalAmount: slotFee + rentalFee + fnbPreorderFee,
      paymentStatus: requiresSettlement ? 'UNPAID' : 'PAID',
      payment_components: paymentComponents,
      financial_summary: financialSummary,
      plannedParticipants: participants.map((participant) => getParticipantName(participant)),
      participantDetails: participants.map((participant) => ({
        name: getParticipantName(participant),
        isBooker: false,
      })),
      plannedVehicles: vehiclesList.map((vehicle) => vehicle.name),
      sessions: [],
    },
  };
}

export async function getCustomerSessionDetail(
  sessionId: string,
  customerId: string,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Bạn không có quyền xem phiên này', 403, 'FORBIDDEN');
  }

  return getSessionDetail(sessionId);
}

export async function submitInspection(
  sessionId: string,
  staffUserId: string,
  data: any,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const { type, photos, checklist, staffNotes, damageFlagged, damageLineItems } = data;
  const inspectionType = type === 'CHECK_IN' ? InspectionType.CHECK_IN : InspectionType.CHECK_OUT;

  const existingInspection = await AppDataSource.getRepository(Inspection).findOne({
    where: { sessionId, type: inspectionType },
    order: { createdAt: 'DESC' },
  });
  if (existingInspection) {
    if (inspectionType === InspectionType.CHECK_IN) {
      // Handover is jointly verified at the counter before this record is
      // created. It is final for the running session and must not be replaced
      // by a later customer-side response.
      return existingInspection;
    } else if (
      session.status === SessionStatus.CHECKING_OUT ||
      !existingInspection.customerConfirmedAt
    ) {
      // Staff is updating the CHECK_OUT inspection (e.g. editing damage items/checklist/notes)
      existingInspection.damageNoted = !!damageFlagged;
      existingInspection.damageDescription = staffNotes || null;
      await AppDataSource.getRepository(Inspection).save(existingInspection);

      if (photos && Array.isArray(photos) && photos.length > 0) {
        await AppDataSource.getRepository(InspectionPhoto).delete({
          inspectionId: existingInspection.id,
        });
        for (const photo of photos) {
          const p = new InspectionPhoto();
          p.inspectionId = existingInspection.id;
          p.angle = photo.angle || PhotoAngle.FRONT;
          p.url = photo.url;
          p.uploadedBy = staffUserId;
          p.metadata = photo.metadata ?? (photo.notes ? { notes: photo.notes } : null);
          await AppDataSource.getRepository(InspectionPhoto).save(p);
        }
      }

      if (checklist && Array.isArray(checklist) && checklist.length > 0) {
        await AppDataSource.getRepository(InspectionChecklist).delete({
          inspectionId: existingInspection.id,
        });
        for (const item of checklist) {
          const c = new InspectionChecklist();
          c.inspectionId = existingInspection.id;
          c.itemKey = item.itemKey;
          const isOk =
            !item.status || item.status === InspectionItemStatus.OK || item.status === 'OK';
          c.status = isOk ? InspectionItemStatus.OK : (item.status as InspectionItemStatus);
          c.note = isOk ? null : item.note || null;
          await AppDataSource.getRepository(InspectionChecklist).save(c);
        }
      }

      const lineItemRepo = AppDataSource.getRepository(DamageLineItem);
      const existingItems = await lineItemRepo.find({
        where: { inspectionId: existingInspection.id },
      });
      for (const it of existingItems) {
        await lineItemRepo.softDelete(it.id);
      }
      if (damageFlagged && Array.isArray(damageLineItems) && damageLineItems.length > 0) {
        for (const item of damageLineItems) {
          const li = new DamageLineItem();
          li.inspectionId = existingInspection.id;
          li.partType = item.partType as DamagePartType;
          li.customPartName =
            item.partType === DamagePartType.OTHER ? (item.customPartName ?? null) : null;
          li.partsPrice = Number(item.partsPrice) || 0;
          li.laborPrice = Number(item.laborPrice) || 0;
          await lineItemRepo.save(li);
        }
      }

      const svRepo = AppDataSource.getRepository(SessionVehicle);
      const sessionVehicles = await svRepo.find({ where: { sessionId } });
      const activeSVs = sessionVehicles.filter((vehicle) => !vehicle.returnedAt);
      if (activeSVs.length > 0) {
        for (const sv of activeSVs) {
          sv.status = damageFlagged ? SessionVehicleStatus.DAMAGED : SessionVehicleStatus.RETURNED;
          await svRepo.save(sv);
        }
      }

      await settleSessionCheckoutBilling(sessionId, existingInspection);

      broadcastSessionUpdated({
        cafeId: session.cafeId,
        bookingId: session.bookingId,
        sessionId,
        sessionStatus: session.status,
        action: 'INSPECTION_UPDATED',
      });

      return existingInspection;
    } else {
      return existingInspection;
    }
  }

  if (inspectionType === InspectionType.CHECK_IN && session.status !== SessionStatus.CHECKED_IN) {
    throw new AppError(
      'Chỉ có thể lập biên bản nhận xe khi phiên đang chờ bàn giao',
      409,
      'CHECK_IN_INSPECTION_NOT_ALLOWED',
    );
  }
  if (
    inspectionType === InspectionType.CHECK_OUT &&
    ![SessionStatus.ACTIVE, SessionStatus.EXTENDING, SessionStatus.CHECKING_OUT].includes(
      session.status,
    )
  ) {
    throw new AppError(
      'Chỉ có thể lập biên bản trả xe khi phiên đang chạy',
      409,
      'CHECK_OUT_INSPECTION_NOT_ALLOWED',
    );
  }

  let sessionVehicleId = null;
  const svRepo = AppDataSource.getRepository(SessionVehicle);
  const sessionVehicles = await svRepo.find({ where: { sessionId } });
  // A swapped-out vehicle remains in the history but must never be included in
  // the next handover/checkout inspection.
  const activeSVs = sessionVehicles.filter((vehicle) => !vehicle.returnedAt);
  if (activeSVs.length > 0) {
    sessionVehicleId = activeSVs[0].id;
  }

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });

  let expiredExtensionProposal = false;
  if (inspectionType === InspectionType.CHECK_OUT && session.status === SessionStatus.EXTENDING) {
    const expiration = await AppDataSource.getRepository(ExtensionProposal).update(
      { sessionId, status: ExtensionProposalStatus.PENDING },
      { status: ExtensionProposalStatus.EXPIRED, respondedAt: new Date() },
    );
    expiredExtensionProposal = Boolean(expiration.affected);
  }

  const inspection = new Inspection();
  inspection.sessionId = sessionId;
  inspection.sessionVehicleId = sessionVehicleId;
  inspection.type = inspectionType;
  const isByoc =
    booking?.playMode === 'BYOC' ||
    (activeSVs.length > 0 && activeSVs[0].vehicleSource === VehicleSource.BYOC);

  if (!isByoc && !hasValidRentalInspectionPhotoCount(photos)) {
    throw new AppError(
      `Biên bản xe thuê cần từ ${RENTAL_INSPECTION_MIN_PHOTOS} đến ${RENTAL_INSPECTION_MAX_PHOTOS} ảnh bàn giao`,
      400,
      'INVALID_INSPECTION_PHOTO_COUNT',
    );
  }

  inspection.subjectType = isByoc
    ? InspectionSubjectType.BYOC_VEHICLE
    : InspectionSubjectType.RENTAL_VEHICLE;
  inspection.performedBy = staffUserId;
  inspection.preExistingFlag = type === 'CHECK_IN' ? false : true;
  inspection.damageNoted = !!damageFlagged;
  inspection.damageDescription = staffNotes || null;
  inspection.customerConfirmed = false;

  await AppDataSource.getRepository(Inspection).save(inspection);

  if (photos && Array.isArray(photos)) {
    for (const photo of photos) {
      const p = new InspectionPhoto();
      p.inspectionId = inspection.id;
      p.angle = photo.angle || PhotoAngle.FRONT;
      p.url = photo.url;
      p.uploadedBy = staffUserId;
      p.metadata = photo.metadata ?? (photo.notes ? { notes: photo.notes } : null);
      await AppDataSource.getRepository(InspectionPhoto).save(p);
    }
  }

  if (checklist && Array.isArray(checklist)) {
    for (const item of checklist) {
      const c = new InspectionChecklist();
      c.inspectionId = inspection.id;
      c.itemKey = item.itemKey;
      c.itemLabel = item.itemLabel;
      const isOk = !item.status || item.status === InspectionItemStatus.OK || item.status === 'OK';
      c.status = isOk ? InspectionItemStatus.OK : (item.status as InspectionItemStatus);
      c.note = isOk ? null : item.note || null;
      await AppDataSource.getRepository(InspectionChecklist).save(c);
    }
  }

  if (inspection.type === InspectionType.CHECK_IN) {
    // BYOC has no cafe asset to hand over, so there is nothing for the customer
    // to confirm in the rental handover record.
    if (isByoc) {
      inspection.customerConfirmed = true;
      inspection.customerConfirmedAt = new Date();
      await AppDataSource.getRepository(Inspection).save(inspection);
    }

    // Completing the staff handover is the operational start of a session.
    // The customer can review the evidence and report a discrepancy afterwards,
    // but opening their app must not block a vehicle that has been physically
    // handed over at the counter.
    session.status = SessionStatus.ACTIVE;
    session.actualStartAt = new Date();
    await AppDataSource.getRepository(Session).save(session);

    for (const sv of activeSVs) {
      sv.status = SessionVehicleStatus.IN_USE;
      await svRepo.save(sv);
      if (sv.vehicleId) {
        await AppDataSource.getRepository(Vehicle).update(sv.vehicleId, {
          status: VehicleStatus.IN_USE,
        });
      }
    }
  } else {
    // CHECK_OUT — every mode enters the same completion path. BYOC is
    // completed immediately because there is no rented asset for the customer
    // to confirm; this still reconciles any F&B/extension fees correctly.
    session.status = SessionStatus.CHECKING_OUT;
    session.checkedOutBy = staffUserId;
    await AppDataSource.getRepository(Session).save(session);

    if (booking?.playMode === 'BYOC') {
      const completion = await completeCheckingOutSession(session, inspection, staffUserId);
      const reconciliation = await reconcileBookingAfterCheckout(booking);
      if (reconciliation.newlyCompleted) {
        await notifyCustomerToReviewBooking(booking);
      }
      if (!completion.alreadyCompleted) {
        void pushCheckoutCompletedEvents(booking, sessionId, staffUserId);
      }
    }

    if (activeSVs.length > 0) {
      for (const sv of activeSVs) {
        sv.status = damageFlagged ? SessionVehicleStatus.DAMAGED : SessionVehicleStatus.RETURNED;
        if (booking && booking.playMode === 'BYOC') {
          sv.returnedAt = new Date();
        }
        await svRepo.save(sv);
      }
    }

    // Save damage line items in same transaction context
    if (Array.isArray(damageLineItems) && damageLineItems.length > 0) {
      const lineItemRepo = AppDataSource.getRepository(DamageLineItem);
      for (const item of damageLineItems) {
        const li = new DamageLineItem();
        li.inspectionId = inspection.id;
        li.partType = item.partType as DamagePartType;
        li.customPartName =
          item.partType === DamagePartType.OTHER ? (item.customPartName ?? null) : null;
        li.partsPrice = Number(item.partsPrice) || 0;
        li.laborPrice = Number(item.laborPrice) || 0;
        await lineItemRepo.save(li);
      }
    }

    if (booking) {
      await settleSessionCheckoutBilling(sessionId, inspection);
    }
  }

  // Notify customer via WebSocket and save in DB
  if (booking?.customerId) {
    try {
      if (booking.playMode === 'BYOC' && inspection.type === InspectionType.CHECK_OUT) {
        await createNotification(
          booking.customerId,
          NotificationType.CUSTOMER_CHECKOUT_CONFIRMED,
          'Hoàn thành phiên chơi',
          'Phiên chơi của bạn đã kết thúc thành công. Cảm ơn bạn!',
        );

        wsService.pushToUser(booking.customerId, 'CUSTOMER_CHECKOUT_CONFIRMED', {
          sessionId,
          inspectionId: inspection.id,
          sessionStatus: session.status,
        });
      } else {
        const eventType =
          inspection.type === InspectionType.CHECK_IN
            ? 'SESSION_CHECKIN_INSPECTION'
            : 'SESSION_CHECKOUT_INSPECTION';
        await createNotification(
          booking.customerId,
          eventType as any,
          inspection.type === InspectionType.CHECK_IN ? 'Biên bản bàn giao xe' : 'Biên bản trả xe',
          inspection.type === InspectionType.CHECK_IN
            ? 'Nhân viên trực ca đã hoàn tất bàn giao xe. Phiên chơi đã bắt đầu; bạn có thể xem lại ảnh biên bản trong chi tiết đơn đặt.'
            : 'Nhân viên trực ca vừa lập biên bản trả xe. Chi tiết đã được cập nhật trong đơn đặt lịch.',
          {
            sessionId,
            inspectionId: inspection.id,
            inspectionType: inspection.type,
            route: `/customer/bookings/${booking.id}?section=handover`,
            damageFlagged: !!damageFlagged,
          },
        );

        wsService.pushToUser(booking.customerId, eventType, {
          sessionId,
          bookingId: booking.id,
          inspectionId: inspection.id,
          type: inspection.type,
          route: `/customer/bookings/${booking.id}?section=handover`,
          damageFlagged: !!damageFlagged,
        });
      }
    } catch (err) {
      logger.error('InspectionNotification', 'Failed to notify customer inspection', err);
    }
  }

  if (expiredExtensionProposal) {
    const eventData = { sessionId, bookingId: session.bookingId };
    if (session.checkedInBy) {
      wsService.pushToUser(session.checkedInBy, 'SESSION_EXTENSION_EXPIRED', eventData);
    }
    if (booking?.customerId) {
      wsService.pushToUser(booking.customerId, 'SESSION_EXTENSION_EXPIRED', eventData);
    }
  }

  const savedLineItems = await AppDataSource.getRepository(DamageLineItem).find({
    where: { inspectionId: inspection.id },
  });
  const totalDamageCharge = savedLineItems.reduce(
    (sum, li) => sum + Number(li.partsPrice) + Number(li.laborPrice),
    0,
  );

  if (booking) {
    broadcastSessionUpdated({
      cafeId: booking.cafeId,
      bookingId: booking.id,
      sessionId,
      sessionStatus: session.status,
      action:
        inspection.type === InspectionType.CHECK_IN
          ? 'CHECK_IN_INSPECTION_SUBMITTED'
          : 'CHECK_OUT_INSPECTION_SUBMITTED',
    });
  }

  logger.info('Staff', 'submitInspection', {
    sessionId,
    inspectionId: inspection.id,
    type: inspection.type,
    damageFlagged,
    lineItemCount: savedLineItems.length,
    totalDamageCharge,
  });

  return {
    inspectionId: inspection.id,
    sessionId,
    type: inspection.type,
    damageNoted: inspection.damageNoted,
    damageLineItems: savedLineItems.map((li) => ({
      id: li.id,
      partType: li.partType,
      customPartName: li.customPartName,
      partsPrice: Number(li.partsPrice),
      laborPrice: Number(li.laborPrice),
      lineTotal: Number(li.partsPrice) + Number(li.laborPrice),
    })),
    totalDamageCharge,
  };
}

function getSnapshotTrackConfigId(snapshot: object | null): string | null {
  const value = (snapshot as { track_config_id?: unknown } | null)?.track_config_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function resolveBookingTrackConfig(booking: Booking): Promise<CafeTrackConfig | null> {
  const trackConfigRepo = AppDataSource.getRepository(CafeTrackConfig);
  const trackConfigId = booking.trackConfigId ?? getSnapshotTrackConfigId(booking.snapshot);

  if (trackConfigId) {
    const trackConfig = await trackConfigRepo.findOne({
      where: { id: trackConfigId, cafeId: booking.cafeId, isActive: true },
    });
    if (trackConfig) return trackConfig;
  }

  return trackConfigRepo.findOne({
    where: { cafeId: booking.cafeId, trackTypeId: booking.trackTypeId, isActive: true },
  });
}

function formatSlotTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

const VN_TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getLocalDateStartUtcMs(value: Date): number {
  const local = new Date(value.getTime() + VN_TZ_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_TZ_OFFSET_MS
  );
}

function getDayKeyForLocalStart(localStartUtcMs: number): string {
  const local = new Date(localStartUtcMs + VN_TZ_OFFSET_MS);
  return DAY_KEYS[local.getUTCDay()];
}

function parseOperatingTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return 24 * 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function buildOperatingWindow(
  operatingHours: CafeOperatingHours | null | undefined,
  localStartUtcMs: number,
): { openAt: Date; closeAt: Date } | null {
  const dayKey = getDayKeyForLocalStart(localStartUtcMs);
  const schedule = operatingHours?.[dayKey];
  if (!schedule || schedule.is_closed) return null;

  const openMinutes = parseOperatingTimeToMinutes(schedule.open);
  const closeMinutes = parseOperatingTimeToMinutes(schedule.close);
  if (openMinutes === null || closeMinutes === null) return null;

  let closeOffsetMinutes = closeMinutes;
  if (closeOffsetMinutes <= openMinutes) closeOffsetMinutes += 24 * 60;

  return {
    openAt: new Date(localStartUtcMs + openMinutes * 60000),
    closeAt: new Date(localStartUtcMs + closeOffsetMinutes * 60000),
  };
}

function resolveOperatingWindowForBooking(
  cafe: Cafe,
  booking: Booking,
): {
  openAt: Date;
  closeAt: Date;
} | null {
  const localStart = getLocalDateStartUtcMs(booking.slotStart);
  const candidates = [localStart, localStart - 24 * 60 * 60000];

  for (const candidate of candidates) {
    const window = buildOperatingWindow(cafe.operatingHours, candidate);
    if (
      window &&
      booking.slotStart.getTime() >= window.openAt.getTime() &&
      booking.slotStart.getTime() <= window.closeAt.getTime()
    ) {
      return window;
    }
  }

  return buildOperatingWindow(cafe.operatingHours, localStart);
}

function getExtensionBlockedReason(cafe: Cafe, booking: Booking, proposedEnd: Date): string | null {
  const operatingWindow = resolveOperatingWindowForBooking(cafe, booking);
  if (!operatingWindow) return null;

  // Dùng đúng phép kiểm của lúc tạo booking: nối các khung giờ liền nhau thay
  // vì chỉ so với giờ đóng của MỘT ngày. Quán mở 00:00–24:00 mọi ngày là mở
  // 24/7 — trước đây gia hạn từ 23:00 sang 00:15 bị chặn vì tưởng đã quá giờ
  // đóng cửa, dù chính quán đó cho phép ĐẶT một đơn 23:00–01:00.
  if (isRangeWithinOperatingHours(cafe.operatingHours, booking.slotStart, proposedEnd)) {
    return null;
  }
  return `Vượt giờ đóng cửa (${formatSlotTime(operatingWindow.closeAt)})`;
}

async function getApprovedExtensionMinutes(sessionId: string): Promise<number> {
  const approvedExtensions = await AppDataSource.getRepository(ExtensionProposal).find({
    where: { sessionId, status: ExtensionProposalStatus.APPROVED },
  });
  return approvedExtensions.reduce((sum, ext) => sum + Number(ext.durationMinutes), 0);
}

async function getExtensionSlotRatePerMinute(booking: Booking, session: Session): Promise<number> {
  const slotComp = await AppDataSource.getRepository(PaymentComponent).findOne({
    where: { bookingId: booking.id, type: PaymentComponentType.SLOT_FEE },
  });
  const slotFee = slotComp ? Number(slotComp.amount) : 0;
  if (slotFee <= 0) return 0;

  const approvedExtensionMinutes = await getApprovedExtensionMinutes(session.id);
  const currentEndMs = Math.max(booking.slotEnd.getTime(), session.plannedEndAt.getTime());
  const currentDurationMinutes = (currentEndMs - booking.slotStart.getTime()) / 60000;
  const originalDurationMinutes = Math.max(currentDurationMinutes - approvedExtensionMinutes, 1);

  return slotFee / originalDurationMinutes;
}

function roundExtensionFee(ratePerMinute: number, extraMinutes: number): number {
  if (ratePerMinute <= 0 || extraMinutes <= 0) return 0;
  return Math.round((ratePerMinute * extraMinutes) / 1000) * 1000;
}

async function calculateExtensionFee(
  booking: Booking,
  session: Session,
  extraMinutes: number,
): Promise<number> {
  const ratePerMinute = await getExtensionSlotRatePerMinute(booking, session);
  return roundExtensionFee(ratePerMinute, extraMinutes);
}

/**
 * An approved extension is a committed service charge, not merely an
 * operational update on the session. Keep one pending component with the
 * aggregate approved amount so customer and staff financial summaries become
 * correct immediately, before checkout starts.
 */
async function syncApprovedExtensionFeeComponent(
  sessionId: string,
  bookingId: string,
): Promise<void> {
  const proposalRepo = AppDataSource.getRepository(ExtensionProposal);
  const approvedExtensions = await proposalRepo.find({
    where: { sessionId, status: ExtensionProposalStatus.APPROVED },
  });
  const totalApprovedFee = approvedExtensions.reduce(
    (sum, proposal) => sum + Number(proposal.feeAmount),
    0,
  );

  const componentRepo = AppDataSource.getRepository(PaymentComponent);
  const extensionComponents = await componentRepo.find({
    where: { bookingId, type: PaymentComponentType.EXTENSION_FEE },
    order: { createdAt: 'ASC' },
  });

  const paidExtensionFee = extensionComponents
    .filter((component) => component.status !== PaymentComponentStatus.PENDING)
    .reduce((sum, component) => sum + Number(component.amount), 0);

  const remainingPendingFee = totalApprovedFee - paidExtensionFee;
  const pendingComponent = extensionComponents.find(
    (component) => component.status === PaymentComponentStatus.PENDING,
  );

  if (remainingPendingFee <= 0) {
    if (pendingComponent) {
      await componentRepo.remove(pendingComponent);
    }
    return;
  }

  if (pendingComponent) {
    pendingComponent.amount = remainingPendingFee;
    await componentRepo.save(pendingComponent);
    return;
  }

  await componentRepo.save(
    componentRepo.create({
      bookingId,
      type: PaymentComponentType.EXTENSION_FEE,
      amount: remainingPendingFee,
      status: PaymentComponentStatus.PENDING,
    }),
  );
}

/**
 * Keep the counter-food component in sync with operational orders as they are
 * added or cancelled. This makes the outstanding amount visible to both sides
 * during the session while keeping cancelled orders out of the bill.
 */
async function syncOnsiteFnbFeeComponent(bookingId: string): Promise<void> {
  const orders = await AppDataSource.getRepository(FnbOrder).find({
    where: { bookingId, orderType: FnbOrderType.ON_SITE },
  });
  const totalAmount = orders
    .filter((order) => order.status !== FnbOrderStatus.CANCELLED)
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);

  const componentRepo = AppDataSource.getRepository(PaymentComponent);
  const existingComponents = await componentRepo.find({
    where: { bookingId },
    order: { createdAt: 'ASC' },
  });
  const pendingComponents = existingComponents.filter(
    (component) =>
      component.status === PaymentComponentStatus.PENDING &&
      component.type === PaymentComponentType.FNB_ON_SITE,
  );

  const paidOnsiteFnb = existingComponents
    .filter(
      (c) =>
        c.type === PaymentComponentType.FNB_ON_SITE && c.status !== PaymentComponentStatus.PENDING,
    )
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const remainingPendingAmount = Math.max(0, totalAmount - paidOnsiteFnb);

  if (remainingPendingAmount <= 0) {
    if (pendingComponents.length > 0) {
      await componentRepo.remove(pendingComponents);
    }
    return;
  }

  const primaryComponent =
    pendingComponents.find((component) => component.type === PaymentComponentType.FNB_ON_SITE) ??
    pendingComponents[0];
  if (primaryComponent) {
    primaryComponent.type = PaymentComponentType.FNB_ON_SITE;
    primaryComponent.amount = remainingPendingAmount;
    await componentRepo.save(primaryComponent);
    const duplicateComponents = pendingComponents.filter(
      (component) => component.id !== primaryComponent.id,
    );
    if (duplicateComponents.length > 0) {
      await componentRepo.remove(duplicateComponents);
    }
    return;
  }

  await componentRepo.save(
    componentRepo.create({
      bookingId,
      type: PaymentComponentType.FNB_ON_SITE,
      amount: remainingPendingAmount,
      status: PaymentComponentStatus.PENDING,
    }),
  );
}

async function buildExtensionPricingOptions(
  booking: Booking,
  session: Session,
  cafe: Cafe,
): Promise<
  Array<{
    extraMinutes: number;
    additionalFee: number;
    newPlannedEnd: string;
    available: boolean;
    blockedReason?: string;
  }>
> {
  const options = [15, 30, 60] as const;
  const ratePerMinute = await getExtensionSlotRatePerMinute(booking, session);
  const timing = getSessionOperationalTiming(session.plannedEndAt, session.status);

  if (!timing.canExtend) {
    return options.map((extraMinutes) => ({
      extraMinutes,
      additionalFee: roundExtensionFee(ratePerMinute, extraMinutes),
      newPlannedEnd: new Date(session.plannedEndAt.getTime() + extraMinutes * 60000).toISOString(),
      available: false,
      blockedReason: 'Phiên đã quá giờ; cần xử lý kết thúc phiên trước',
    }));
  }

  return options.map((extraMinutes) => {
    const proposedEnd = new Date(session.plannedEndAt.getTime() + extraMinutes * 60000);
    const blockedReason = getExtensionBlockedReason(cafe, booking, proposedEnd);

    return {
      extraMinutes,
      additionalFee: roundExtensionFee(ratePerMinute, extraMinutes),
      newPlannedEnd: proposedEnd.toISOString(),
      available: !blockedReason,
      ...(blockedReason ? { blockedReason } : {}),
    };
  });
}

export async function proposeExtension(
  sessionId: string,
  staffUserId: string,
  data: any,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const extraMinutes = Number(data.extraMinutes);
  const direct = Boolean(data.direct);
  if (!Number.isFinite(extraMinutes) || extraMinutes <= 0) {
    throw new AppError('Thời lượng gia hạn không hợp lệ', 400, 'INVALID_EXTENSION_DURATION');
  }
  if (session.status !== SessionStatus.ACTIVE) {
    throw new AppError('Chỉ có thể gia hạn phiên đang ACTIVE', 400, 'EXTENSION_NOT_ALLOWED');
  }
  const timing = getSessionOperationalTiming(session.plannedEndAt, session.status);
  if (!timing.canExtend) {
    throw new AppError(
      'Phiên đã quá giờ. Hãy xử lý kết thúc phiên; hệ thống không tự tính phí quá giờ theo thời điểm nhân viên đóng ca.',
      409,
      'LATE_EXTENSION_REQUIRES_CHECKOUT',
    );
  }

  const booking = await AppDataSource.getRepository(Booking)
    .createQueryBuilder('booking')
    .addSelect('booking.trackConfigId')
    .where('booking.id = :bookingId', { bookingId: session.bookingId })
    .getOne();
  if (!booking) {
    throw new AppError('Không tìm thấy đơn đặt lịch gốc của phiên này', 404, 'BOOKING_NOT_FOUND');
  }
  if (direct && booking.source !== BookingSource.STAFF_MANUAL) {
    throw new AppError(
      'Đơn đặt trước cần khách xác nhận gia hạn qua app',
      400,
      'DIRECT_EXTENSION_NOT_ALLOWED',
    );
  }

  const additionalFee = await calculateExtensionFee(booking, session, extraMinutes);
  const extensionStart = session.plannedEndAt;
  const proposedEnd = new Date(extensionStart.getTime() + extraMinutes * 60 * 1000);
  const activeStatuses = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
  const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: booking.cafeId } });
  if (!cafe) {
    throw new AppError('Cafe không tồn tại', 404, 'CAFE_NOT_FOUND');
  }
  const operatingHoursBlockedReason = getExtensionBlockedReason(cafe, booking, proposedEnd);
  if (operatingHoursBlockedReason) {
    throw new AppError(
      `Không thể gia hạn thêm ${extraMinutes} phút vì ${operatingHoursBlockedReason.toLowerCase()}.`,
      409,
      'OPERATING_HOURS_EXCEEDED',
    );
  }
  const trackConfig = await resolveBookingTrackConfig(booking);

  const applyTrackScope = (query: SelectQueryBuilder<Booking>) => {
    if (trackConfig) {
      query.andWhere(
        '(b.track_config_id = :trackConfigId OR (b.track_config_id IS NULL AND b.track_type_id = :trackTypeId))',
        { trackConfigId: trackConfig.id, trackTypeId: booking.trackTypeId },
      );
    } else {
      query.andWhere('b.track_type_id = :trackTypeId', { trackTypeId: booking.trackTypeId });
    }
    return query;
  };

  const buildOverlapQuery = () =>
    applyTrackScope(
      AppDataSource.getRepository(Booking)
        .createQueryBuilder('b')
        .where('b.cafe_id = :cafeId', { cafeId: booking.cafeId })
        .andWhere('b.id != :bookingId', { bookingId: booking.id })
        .andWhere('b.play_mode = :playMode', { playMode: booking.playMode })
        .andWhere('b.status IN (:...statuses)', { statuses: activeStatuses })
        .andWhere('b.slot_start < :proposedEnd', { proposedEnd })
        .andWhere('b.slot_end > :extensionStart', { extensionStart }),
    );

  if (booking.playMode === BookingMode.RENTAL) {
    const sessionVehicleRows = await AppDataSource.getRepository(SessionVehicle).find({
      where: {
        sessionId,
        vehicleSource: VehicleSource.RENTAL,
        returnedAt: IsNull(),
      },
    });
    let currentVehicleIds = sessionVehicleRows
      .map((sv) => sv.vehicleId)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

    if (currentVehicleIds.length === 0) {
      const bookingVehicles = await AppDataSource.getRepository(BookingVehicle).find({
        where: { bookingId: booking.id },
      });
      currentVehicleIds = bookingVehicles.map((bv) => bv.vehicleId);
    }

    if (currentVehicleIds.length > 0) {
      const vehicleConflict = await AppDataSource.getRepository(BookingVehicle)
        .createQueryBuilder('bv')
        .innerJoin(Booking, 'b', 'b.id = bv.booking_id')
        .where('bv.vehicle_id IN (:...vehicleIds)', { vehicleIds: currentVehicleIds })
        .andWhere('b.cafe_id = :cafeId', { cafeId: booking.cafeId })
        .andWhere('b.id != :bookingId', { bookingId: booking.id })
        .andWhere('b.status IN (:...statuses)', { statuses: activeStatuses })
        .andWhere('b.slot_start < :proposedEnd', { proposedEnd })
        .andWhere('b.slot_end > :extensionStart', { extensionStart })
        .select('b.slot_start', 'slotStart')
        .orderBy('b.slot_start', 'ASC')
        .getRawOne<{ slotStart: Date }>();

      if (vehicleConflict) {
        throw new AppError(
          `Xe đang dùng đã có đơn đặt lịch lúc ${formatSlotTime(vehicleConflict.slotStart)}. Không thể gia hạn thêm ${extraMinutes} phút.`,
          409,
          'SLOT_CONFLICT',
        );
      }
    }

    const capacity = Number(trackConfig?.maxConcurrent ?? cafe.maxConcurrentBookings);
    const overlaps = await buildOverlapQuery()
      .select('b.id', 'bookingId')
      .addSelect('b.slot_start', 'slotStart')
      .orderBy('b.slot_start', 'ASC')
      .getRawMany<{ bookingId: string; slotStart: Date }>();

    if (overlaps.length + 1 > capacity) {
      const firstConflictTime = overlaps[0]?.slotStart ?? extensionStart;
      throw new AppError(
        `Slot tiếp theo đã hết chỗ (${formatSlotTime(firstConflictTime)}). Không thể gia hạn thêm ${extraMinutes} phút.`,
        409,
        'SLOT_CONFLICT',
      );
    }
  } else {
    const capacity = Number(trackConfig?.byocCapacity ?? cafe.byocCapacity);
    const overlapRows = await buildOverlapQuery()
      .leftJoin(BookingParticipant, 'bp', 'bp.booking_id = b.id')
      .select('b.id', 'bookingId')
      .addSelect('b.slot_start', 'slotStart')
      .addSelect('COUNT(bp.id)', 'participantCount')
      .groupBy('b.id')
      .addGroupBy('b.slot_start')
      .orderBy('b.slot_start', 'ASC')
      .getRawMany<{ bookingId: string; slotStart: Date; participantCount: string }>();

    const occupiedPlayers = overlapRows.reduce(
      (sum, row) => sum + Math.max(Number(row.participantCount) || 0, 1),
      0,
    );
    const currentPlayers = Math.max(
      await AppDataSource.getRepository(BookingParticipant).count({
        where: { bookingId: booking.id },
      }),
      1,
    );

    if (occupiedPlayers + currentPlayers > capacity) {
      const firstConflictTime = overlapRows[0]?.slotStart ?? extensionStart;
      throw new AppError(
        `Slot tiếp theo đã hết chỗ (${formatSlotTime(firstConflictTime)}). Không thể gia hạn thêm ${extraMinutes} phút.`,
        409,
        'SLOT_CONFLICT',
      );
    }
  }

  const proposal = new ExtensionProposal();
  proposal.sessionId = sessionId;
  proposal.proposedBy = staffUserId;
  proposal.durationMinutes = extraMinutes;
  proposal.feeAmount = additionalFee;

  if (direct) {
    // Staff directly approves — customer physically present and agreed at the counter
    proposal.status = ExtensionProposalStatus.APPROVED;
    proposal.respondedBy = staffUserId;
    proposal.respondedAt = new Date();
    await AppDataSource.getRepository(ExtensionProposal).save(proposal);

    session.plannedEndAt = new Date(session.plannedEndAt.getTime() + extraMinutes * 60000);
    session.actualTotalAmount = Number(session.actualTotalAmount) + Number(additionalFee);
    session.status = SessionStatus.ACTIVE;
    await AppDataSource.getRepository(Session).save(session);

    if (booking) {
      booking.slotCount = Number(booking.slotCount) + Math.ceil(extraMinutes / 30);
      booking.slotEnd = session.plannedEndAt;
      await AppDataSource.getRepository(Booking).save(booking);

      await syncApprovedExtensionFeeComponent(sessionId, booking.id);

      if (booking.customerId) {
        await createNotification(
          booking.customerId,
          'SESSION_EXTENSION_PROPOSED' as any,
          'Ca chơi đã được gia hạn',
          `Ca chơi của bạn đã được gia hạn thêm ${extraMinutes} phút bởi nhân viên.`,
          {
            sessionId,
            proposalId: proposal.id,
            extraMinutes,
            additionalFee: Number(additionalFee),
            route: `/customer/extension-response/${sessionId}`,
          },
        );

        wsService.pushToUser(booking.customerId, 'SESSION_EXTENSION_UPDATED', {
          sessionId,
          bookingId: booking.id,
          proposalId: proposal.id,
          extraMinutes,
          additionalFee: Number(additionalFee),
          status: ExtensionProposalStatus.APPROVED,
          newPlannedEnd: session.plannedEndAt.toISOString(),
        });
      }
    }

    broadcastSessionUpdated({
      cafeId: session.cafeId,
      bookingId: session.bookingId,
      sessionId,
      sessionStatus: session.status,
      action: 'EXTENSION_APPROVED',
    });

    return proposal;
  }

  proposal.status = ExtensionProposalStatus.PENDING;
  await AppDataSource.getRepository(ExtensionProposal).save(proposal);
  const expiresAt = new Date((proposal.createdAt ?? new Date()).getTime() + 10 * 60000);

  session.status = SessionStatus.EXTENDING;
  await AppDataSource.getRepository(Session).save(session);

  // Notify customer via WebSocket and save in DB
  if (booking?.customerId) {
    await createNotification(
      booking.customerId,
      'SESSION_EXTENSION_PROPOSED' as any,
      'Yêu cầu xác nhận gia hạn',
      `Nhân viên trực ca đề xuất gia hạn thêm ${proposal.durationMinutes} phút. Vui lòng bấm vào để xem và phản hồi.`,
      {
        sessionId,
        proposalId: proposal.id,
        extraMinutes: proposal.durationMinutes,
        additionalFee: Number(proposal.feeAmount),
        expiresAt: expiresAt.toISOString(),
        route: `/customer/extension-response/${sessionId}`,
      },
    );

    wsService.pushToUser(booking.customerId, 'SESSION_EXTENSION_PROPOSED', {
      sessionId,
      proposalId: proposal.id,
      extraMinutes: proposal.durationMinutes,
      additionalFee: Number(proposal.feeAmount),
      expiresAt: expiresAt.toISOString(),
      route: `/customer/extension-response/${sessionId}`,
    });
  }

  broadcastSessionUpdated({
    cafeId: session.cafeId,
    bookingId: session.bookingId,
    sessionId,
    sessionStatus: session.status,
    action: 'EXTENSION_PROPOSED',
  });

  return proposal;
}

export async function addSessionFnbOrder(
  sessionId: string,
  staffUserId: string,
  data: {
    items: Array<{
      menu_item_id: string;
      variant_id?: string;
      quantity: number;
      notes?: string;
    }>;
  },
): Promise<FnbOrder> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }
  const timing = getSessionOperationalTiming(session.plannedEndAt, session.status);
  if (!timing.canExtend) {
    throw new AppError(
      'Phiên đã quá giờ; cần xử lý kết thúc phiên trước khi thêm dịch vụ mới.',
      409,
      'ON_SITE_ORDER_NOT_ALLOWED_AFTER_OVERDUE',
    );
  }

  const fnbOrder = await AppDataSource.transaction(async (manager) => {
    const menuItemRepo = manager.getRepository(MenuItem);
    const variantRepo = manager.getRepository(MenuItemVariant);
    const resolvedItems: Array<{
      menuItem: MenuItem;
      variant: MenuItemVariant | null;
      quantity: number;
      notes: string | null;
      unitPrice: number;
    }> = [];

    for (const item of data.items) {
      const menuItem = await menuItemRepo.findOne({
        where: { id: item.menu_item_id, cafeId: session.cafeId, isAvailable: true },
      });
      if (!menuItem) {
        throw new AppError(
          'Món đã chọn không tồn tại hoặc đang tạm ngừng bán',
          400,
          'MENU_ITEM_UNAVAILABLE',
        );
      }
      if (item.variant_id && menuItem.isCombo) {
        throw new AppError('Combo không có lựa chọn riêng', 400, 'INVALID_MENU_VARIANT');
      }
      const variant = item.variant_id
        ? await variantRepo.findOne({
            where: { id: item.variant_id, menuItemId: menuItem.id, isAvailable: true },
          })
        : null;
      if (item.variant_id && !variant) {
        throw new AppError(
          'Lựa chọn món không tồn tại hoặc đang tạm ngừng bán',
          400,
          'MENU_VARIANT_UNAVAILABLE',
        );
      }
      resolvedItems.push({
        menuItem,
        variant,
        quantity: item.quantity,
        notes: item.notes?.trim() || null,
        unitPrice: Number(variant?.price ?? menuItem.price),
      });
    }

    const total = resolvedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const orderRepo = manager.getRepository(FnbOrder);
    const order = await orderRepo.save(
      orderRepo.create({
        bookingId: session.bookingId,
        sessionId: session.id,
        orderType: FnbOrderType.ON_SITE,
        status: FnbOrderStatus.PENDING,
        totalAmount: total,
        createdBy: staffUserId,
        notes: 'Gọi món tại quầy [ACTIVE SESSION]',
      }),
    );

    const orderItemRepo = manager.getRepository(FnbOrderItem);
    await orderItemRepo.save(
      resolvedItems.map((item) =>
        orderItemRepo.create({
          fnbOrderId: order.id,
          menuItemId: item.menuItem.id,
          menuItemVariantId: item.variant?.id ?? null,
          itemNameSnapshot: item.menuItem.name,
          variantNameSnapshot: item.variant?.name ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          notes: item.notes,
        }),
      ),
    );

    session.actualTotalAmount = Number(session.actualTotalAmount) + total;
    await manager.getRepository(Session).save(session);
    return order;
  });

  const total = Number(fnbOrder.totalAmount);
  await syncOnsiteFnbFeeComponent(session.bookingId);

  await notifyCafeStaffAboutFnbPrep({
    cafeId: session.cafeId,
    bookingId: session.bookingId,
    orderId: fnbOrder.id,
    orderType: FnbOrderType.ON_SITE,
    excludeStaffUserId: staffUserId,
  });
  broadcastFnbOrderUpdated({
    cafeId: session.cafeId,
    bookingId: session.bookingId,
    sessionId: session.id,
    orderId: fnbOrder.id,
    status: FnbOrderStatus.PENDING,
  });

  // Notify customer of new Fnb order added
  try {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: session.bookingId },
    });
    if (booking && booking.customerId) {
      await createNotification(
        booking.customerId,
        NotificationType.SESSION_FNB_ORDER_ADDED,
        'Dịch vụ đồ ăn & uống được thêm',
        `Nhân viên vừa thêm món ăn/nước uống mới vào phiên chơi của bạn.`,
        {
          sessionId: session.id,
          bookingId: booking.id,
          totalAmount: total,
          route: `/booking/${booking.id}`,
        },
      );

      wsService.pushToUser(booking.customerId, 'SESSION_FNB_ORDER_ADDED', {
        sessionId: session.id,
        bookingId: booking.id,
        totalAmount: total,
      });
    }
  } catch (err) {
    logger.error('FnbOrderNotification', 'Failed to send notification to customer', err);
  }

  return fnbOrder;
}

export async function swapSessionVehicle(
  sessionId: string,
  oldVehicleId: string,
  newVehicleId: string,
  oldVehicleNewStatus: string,
  _staffUserId: string,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const svRepo = AppDataSource.getRepository(SessionVehicle);
  const activeSV = await svRepo.findOne({
    where: { sessionId, vehicleId: oldVehicleId, returnedAt: IsNull() },
  });

  if (!activeSV) {
    throw new AppError(
      'Không tìm thấy xe đang chạy này trong phiên',
      404,
      'VEHICLE_NOT_IN_SESSION',
    );
  }

  activeSV.returnedAt = new Date();
  activeSV.status =
    oldVehicleNewStatus === 'MAINTENANCE'
      ? SessionVehicleStatus.DAMAGED
      : SessionVehicleStatus.RETURNED;
  activeSV.notes = `Đổi sang xe mới mã ID ${newVehicleId}`;
  await svRepo.save(activeSV);

  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const oldVeh = await vehicleRepo.findOne({ where: { id: oldVehicleId } });
  if (oldVeh) {
    oldVeh.status =
      oldVehicleNewStatus === 'MAINTENANCE' ? VehicleStatus.MAINTENANCE : VehicleStatus.AVAILABLE;
    await vehicleRepo.save(oldVeh);
  }

  const newVeh = await vehicleRepo.findOne({ where: { id: newVehicleId } });
  if (!newVeh) {
    throw new AppError('Xe thay thế không tồn tại', 404, 'REPLACEMENT_VEHICLE_NOT_FOUND');
  }
  if (newVeh.status !== VehicleStatus.AVAILABLE) {
    throw new AppError(
      'Xe thay thế hiện không khả dụng (bận hoặc bảo trì)',
      400,
      'REPLACEMENT_VEHICLE_UNAVAILABLE',
    );
  }

  newVeh.status = VehicleStatus.IN_USE;
  await vehicleRepo.save(newVeh);

  const newSV = new SessionVehicle();
  newSV.sessionId = sessionId;
  newSV.bookingVehicleId = activeSV.bookingVehicleId;
  newSV.vehicleSource = VehicleSource.RENTAL;
  newSV.vehicleId = newVehicleId;
  newSV.assignedToParticipantId = activeSV.assignedToParticipantId;
  newSV.status = SessionVehicleStatus.IN_USE;
  newSV.startedAt = new Date();
  await svRepo.save(newSV);

  broadcastSessionUpdated({
    cafeId: session.cafeId,
    bookingId: session.bookingId,
    sessionId,
    sessionStatus: session.status,
    action: 'VEHICLE_SWAPPED',
  });

  return newSV;
}

export async function simulateClientCheckOutResponse(sessionId: string): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const inspectionRepo = AppDataSource.getRepository(Inspection);
  const checkOutInspection = await inspectionRepo.findOne({
    where: { sessionId, type: InspectionType.CHECK_OUT },
  });

  if (checkOutInspection) {
    checkOutInspection.customerConfirmed = true;
    checkOutInspection.customerConfirmedAt = new Date();
    await inspectionRepo.save(checkOutInspection);
  }

  session.status = SessionStatus.COMPLETED;
  session.actualEndAt = new Date();
  await AppDataSource.getRepository(Session).save(session);

  const svRepo = AppDataSource.getRepository(SessionVehicle);
  const sessionVehicles = await svRepo.find({ where: { sessionId } });
  const vehicleRepo = AppDataSource.getRepository(Vehicle);

  const damageFlagged = checkOutInspection?.damageNoted || false;

  for (const sv of sessionVehicles) {
    sv.status = damageFlagged ? SessionVehicleStatus.DAMAGED : SessionVehicleStatus.RETURNED;
    sv.returnedAt = new Date();
    await svRepo.save(sv);

    if (sv.vehicleSource === VehicleSource.RENTAL && sv.vehicleId) {
      const veh = await vehicleRepo.findOne({ where: { id: sv.vehicleId } });
      if (veh) {
        veh.status = damageFlagged ? VehicleStatus.MAINTENANCE : VehicleStatus.AVAILABLE;
        await vehicleRepo.save(veh);
      }
    }
  }

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (booking) {
    booking.status = BookingStatus.COMPLETED;
    booking.completedAt = new Date();
    await AppDataSource.getRepository(Booking).save(booking);
  }

  // Settle invoice at checkout — called unconditionally so BYOC sessions
  // (no checkOutInspection) still get extension fees and on-site F&B billed
  await settleSessionCheckoutBilling(sessionId, checkOutInspection ?? null);

  if (booking) {
    // Soát lại sau khi tất toán, vì tới lúc này mới biết còn nợ hay không.
    const { pendingCount } = await reconcileBookingAfterCheckout(booking);
    // Lời mời đánh giá chỉ gửi khi đơn thật sự khép lại. Khách còn nợ tiền mà
    // nhận thư "phiên chơi đã xong, mời bạn đánh giá" thì vừa sai vừa kỳ.
    if (pendingCount === 0) await notifyCustomerToReviewBooking(booking);
  }

  return session;
}

export async function simulateClientExtensionResponse(
  sessionId: string,
  approved: boolean,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) {
    throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  }

  const propRepo = AppDataSource.getRepository(ExtensionProposal);
  const latestProposal = await propRepo.findOne({
    where: { sessionId, status: ExtensionProposalStatus.PENDING },
    order: { createdAt: 'DESC' },
  });

  if (!latestProposal) {
    throw new AppError(
      'Không tìm thấy yêu cầu gia hạn nào đang chờ duyệt',
      404,
      'NO_PENDING_EXTENSION_PROPOSAL',
    );
  }

  latestProposal.status = approved
    ? ExtensionProposalStatus.APPROVED
    : ExtensionProposalStatus.REJECTED;
  latestProposal.respondedAt = new Date();
  await propRepo.save(latestProposal);

  session.status = SessionStatus.ACTIVE;

  if (approved) {
    session.plannedEndAt = new Date(
      session.plannedEndAt.getTime() + latestProposal.durationMinutes * 60000,
    );

    session.actualTotalAmount =
      Number(session.actualTotalAmount) + Number(latestProposal.feeAmount);

    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: session.bookingId },
    });
    if (booking) {
      booking.slotCount =
        Number(booking.slotCount) + Math.ceil(latestProposal.durationMinutes / 30);
      booking.slotEnd = session.plannedEndAt;
      await AppDataSource.getRepository(Booking).save(booking);
    }
  }

  await AppDataSource.getRepository(Session).save(session);

  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER-SIDE ACTIONS (real client flow, not simulated)
// ─────────────────────────────────────────────────────────────────────────────

export async function customerConfirmInspection(
  sessionId: string,
  inspectionId: string,
  customerId: string,
  agreed: boolean,
  disagreementNote?: string,
): Promise<any> {
  return confirmInspectionAs(sessionId, inspectionId, agreed, disagreementNote, {
    actorId: customerId,
    onBehalfOfCustomerId: null,
    reason: null,
  });
}

/**
 * Nhân viên xác nhận biên bản trả xe hộ khách dùng tài khoản mềm (FR-023).
 *
 * ⚠️ Hàm này KHÔNG nới lỏng bất kỳ yêu cầu nào của Nguyên tắc III: vẫn phải đủ
 * ảnh và danh mục kiểm tra như biên bản do khách tự ký. Nó chỉ đổi AI BẤM NÚT,
 * không đổi CẦN GÌ MỚI BẤM ĐƯỢC. `reason` bắt buộc chính là bằng chứng thay cho
 * thao tác của khách — đó là lý do nó không được để trống.
 */
export async function confirmInspectionOnBehalf(
  sessionId: string,
  inspectionId: string,
  staffId: string,
  agreed: boolean,
  reason: string,
): Promise<any> {
  const customerId = await assertActingOnBehalfAllowed(sessionId);
  return confirmInspectionAs(sessionId, inspectionId, agreed, undefined, {
    actorId: staffId,
    onBehalfOfCustomerId: customerId,
    reason,
  });
}

async function confirmInspectionAs(
  sessionId: string,
  inspectionId: string,
  agreed: boolean,
  disagreementNote: string | undefined,
  actor: SessionActor,
): Promise<any> {
  const customerId = actor.onBehalfOfCustomerId ?? actor.actorId;
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');

  // Verify customer owns this session's booking
  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Bạn không có quyền xác nhận phiên này', 403, 'FORBIDDEN');
  }

  const inspRepo = AppDataSource.getRepository(Inspection);
  const inspection = await inspRepo.findOne({ where: { id: inspectionId, sessionId } });
  if (!inspection)
    throw new AppError('Biên bản kiểm xe không tồn tại', 404, 'INSPECTION_NOT_FOUND');

  // Check-in is jointly verified face-to-face before staff creates the record.
  // Customers can view it later but cannot confirm or dispute it in the app.
  if (inspection.type !== InspectionType.CHECK_OUT) {
    throw new AppError(
      'Biên bản bàn giao xe đã được xác nhận tại quầy và chỉ có thể xem lại',
      400,
      'CHECK_IN_INSPECTION_READ_ONLY',
    );
  }
  if (session.status !== SessionStatus.CHECKING_OUT) {
    throw new AppError(
      'Phiên chạy không ở trạng thái chờ xác nhận trả xe',
      400,
      'INVALID_SESSION_STATE',
    );
  }

  // Reject duplicate confirmations.
  if (inspection.customerConfirmed) {
    throw new AppError('Biên bản đã được xác nhận', 400, 'ALREADY_CONFIRMED');
  }

  // FR-024: biên bản phải ghi ai thực sự ký. Ghi TRƯỚC khi chốt phiên để dù
  // bước sau có hỏng thì dấu vết vẫn còn.
  inspection.confirmedBy = actor.actorId;
  inspection.confirmedOnBehalf = actor.onBehalfOfCustomerId !== null;
  inspection.onBehalfReason = actor.reason;
  await inspRepo.save(inspection);

  if (actor.onBehalfOfCustomerId) {
    logger.info('Staff', 'ký biên bản trả xe hộ khách', {
      sessionId,
      inspectionId,
      staffId: actor.actorId,
      onBehalfOfCustomerId: actor.onBehalfOfCustomerId,
      agreed,
    });
  }

  if (agreed) {
    // Customer confirmation and staff counter confirmation must finalize the
    // exact same vehicle, payment and booking state transitions.
    const completion = await completeCheckingOutSession(
      session,
      inspection,
      session.checkedOutBy || session.checkedInBy || customerId,
    );
    const reconciliation = await reconcileBookingAfterCheckout(booking);
    if (reconciliation.newlyCompleted) {
      await notifyCustomerToReviewBooking(booking);
    }

    if (session.checkedInBy) {
      await createNotification(
        session.checkedInBy,
        NotificationType.CUSTOMER_CHECKOUT_CONFIRMED,
        'Khách hàng đã trả xe',
        `Khách hàng vừa xác nhận biên bản trả xe của phiên chơi ${session.id.substring(0, 8)}.`,
        { sessionId, inspectionId, sessionStatus: session.status },
      );

      wsService.pushToUser(session.checkedInBy, 'CUSTOMER_CHECKOUT_CONFIRMED', {
        sessionId,
        inspectionId,
        sessionStatus: session.status,
      });
    }
    if (!completion.alreadyCompleted) {
      void pushCheckoutCompletedEvents(
        booking,
        sessionId,
        session.checkedOutBy || session.checkedInBy,
      );
    }
  } else {
    // Customer disputed CHECK_OUT — reset to ACTIVE so staff can re-inspect
    inspection.customerConfirmed = false;
    inspection.customerConfirmedAt = new Date();
    if (disagreementNote) {
      inspection.damageDescription =
        (inspection.damageDescription || '') + ` [KH phản hồi: ${disagreementNote}]`;
    }
    await inspRepo.save(inspection);

    session.status = SessionStatus.ACTIVE;
    await AppDataSource.getRepository(Session).save(session);

    // The checkout inspection had moved these rows to RETURNED/DAMAGED while
    // waiting for the response. A dispute reopens the session, so its current
    // vehicles must be operationally marked in use again.
    const svRepo = AppDataSource.getRepository(SessionVehicle);
    const sessionVehicles = await svRepo.find({ where: { sessionId } });
    for (const vehicle of sessionVehicles) {
      if (vehicle.returnedAt) continue;
      vehicle.status = SessionVehicleStatus.IN_USE;
      await svRepo.save(vehicle);
    }

    if (session.checkedInBy) {
      await createNotification(
        session.checkedInBy,
        NotificationType.CUSTOMER_INSPECTION_DISPUTED,
        'Biên bản bị phản hồi sai lệch',
        `Khách hàng phản hồi biên bản kiểm xe phiên chơi ${session.id.substring(0, 8)}: "${disagreementNote}".`,
        {
          sessionId,
          inspectionId,
          inspectionType: inspection.type,
          disagreementNote,
        },
      );

      wsService.pushToUser(session.checkedInBy, 'CUSTOMER_INSPECTION_DISPUTED', {
        sessionId,
        inspectionId,
        type: inspection.type,
        note: disagreementNote,
      });
    }
  }

  broadcastSessionUpdated({
    cafeId: session.cafeId,
    bookingId: booking.id,
    sessionId,
    sessionStatus: session.status,
    action: agreed ? 'CHECK_OUT_CONFIRMED' : 'CHECK_OUT_DISPUTED',
  });

  return { success: true, agreed, sessionStatus: session.status };
}

/**
 * Ai đang thao tác trên phiên chơi.
 *
 * `actorId` là người THỰC SỰ bấm; `onBehalfOfCustomerId` chỉ khác `null` khi
 * nhân viên làm hộ một khách không đăng nhập được.
 *
 * Không gộp hai thứ này làm một: truyền `customerId` của khách để nhân viên đi
 * qua kiểm tra quyền sẽ khiến nhật ký ghi như thể khách tự thao tác — đúng thứ
 * FR-024 cấm, và làm hỏng giá trị chống tranh chấp của biên bản.
 */
export interface SessionActor {
  actorId: string;
  onBehalfOfCustomerId: string | null;
  reason: string | null;
}

export async function customerRespondExtension(
  sessionId: string,
  customerId: string,
  approved: boolean,
): Promise<any> {
  return respondExtensionAs(sessionId, approved, {
    actorId: customerId,
    onBehalfOfCustomerId: null,
    reason: null,
  });
}

/** Nhân viên duyệt gia hạn hộ khách dùng tài khoản mềm (FR-023). */
export async function respondExtensionOnBehalf(
  sessionId: string,
  staffId: string,
  approved: boolean,
  reason: string,
): Promise<any> {
  const customerId = await assertActingOnBehalfAllowed(sessionId);
  return respondExtensionAs(sessionId, approved, {
    actorId: staffId,
    onBehalfOfCustomerId: customerId,
    reason,
  });
}

/**
 * Chỉ cho phép thao tác hộ khi chủ đơn KHÔNG tự đăng nhập được (FR-025).
 *
 * Khách có mật khẩu thì phải tự xác nhận — đó là chữ ký của họ, không ai ký thay
 * được.
 */
async function assertActingOnBehalfAllowed(sessionId: string): Promise<string> {
  const rows = await AppDataSource.query<{ customer_id: string; password_hash: string | null }[]>(
    `SELECT b.customer_id, u.password_hash
       FROM sessions s
       JOIN bookings b ON b.id = s.booking_id
       JOIN users u    ON u.id = b.customer_id
      WHERE s.id = $1`,
    [sessionId],
  );
  if (!rows.length) throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');
  if (rows[0].password_hash !== null) {
    throw new AppError(
      'Khách hàng này có tài khoản riêng và phải tự xác nhận.',
      403,
      'CUSTOMER_CAN_SELF_SERVE',
    );
  }
  return rows[0].customer_id;
}

async function respondExtensionAs(
  sessionId: string,
  approved: boolean,
  actor: SessionActor,
): Promise<any> {
  const customerId = actor.onBehalfOfCustomerId ?? actor.actorId;
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (!booking || booking.customerId !== customerId) {
    throw new AppError('Bạn không có quyền phản hồi phiên này', 403, 'FORBIDDEN');
  }

  const propRepo = AppDataSource.getRepository(ExtensionProposal);
  const latestProposal = await propRepo.findOne({
    where: { sessionId, status: ExtensionProposalStatus.PENDING },
    order: { createdAt: 'DESC' },
  });
  if (!latestProposal)
    throw new AppError('Không có đề xuất gia hạn đang chờ', 404, 'NO_PENDING_EXTENSION');

  // A checkout may have begun while this screen was open. Never revive that
  // session back to ACTIVE from a delayed extension response.
  if (session.status !== SessionStatus.EXTENDING) {
    latestProposal.status = ExtensionProposalStatus.EXPIRED;
    latestProposal.respondedBy = actor.actorId;
    latestProposal.respondedAt = new Date();
    await propRepo.save(latestProposal);
    throw new AppError(
      'Phiên đang được trả xe hoặc đã kết thúc; đề xuất gia hạn không còn hiệu lực.',
      409,
      'EXTENSION_NOT_ACTIVE',
    );
  }

  const expiresAt = new Date(latestProposal.createdAt.getTime() + 10 * 60000);
  const timing = getSessionOperationalTiming(session.plannedEndAt, session.status);
  if (expiresAt.getTime() <= Date.now() || !timing.canExtend) {
    latestProposal.status = ExtensionProposalStatus.EXPIRED;
    latestProposal.respondedBy = actor.actorId;
    latestProposal.respondedAt = new Date();
    await propRepo.save(latestProposal);

    // This branch is reached only for EXTENDING sessions (guarded above), so
    // returning to ACTIVE is safe and cannot undo a checkout transition.
    session.status = SessionStatus.ACTIVE;
    await AppDataSource.getRepository(Session).save(session);

    broadcastSessionUpdated({
      cafeId: session.cafeId,
      bookingId: booking.id,
      sessionId,
      sessionStatus: session.status,
      action: 'EXTENSION_EXPIRED',
    });

    throw new AppError(
      timing.canExtend
        ? 'Đề xuất gia hạn đã hết hạn'
        : 'Phiên đã quá giờ; cần xử lý kết thúc phiên trước khi xem xét phụ phí.',
      400,
      timing.canExtend ? 'EXTENSION_EXPIRED' : 'LATE_EXTENSION_REQUIRES_CHECKOUT',
    );
  }

  latestProposal.status = approved
    ? ExtensionProposalStatus.APPROVED
    : ExtensionProposalStatus.REJECTED;
  latestProposal.respondedBy = actor.actorId;
  latestProposal.respondedAt = new Date();
  // FR-024: bản ghi phải nói rõ nhân viên làm hộ ai, không được đọc lên như thể
  // khách tự thao tác.
  latestProposal.respondedOnBehalf = actor.onBehalfOfCustomerId !== null;
  latestProposal.onBehalfReason = actor.reason;
  await propRepo.save(latestProposal);

  if (actor.onBehalfOfCustomerId) {
    logger.info('Staff', 'duyệt gia hạn hộ khách', {
      sessionId,
      staffId: actor.actorId,
      onBehalfOfCustomerId: actor.onBehalfOfCustomerId,
      approved,
    });
  }

  session.status = SessionStatus.ACTIVE;
  if (approved) {
    session.plannedEndAt = new Date(
      session.plannedEndAt.getTime() + latestProposal.durationMinutes * 60000,
    );
    session.actualTotalAmount =
      Number(session.actualTotalAmount) + Number(latestProposal.feeAmount);
    booking.slotCount = Number(booking.slotCount) + Math.ceil(latestProposal.durationMinutes / 30);
    booking.slotEnd = session.plannedEndAt;
    await AppDataSource.getRepository(Booking).save(booking);
    await syncApprovedExtensionFeeComponent(sessionId, booking.id);
  }
  await AppDataSource.getRepository(Session).save(session);

  // Notify staff
  if (session.checkedInBy) {
    await createNotification(
      session.checkedInBy,
      approved
        ? NotificationType.CUSTOMER_EXTENSION_APPROVED
        : NotificationType.CUSTOMER_EXTENSION_REJECTED,
      approved ? 'Khách đồng ý gia hạn' : 'Khách từ chối gia hạn',
      approved
        ? `Khách hàng đã đồng ý đề xuất gia hạn thêm ${latestProposal.durationMinutes} phút cho phiên chơi ${session.id.substring(0, 8)}.`
        : `Khách hàng đã từ chối đề xuất gia hạn thêm ${latestProposal.durationMinutes} phút cho phiên chơi ${session.id.substring(0, 8)}.`,
      {
        sessionId,
        proposalId: latestProposal.id,
        extraMinutes: latestProposal.durationMinutes,
        sessionStatus: session.status,
      },
    );

    wsService.pushToUser(
      session.checkedInBy,
      approved ? 'CUSTOMER_EXTENSION_APPROVED' : 'CUSTOMER_EXTENSION_REJECTED',
      {
        sessionId,
        proposalId: latestProposal.id,
        extraMinutes: latestProposal.durationMinutes,
        sessionStatus: session.status,
      },
    );
  }

  if (booking.customerId) {
    wsService.pushToUser(booking.customerId, 'SESSION_EXTENSION_UPDATED', {
      sessionId,
      bookingId: booking.id,
      proposalId: latestProposal.id,
      extraMinutes: latestProposal.durationMinutes,
      additionalFee: Number(latestProposal.feeAmount),
      status: latestProposal.status,
      newPlannedEnd: session.plannedEndAt.toISOString(),
    });
  }

  broadcastSessionUpdated({
    cafeId: session.cafeId,
    bookingId: booking.id,
    sessionId,
    sessionStatus: session.status,
    action: approved ? 'EXTENSION_APPROVED' : 'EXTENSION_REJECTED',
  });

  return {
    success: true,
    approved,
    newPlannedEnd: session.plannedEndAt,
    sessionStatus: session.status,
  };
}

async function handleVehicleCheckoutMaintenance(
  sessionId: string,
  inspection: Inspection,
  staffUserId?: string | null,
): Promise<void> {
  if (!inspection.damageNoted) return;

  const lineItems = await AppDataSource.getRepository(DamageLineItem).find({
    where: { inspectionId: inspection.id },
  });
  const totalCost = lineItems.reduce(
    (sum, item) => sum + (Number(item.partsPrice) || 0) + (Number(item.laborPrice) || 0),
    0,
  );

  const svs = await AppDataSource.getRepository(SessionVehicle).find({ where: { sessionId } });
  for (const sv of svs) {
    if (sv.vehicleId) {
      await AppDataSource.getRepository(Vehicle).update(sv.vehicleId, {
        status: VehicleStatus.MAINTENANCE,
      });

      await AppDataSource.query<{ id: string }[]>(
        `INSERT INTO vehicle_maintenance_logs (vehicle_id, related_session_id, type, description, cost, status, performed_by, performed_at)
         VALUES ($1, $2, 'REPAIR', $3, $4, 'PENDING_REPAIR', $5, NOW())
         RETURNING id`,
        [
          sv.vehicleId,
          sessionId,
          inspection.damageDescription || 'Xe ghi nhận hư hỏng sau Check-out.',
          totalCost,
          staffUserId || null,
        ],
      );

      try {
        const [vehInfo] = await AppDataSource.query<
          {
            vehicleIdentifier: string;
            categoryName: string | null;
            cafeName: string;
            providerId: string;
            cafeId: string;
          }[]
        >(
          `SELECT v.identifier AS "vehicleIdentifier", vc.name AS "categoryName", c.name AS "cafeName", c.provider_id AS "providerId", c.id AS "cafeId"
           FROM vehicles v
           JOIN cafes c ON v.cafe_id = c.id
           LEFT JOIN vehicle_catalogs vc ON v.catalog_id = vc.id
           WHERE v.id = $1`,
          [sv.vehicleId],
        );

        if (vehInfo && vehInfo.providerId) {
          const vehName = vehInfo.categoryName
            ? `${vehInfo.categoryName} (${vehInfo.vehicleIdentifier})`
            : vehInfo.vehicleIdentifier;

          const notifTitle = 'Cảnh báo xe cần bảo trì';
          const notifMessage = `Xe ${vehName} thuộc cơ sở ${vehInfo.cafeName} vừa ghi nhận hư hỏng cần bảo trì từ Check-out.`;

          await createNotification(
            vehInfo.providerId,
            NotificationType.SYSTEM,
            notifTitle,
            notifMessage,
            {
              vehicleId: sv.vehicleId,
              vehicleName: vehName,
              cafeName: vehInfo.cafeName,
              status: 'PENDING_REPAIR',
              route: '/provider/vehicles',
            },
          );

          wsService.pushToUser(vehInfo.providerId, 'VEHICLE_MAINTENANCE_CREATED', {
            title: notifTitle,
            message: notifMessage,
            vehicleId: sv.vehicleId,
            vehicleName: vehName,
            cafeName: vehInfo.cafeName,
            route: '/provider/vehicles',
          });
        }
      } catch (err) {
        logger.error('Staff', 'Failed to create provider maintenance alert notification', err);
      }
    }
  }
}

type CheckoutCompletionResult = {
  alreadyCompleted: boolean;
  session: Session;
};

/**
 * Finalize the operational part of a checkout exactly once. Both staff's
 * explicit confirmation and counter settlement can reach this point, so they
 * must not maintain separate copies of the session, vehicle and billing flow.
 */
async function completeCheckingOutSession(
  session: Session,
  inspection: Inspection,
  staffUserId: string,
): Promise<CheckoutCompletionResult> {
  if (session.status === SessionStatus.COMPLETED && inspection.customerConfirmed) {
    return { alreadyCompleted: true, session };
  }

  if (session.status !== SessionStatus.CHECKING_OUT) {
    throw new AppError(
      'Phiên chạy không ở trạng thái chờ xác nhận trả xe',
      400,
      'INVALID_SESSION_STATE',
    );
  }

  inspection.customerConfirmed = true;
  inspection.customerConfirmedAt ??= new Date();
  await AppDataSource.getRepository(Inspection).save(inspection);

  session.status = SessionStatus.COMPLETED;
  const completedAt = new Date();
  session.actualEndAt = completedAt;
  session.checkedOutBy = staffUserId;
  await AppDataSource.getRepository(Session).save(session);

  const sessionVehicles = await AppDataSource.getRepository(SessionVehicle).find({
    where: { sessionId: session.id },
  });
  for (const sessionVehicle of sessionVehicles) {
    // Vehicles already replaced during the session have their own completed
    // handover. Do not change their availability because of this checkout.
    if (sessionVehicle.returnedAt) continue;
    sessionVehicle.status = inspection.damageNoted
      ? SessionVehicleStatus.DAMAGED
      : SessionVehicleStatus.RETURNED;
    sessionVehicle.returnedAt = completedAt;
    await AppDataSource.getRepository(SessionVehicle).save(sessionVehicle);

    if (sessionVehicle.vehicleId) {
      await AppDataSource.getRepository(Vehicle).update(sessionVehicle.vehicleId, {
        status: inspection.damageNoted ? VehicleStatus.MAINTENANCE : VehicleStatus.AVAILABLE,
      });
    }
  }

  if (inspection.damageNoted) {
    const [existingMaintenanceLog] = await AppDataSource.query<{ id: string }[]>(
      `SELECT id FROM vehicle_maintenance_logs WHERE related_session_id = $1 LIMIT 1`,
      [session.id],
    );
    if (!existingMaintenanceLog) {
      await handleVehicleCheckoutMaintenance(session.id, inspection, staffUserId);
    }
  }

  await settleSessionCheckoutBilling(session.id, inspection);
  return { alreadyCompleted: false, session };
}

async function reconcileBookingAfterCheckout(booking: Booking): Promise<{
  allSessionsCompleted: boolean;
  pendingCount: number;
  newlyCompleted: boolean;
}> {
  const sessions = await AppDataSource.getRepository(Session).find({
    where: { bookingId: booking.id },
  });
  const allSessionsCompleted = sessions.every(
    (session) => session.status === SessionStatus.COMPLETED,
  );
  if (!allSessionsCompleted) {
    return { allSessionsCompleted: false, pendingCount: 0, newlyCompleted: false };
  }

  const pendingCount = await AppDataSource.getRepository(PaymentComponent).count({
    where: { bookingId: booking.id, status: PaymentComponentStatus.PENDING },
  });
  if (pendingCount > 0) {
    if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
      await AppDataSource.getRepository(Booking).update(booking.id, {
        status: BookingStatus.AWAITING_PAYMENT,
      });
    }
    return { allSessionsCompleted: true, pendingCount, newlyCompleted: false };
  }

  const newlyCompleted = booking.status !== BookingStatus.COMPLETED;
  if (booking.status === BookingStatus.AWAITING_PAYMENT) {
    await transition(booking.id, 'PAYMENT_SETTLED');
  } else if (booking.status === BookingStatus.CONFIRMED) {
    await transition(booking.id, 'COMPLETE');
  } else if (newlyCompleted) {
    await AppDataSource.getRepository(Booking).update(booking.id, {
      status: BookingStatus.COMPLETED,
    });
  }

  await AppDataSource.getRepository(Booking).update(booking.id, { completedAt: new Date() });
  return { allSessionsCompleted: true, pendingCount: 0, newlyCompleted };
}

async function pushCheckoutCompletedEvents(
  booking: Booking,
  sessionId: string,
  staffUserId?: string | null,
): Promise<void> {
  const payload = {
    sessionId,
    bookingId: booking.id,
    sessionStatus: SessionStatus.COMPLETED,
  };
  if (staffUserId) {
    wsService.pushToUser(staffUserId, 'SESSION_CHECKOUT_COMPLETED', payload);
  }
  if (booking.customerId) {
    wsService.pushToUser(booking.customerId, 'SESSION_CHECKOUT_COMPLETED', payload);
  }
  broadcastSessionUpdated({
    cafeId: booking.cafeId,
    bookingId: booking.id,
    sessionId,
    sessionStatus: SessionStatus.COMPLETED,
    action: 'CHECK_OUT_COMPLETED',
  });
}

// ── STAFF CONFIRM CHECKOUT ────────────────────────────────────────────────────

export async function staffConfirmCheckout(
  sessionId: string,
  inspectionId: string,
  staffUserId: string,
): Promise<any> {
  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (!session) throw new AppError('Phiên chạy không tồn tại', 404, 'SESSION_NOT_FOUND');

  const inspection = await AppDataSource.getRepository(Inspection).findOne({
    where: { id: inspectionId, sessionId },
  });
  if (!inspection) {
    throw new AppError('Biên bản kiểm xe không tồn tại', 404, 'INSPECTION_NOT_FOUND');
  }
  if (inspection.type !== InspectionType.CHECK_OUT) {
    throw new AppError('Biên bản không phải loại CHECK_OUT', 400, 'INVALID_INSPECTION_TYPE');
  }

  const completion = await completeCheckingOutSession(session, inspection, staffUserId);
  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (booking) {
    await reconcileBookingAfterCheckout(booking);
  }
  // Audit trail for contest rental bookings; never blocks checkout completion.
  if (booking?.contestId) {
    try {
      await logContestVehicleCheckedOut(booking, session);
    } catch (error) {
      logger.warn('Staff', 'staffConfirmCheckout: contest checkout audit failed', {
        sessionId,
        bookingId: booking.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  logger.info('Staff', 'staffConfirmCheckout', { sessionId, inspectionId, staffUserId });
  if (booking) {
    void pushCheckoutCompletedEvents(booking, sessionId, staffUserId);
  }
  return {
    success: true,
    sessionId,
    sessionStatus: SessionStatus.COMPLETED,
    alreadyCompleted: completion.alreadyCompleted,
  };
}

// ── STAFF COMPLETE BYOC SESSION (Ends active BYOC session manually) ───────────

export async function completeByocSession(
  sessionId: string,
  staffUserId: string,
): Promise<{ success: boolean; message: string; session: Session }> {
  const sessionRepo = AppDataSource.getRepository(Session);
  const session = await sessionRepo.findOne({ where: { id: sessionId } });
  if (!session) throw new AppError('Phiên chơi không tồn tại', 404, 'SESSION_NOT_FOUND');

  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: session.bookingId },
  });
  if (!booking) throw new AppError('Đơn đặt không tồn tại', 404, 'BOOKING_NOT_FOUND');

  if (booking.playMode !== 'BYOC') {
    throw new AppError(
      'Chức năng này chỉ áp dụng cho đơn mang xe cá nhân (BYOC)',
      400,
      'NOT_BYOC_BOOKING',
    );
  }

  if (session.status === SessionStatus.COMPLETED) {
    return { success: true, message: 'Phiên chơi đã hoàn tất từ trước', session };
  }

  // Check if there are any pending payment components
  const pendingCount = await AppDataSource.getRepository(PaymentComponent).count({
    where: { bookingId: booking.id, status: PaymentComponentStatus.PENDING },
  });
  if (pendingCount > 0) {
    throw new AppError(
      'Còn chi phí phát sinh chưa thanh toán. Vui lòng quyết toán trước khi kết thúc phiên chơi.',
      400,
      'PENDING_PAYMENTS_EXIST',
    );
  }

  session.status = SessionStatus.COMPLETED;
  session.actualEndAt = new Date();
  session.checkedOutBy = staffUserId;
  await sessionRepo.save(session);

  // Mark all session vehicles as RETURNED
  const svRepo = AppDataSource.getRepository(SessionVehicle);
  const sessionVehicles = await svRepo.find({ where: { sessionId: session.id } });
  for (const sv of sessionVehicles) {
    sv.status = SessionVehicleStatus.RETURNED;
    sv.returnedAt = new Date();
    await svRepo.save(sv);
  }

  // Reconcile booking status
  await reconcileBookingAfterCheckout(booking);
  void pushCheckoutCompletedEvents(booking, session.id, staffUserId);

  const shortRef = booking.id.substring(0, 8).toUpperCase();
  if (booking.customerId) {
    await createNotification(
      booking.customerId,
      NotificationType.CUSTOMER_CHECKOUT_CONFIRMED,
      'Phiên chơi đã kết thúc',
      `Phiên chơi cho đơn đặt #${shortRef} đã được hoàn tất thành công. Cảm ơn bạn đã trải nghiệm tại RCField!`,
      {
        bookingId: booking.id,
        sessionId: session.id,
        route: `/booking/${booking.id}`,
      },
    ).catch(() => {});
    wsService.pushToUser(booking.customerId, 'SESSION_CHECKOUT_COMPLETED', {
      bookingId: booking.id,
      sessionId: session.id,
      completedAt: session.actualEndAt,
    });
  }

  return { success: true, message: 'Kết thúc phiên chơi thành công', session };
}

// ── UPDATE DAMAGE LINE ITEMS (staff edits before confirming) ─────────────────

export async function updateDamageLineItems(
  sessionId: string,
  inspectionId: string,
  damageLineItems: {
    partType: DamagePartType;
    customPartName?: string;
    partsPrice: number;
    laborPrice?: number;
  }[],
  checklist?: { itemKey?: string; itemLabel: string; status: string; note?: string | null }[],
  staffNotes?: string,
): Promise<{
  inspectionId: string;
  damageLineItems: Array<{
    id: string;
    partType: DamagePartType;
    customPartName: string | null;
    partsPrice: number;
    laborPrice: number;
    lineTotal: number;
  }>;
  totalDamageCharge: number;
  checklist?: InspectionChecklist[];
  staffNotes?: string;
}> {
  const inspRepo = AppDataSource.getRepository(Inspection);
  const inspection = await inspRepo.findOne({ where: { id: inspectionId, sessionId } });
  if (!inspection)
    throw new AppError('Biên bản kiểm xe không tồn tại', 404, 'INSPECTION_NOT_FOUND');

  const liRepo = AppDataSource.getRepository(DamageLineItem);
  const existing = await liRepo.find({ where: { inspectionId } });
  for (const item of existing) {
    await liRepo.softDelete(item.id);
  }

  const saved: DamageLineItem[] = [];
  for (const li of damageLineItems) {
    const item = liRepo.create({
      inspectionId,
      partType: li.partType,
      customPartName: li.customPartName ?? null,
      partsPrice: li.partsPrice,
      laborPrice: li.laborPrice ?? 0,
    });
    saved.push(await liRepo.save(item));
  }

  const totalDamageCharge = saved.reduce(
    (sum, li) => sum + Number(li.partsPrice) + Number(li.laborPrice),
    0,
  );

  inspection.damageNoted = saved.length > 0;
  if (typeof staffNotes === 'string') {
    inspection.damageDescription = staffNotes || null;
  }
  await inspRepo.save(inspection);

  const clRepo = AppDataSource.getRepository(InspectionChecklist);

  let targetChecklist = checklist;
  if (!targetChecklist || targetChecklist.length === 0) {
    const damageTypes = new Set(saved.map((d) => d.partType));
    targetChecklist = [
      {
        itemKey: 'ck-chassis',
        itemLabel: 'Khung gầm xe (nứt, gãy, cong vênh, biến dạng)',
        status: damageTypes.has(DamagePartType.CHASSIS) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.CHASSIS) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-shell',
        itemLabel: 'Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)',
        status: damageTypes.has(DamagePartType.SHELL) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.SHELL) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-spoiler',
        itemLabel: 'Cánh gió (gãy, biến dạng, rơi rụng)',
        status: damageTypes.has(DamagePartType.SPOILER) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.SPOILER) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-tire',
        itemLabel: 'Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)',
        status: damageTypes.has(DamagePartType.TIRE_WHEEL) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.TIRE_WHEEL) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-motor',
        itemLabel: 'Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)',
        status: damageTypes.has(DamagePartType.MOTOR) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.MOTOR) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-servo',
        itemLabel: 'Hệ thống lái / Servo (kẹt góc, trượt bánh răng)',
        status: damageTypes.has(DamagePartType.SERVO) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.SERVO) ? 'Phát hiện hư hại' : '',
      },
      {
        itemKey: 'ck-remote',
        itemLabel: 'Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)',
        status: damageTypes.has(DamagePartType.REMOTE) ? 'BROKEN' : 'OK',
        note: damageTypes.has(DamagePartType.REMOTE) ? 'Phát hiện hư hại' : '',
      },
    ];
  }

  await clRepo.delete({ inspectionId });
  const updatedChecklist: InspectionChecklist[] = [];
  for (const item of targetChecklist) {
    const c = new InspectionChecklist();
    c.inspectionId = inspectionId;
    c.itemKey = item.itemKey || item.itemLabel;
    c.itemLabel = item.itemLabel;
    let itemStatus: InspectionItemStatus = InspectionItemStatus.OK;
    if (item.status === 'BROKEN' || item.status === 'DAMAGED' || item.status === 'NOT_OK') {
      itemStatus = InspectionItemStatus.BROKEN;
    } else if (item.status === 'SCRATCHED') {
      itemStatus = InspectionItemStatus.SCRATCHED;
    } else if (item.status === 'MISSING') {
      itemStatus = InspectionItemStatus.MISSING;
    } else if (item.status === 'DIRTY') {
      itemStatus = InspectionItemStatus.DIRTY;
    } else if (item.status === 'NEEDS_REVIEW') {
      itemStatus = InspectionItemStatus.NEEDS_REVIEW;
    }
    c.status = itemStatus;
    c.note =
      itemStatus === InspectionItemStatus.OK ? null : (item.note ?? (item as any).notes ?? null);
    updatedChecklist.push(await clRepo.save(c));
  }

  // Sync billing and DAMAGE_CHARGE component amount to match updated line items
  await settleSessionCheckoutBilling(sessionId, inspection);

  const session = await AppDataSource.getRepository(Session).findOne({ where: { id: sessionId } });
  if (session) {
    broadcastSessionUpdated({
      cafeId: session.cafeId,
      bookingId: session.bookingId,
      sessionId,
      sessionStatus: session.status,
      action: 'INSPECTION_UPDATED',
    });

    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: session.bookingId },
    });
    if (booking?.customerId) {
      wsService.pushToUser(booking.customerId, 'SESSION_CHECKOUT_INSPECTION', {
        sessionId,
        bookingId: session.bookingId,
        inspectionId,
        type: inspection.type,
        action: 'INSPECTION_UPDATED',
        totalDamageCharge,
        damageFlagged: saved.length > 0,
      });
    }
  }

  return {
    inspectionId,
    damageLineItems: saved.map((li) => ({
      id: li.id,
      partType: li.partType,
      customPartName: li.customPartName,
      partsPrice: Number(li.partsPrice),
      laborPrice: Number(li.laborPrice),
      lineTotal: Number(li.partsPrice) + Number(li.laborPrice),
    })),
    totalDamageCharge,
    checklist: updatedChecklist,
    staffNotes: inspection.damageDescription || '',
  };
}

export async function settleSessionCheckoutBilling(
  sessionId: string,
  inspection: Inspection | null,
): Promise<void> {
  const sessionRepo = AppDataSource.getRepository(Session);
  const session = await sessionRepo.findOne({ where: { id: sessionId } });
  if (!session) return;

  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: session.bookingId } });
  if (!booking) return;

  const compRepo = AppDataSource.getRepository(PaymentComponent);

  // 1. Fetch existing payment components (prepaid)
  const existingComponents = await compRepo.find({ where: { bookingId: booking.id } });

  // 2. Fetch approved extensions → Service consumption fee
  const extensions = await AppDataSource.getRepository(ExtensionProposal).find({
    where: { sessionId: session.id, status: ExtensionProposalStatus.APPROVED },
  });
  const totalExtensionFee = extensions.reduce((sum, ext) => sum + Number(ext.feeAmount), 0);

  // 3. Fetch on-site F&B orders → Service consumption fee
  const onsiteFnbs = (
    await AppDataSource.getRepository(FnbOrder).find({
      where: { sessionId: session.id, orderType: FnbOrderType.ON_SITE },
    })
  ).filter((order) => order.status !== FnbOrderStatus.CANCELLED);
  const totalOnsiteFnb = onsiteFnbs.reduce((sum, fnb) => sum + Number(fnb.totalAmount), 0);

  // 4. Calculate damage charge from checkout inspection → Asset protection fee
  let damageCharge = 0;
  if (inspection && inspection.type === InspectionType.CHECK_OUT && inspection.damageNoted) {
    const lineItems = await AppDataSource.getRepository(DamageLineItem).find({
      where: { inspectionId: inspection.id },
    });
    if (lineItems.length > 0) {
      damageCharge = lineItems.reduce(
        (sum, li) => sum + Number(li.partsPrice) + Number(li.laborPrice),
        0,
      );
    }
  }

  // ── DEPOSIT RECONCILIATION (Asset Protection Only) ────────────────────────
  // The security deposit ONLY offsets vehicle damage charges.
  // F&B and extension fees are separate service consumption bills → counter payment.
  const depositComp = existingComponents.find(
    (c) => c.type === PaymentComponentType.SECURITY_DEPOSIT,
  );
  const depositAmount = depositComp ? Number(depositComp.amount) : 0;

  // How much of the deposit is consumed to cover vehicle damage?
  const depositConsumedByDamage = Math.min(depositAmount, damageCharge);
  // How much deposit remains to be returned to the customer?
  const depositRefundAmount = depositAmount - depositConsumedByDamage;
  // How much vehicle damage exceeds the deposit (customer pays extra at counter)?
  const damageExceedingDeposit = Math.max(0, damageCharge - depositAmount);

  // Update deposit component: mark as PENDING_REFUND (awaiting Staff counter confirmation)
  if (depositComp) {
    if (depositConsumedByDamage === depositAmount) {
      // Deposit fully consumed by damage — no refund
      depositComp.status = PaymentComponentStatus.DISBURSED;
      depositComp.refundedAmount = 0;
    } else {
      // Partial or full refund due — Staff must hand back cash/confirm
      depositComp.status = PaymentComponentStatus.PENDING_REFUND;
      depositComp.refundedAmount = depositRefundAmount;
    }
    await compRepo.save(depositComp);
  }

  // ── SERVICE CONSUMPTION BILL (Counter Payment) ────────────────────────────
  // Total the customer owes at the counter:
  //   F&B onsite + Extension fees + damage amount that exceeds the deposit
  const totalCounterBill = totalExtensionFee + totalOnsiteFnb + damageExceedingDeposit;

  // Create individual PENDING components for each service fee
  const newComponents: Partial<PaymentComponent>[] = [];

  if (totalExtensionFee > 0) {
    const extensionComponents = existingComponents.filter(
      (c) => c.type === PaymentComponentType.EXTENSION_FEE,
    );
    const paidExtensionFee = extensionComponents
      .filter((c) => c.status !== PaymentComponentStatus.PENDING)
      .reduce((sum, c) => sum + Number(c.amount), 0);
    const remainingPendingFee = totalExtensionFee - paidExtensionFee;

    const pendingExtensionComp = extensionComponents.find(
      (c) => c.status === PaymentComponentStatus.PENDING,
    );

    if (remainingPendingFee <= 0) {
      if (pendingExtensionComp) {
        await compRepo.remove(pendingExtensionComp);
      }
    } else {
      if (pendingExtensionComp) {
        pendingExtensionComp.amount = remainingPendingFee;
        await compRepo.save(pendingExtensionComp);
      } else {
        newComponents.push({
          bookingId: booking.id,
          type: PaymentComponentType.EXTENSION_FEE,
          amount: remainingPendingFee,
          status: PaymentComponentStatus.PENDING,
        });
      }
    }
  }

  if (totalOnsiteFnb > 0) {
    const onsiteFnbComponents = existingComponents.filter(
      (c) => c.type === PaymentComponentType.FNB_ON_SITE,
    );
    const paidOnsiteFnb = onsiteFnbComponents
      .filter((c) => c.status !== PaymentComponentStatus.PENDING)
      .reduce((sum, c) => sum + Number(c.amount), 0);
    const remainingPendingFnb = Math.max(0, totalOnsiteFnb - paidOnsiteFnb);

    const pendingOnsiteFnbComp = onsiteFnbComponents.find(
      (c) => c.status === PaymentComponentStatus.PENDING,
    );

    if (remainingPendingFnb <= 0) {
      if (pendingOnsiteFnbComp) {
        await compRepo.remove(pendingOnsiteFnbComp);
      }
    } else {
      if (pendingOnsiteFnbComp) {
        pendingOnsiteFnbComp.amount = remainingPendingFnb;
        await compRepo.save(pendingOnsiteFnbComp);
      } else {
        newComponents.push({
          bookingId: booking.id,
          type: PaymentComponentType.FNB_ON_SITE,
          amount: remainingPendingFnb,
          status: PaymentComponentStatus.PENDING,
        });
      }
    }
  }

  // Damage amount that exceeds deposit is billed separately at counter
  const damageComp = existingComponents.find((c) => c.type === PaymentComponentType.DAMAGE_CHARGE);
  if (damageExceedingDeposit > 0) {
    if (damageComp) {
      if (
        damageComp.status === PaymentComponentStatus.PENDING ||
        damageComp.status === PaymentComponentStatus.DISBURSED
      ) {
        damageComp.amount = damageExceedingDeposit;
        damageComp.status = PaymentComponentStatus.PENDING;
        await compRepo.save(damageComp);
      }
    } else {
      newComponents.push({
        bookingId: booking.id,
        type: PaymentComponentType.DAMAGE_CHARGE,
        amount: damageExceedingDeposit,
        status: PaymentComponentStatus.PENDING,
      });
    }
  } else if (damageCharge > 0 && damageExceedingDeposit === 0) {
    // Damage fully covered by deposit — still record the component for audit
    if (damageComp) {
      if (
        damageComp.status === PaymentComponentStatus.PENDING ||
        damageComp.status === PaymentComponentStatus.DISBURSED
      ) {
        damageComp.amount = damageCharge;
        damageComp.status = PaymentComponentStatus.DISBURSED; // Covered by deposit, nothing more to pay
        await compRepo.save(damageComp);
      }
    } else {
      newComponents.push({
        bookingId: booking.id,
        type: PaymentComponentType.DAMAGE_CHARGE,
        amount: damageCharge,
        status: PaymentComponentStatus.DISBURSED, // Covered by deposit, nothing more to pay
      });
    }
  } else if (damageCharge === 0 && damageComp) {
    // Damage was removed or edited to 0
    if (damageComp.status === PaymentComponentStatus.PENDING) {
      await compRepo.remove(damageComp);
    }
  }

  if (newComponents.length > 0) {
    await AppDataSource.transaction(async (em) => {
      for (const comp of newComponents) {
        await em.save(compRepo.create(comp));
      }
    });
  }

  // Store settlement summary on session for quick UI retrieval
  session.notes = JSON.stringify({
    ...(session.notes ? JSON.parse(session.notes) : {}),
    settlement: {
      depositAmount,
      depositConsumedByDamage,
      depositRefundAmount,
      damageCharge,
      totalExtensionFee,
      totalOnsiteFnb,
      damageExceedingDeposit,
      totalCounterBill,
      netCounterAmount: totalCounterBill - depositRefundAmount,
    },
  });
  await sessionRepo.save(session);
}

export async function settlePendingPayments(bookingId: string, staffUserId: string): Promise<any> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: bookingId } });
  if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  const compRepo = AppDataSource.getRepository(PaymentComponent);
  const txRepo = AppDataSource.getRepository(PaymentTransaction);
  const sessionForNotification = await AppDataSource.getRepository(Session).findOne({
    where: { bookingId },
    order: { createdAt: 'DESC' },
  });

  // Ràng buộc thứ tự: Chặn Staff thu tiền khi ca chơi chưa hoàn tất kiểm tra trả xe (đối với đơn RENTAL)
  if (
    sessionForNotification &&
    booking.playMode !== 'BYOC' &&
    [SessionStatus.ACTIVE, SessionStatus.EXTENDING].includes(sessionForNotification.status)
  ) {
    throw new AppError(
      'Khách hàng đang trong ca chơi. Vui lòng thực hiện BƯỚC 1: KIỂM TRA TRẢ XE trước khi quyết toán thu tiền.',
      400,
      'SESSION_NOT_CHECKED_OUT',
    );
  }

  let checkoutWasCompletedDuringSettlement = false;
  let completedSessionIdDuringSettlement: string | undefined;
  if (sessionForNotification && sessionForNotification.status === SessionStatus.CHECKING_OUT) {
    const inspection = await AppDataSource.getRepository(Inspection).findOne({
      where: { sessionId: sessionForNotification.id, type: InspectionType.CHECK_OUT },
    });

    if (inspection) {
      const completion = await completeCheckingOutSession(
        sessionForNotification,
        inspection,
        staffUserId,
      );
      checkoutWasCompletedDuringSettlement = !completion.alreadyCompleted;
      if (!completion.alreadyCompleted) {
        completedSessionIdDuringSettlement = sessionForNotification.id;
      }
    }
  }

  // ── FLOW 1: DEPOSIT REFUND ────────────────────────────────────────────────
  // Finalize the deposit component: Staff confirms they physically returned the
  // refund amount to the customer. Move from PENDING_REFUND → REFUNDED / PARTIALLY_REFUNDED.
  const depositComp = await compRepo.findOne({
    where: { bookingId, type: PaymentComponentType.SECURITY_DEPOSIT },
  });
  const pendingComponents = await compRepo.find({
    where: { bookingId, status: PaymentComponentStatus.PENDING },
  });
  const hasPendingRefund = depositComp?.status === PaymentComponentStatus.PENDING_REFUND;

  if (!hasPendingRefund && pendingComponents.length === 0) {
    if (checkoutWasCompletedDuringSettlement) {
      await reconcileBookingAfterCheckout(booking);
      if (completedSessionIdDuringSettlement) {
        void pushCheckoutCompletedEvents(booking, completedSessionIdDuringSettlement, staffUserId);
      }
      return {
        success: true,
        bookingId,
        noAdditionalSettlement: true,
        totalCounterBill: 0,
        depositRefundAmount: 0,
        netCounterAmount: 0,
      };
    }
    throw new AppError(
      'Đơn này không còn khoản thanh toán hoặc hoàn tiền cần xử lý',
      409,
      'NO_PENDING_SETTLEMENT',
    );
  }

  let depositRefundAmount = 0;
  if (depositComp && depositComp.status === PaymentComponentStatus.PENDING_REFUND) {
    depositRefundAmount = Number(depositComp.refundedAmount) || 0;
    const depositTotal = Number(depositComp.amount);
    const consumed = depositTotal - depositRefundAmount;

    if (consumed === 0) {
      // No damage at all — full deposit returned
      depositComp.status = PaymentComponentStatus.REFUNDED;
    } else {
      // Partial deduction for vehicle damage
      depositComp.status = PaymentComponentStatus.PARTIALLY_REFUNDED;
    }
    depositComp.refundedAt = new Date();
    await compRepo.save(depositComp);

    // Record REFUND transaction for audit (amount = what was physically returned)
    if (depositRefundAmount > 0) {
      const refundRef = `dref_${bookingId.replace(/-/g, '').substring(0, 22)}_${Date.now().toString().slice(-4)}`;
      await txRepo.save(
        txRepo.create({
          bookingId,
          type: PaymentTransactionType.REFUND,
          gateway: 'DIRECT',
          txnRef: refundRef,
          amount: depositRefundAmount,
          status: PaymentTransactionStatus.SUCCESS,
          rawRequest: { depositRefund: true },
          rawResponse: {
            settledAt: new Date().toISOString(),
            depositTotal: depositComp.amount,
            consumed,
            refunded: depositRefundAmount,
          },
        }),
      );
    }
  }

  // ── FLOW 2: SERVICE SETTLEMENT (Counter Payment) ──────────────────────────
  // Collect all PENDING service components (F&B, Extension, Damage-exceeding-deposit)
  const totalCounterBill = pendingComponents.reduce((sum, c) => sum + Number(c.amount), 0);

  // Net amount the customer actually hands over at the counter:
  //   They owe totalCounterBill but get back depositRefundAmount in cash.
  //   Staff collects: totalCounterBill - depositRefundAmount (or adds change if negative)
  const netCounterAmount = totalCounterBill - depositRefundAmount;

  await AppDataSource.transaction(async (em) => {
    // Mark all service components as DISBURSED (paid at counter)
    for (const comp of pendingComponents) {
      comp.status = PaymentComponentStatus.DISBURSED;
      await em.save(comp);
    }

    // Record PAYMENT/DIRECT transaction only if there's an actual service bill
    if (totalCounterBill > 0) {
      const ctrRef = `ctr_${bookingId.replace(/-/g, '').substring(0, 22)}_${Date.now().toString().slice(-4)}`;
      await em.save(
        txRepo.create({
          bookingId,
          type: PaymentTransactionType.PAYMENT,
          gateway: 'DIRECT',
          txnRef: ctrRef,
          amount: totalCounterBill,
          status: PaymentTransactionStatus.SUCCESS,
          rawRequest: {
            counterSettlement: true,
            additionalPayment: true,
            components: pendingComponents.map((component) => ({
              id: component.id,
              type: component.type,
              amount: Number(component.amount),
            })),
          },
          rawResponse: {
            settledAt: new Date().toISOString(),
            totalCounterBill,
            depositRefundAmount,
            netCounterAmount,
          },
        }),
      );
    }
  });

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  try {
    const shortRef = booking.id.substring(0, 8).toUpperCase();
    const isSessionFinished =
      !sessionForNotification || sessionForNotification.status === SessionStatus.COMPLETED;
    const customerTitle = isSessionFinished ? 'Thanh toán thành công' : 'Ghi nhận thanh toán';
    const customerMessage = isSessionFinished
      ? `Đơn đặt #${shortRef} đã được quyết toán hoàn tất tại quầy.`
      : `Đã ghi nhận thanh toán ${totalCounterBill.toLocaleString('vi-VN')} đ phí phát sinh tại quầy cho đơn đặt #${shortRef}. Chúc bạn tiếp tục có trải nghiệm chơi vui vẻ!`;
    const staffTitle = isSessionFinished ? 'Quyết toán hoàn tất' : 'Đã thu phí phát sinh';
    const staffMessage = isSessionFinished
      ? `Đơn đặt #${shortRef} đã được quyết toán thành công.`
      : `Đã ghi nhận thu ${totalCounterBill.toLocaleString('vi-VN')} đ phí phát sinh cho đơn đặt #${shortRef}. Phiên chơi đang tiếp tục.`;

    if (booking.customerId) {
      await createNotification(
        booking.customerId,
        NotificationType.CUSTOMER_PAYMENT_CONFIRMED,
        customerTitle,
        customerMessage,
        {
          bookingId,
          totalCounterBill,
          depositRefundAmount,
          netCounterAmount,
          route: `/booking/${bookingId}`,
        },
      );
      wsService.pushToUser(booking.customerId, 'CUSTOMER_PAYMENT_CONFIRMED', {
        bookingId,
        totalCounterBill,
        depositRefundAmount,
        netCounterAmount,
      });
    }
    await createNotification(
      staffUserId,
      NotificationType.CUSTOMER_PAYMENT_CONFIRMED,
      staffTitle,
      staffMessage,
      {
        bookingId,
        ...(sessionForNotification
          ? {
              sessionId: sessionForNotification.id,
              route: `/staff/sessions/${sessionForNotification.id}`,
            }
          : {}),
        totalCounterBill,
        depositRefundAmount,
        netCounterAmount,
      },
    );
    wsService.pushToUser(staffUserId, 'CUSTOMER_PAYMENT_CONFIRMED', {
      bookingId,
      ...(sessionForNotification ? { sessionId: sessionForNotification.id } : {}),
      totalCounterBill,
      depositRefundAmount,
      netCounterAmount,
    });
  } catch (err) {
    logger.error('SettlePendingNotification', 'Failed to notify', err);
  }

  wsService.pushToCafe(booking.cafeId, 'BOOKING_PAYMENT_UPDATED', {
    bookingId,
    cafeId: booking.cafeId,
    ...(sessionForNotification ? { sessionId: sessionForNotification.id } : {}),
    action: 'COUNTER_PAYMENT_SETTLED',
    updatedAt: new Date().toISOString(),
  });

  const bookingReconciliation = await reconcileBookingAfterCheckout(booking);
  if (completedSessionIdDuringSettlement) {
    void pushCheckoutCompletedEvents(booking, completedSessionIdDuringSettlement, staffUserId);
  }
  if (bookingReconciliation.newlyCompleted) {
    await notifyCustomerToReviewBooking(booking).catch(() => {});
  }

  return {
    success: true,
    depositRefundAmount,
    totalCounterBill,
    netCounterAmount,
    settledComponents: pendingComponents.length,
  };
}

export async function createWalkInBooking(
  staffId: string,
  cafeId: string,
  body: any,
): Promise<any> {
  return createWalkInBookingService(staffId, cafeId, body);
}

export async function initiateWalkInSettleBankTransfer(
  staffId: string,
  cafeId: string,
  bookingId: string,
): Promise<{
  success: boolean;
  bookingId: string;
  amount: number;
  bankTransfer: BankTransferCheckout;
}> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: bookingId, cafeId } });
  if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

  if (booking.playMode !== 'BYOC') {
    const uncompletedSession = await AppDataSource.getRepository(Session).findOne({
      where: {
        bookingId,
        status: In([
          SessionStatus.CHECKED_IN,
          SessionStatus.ACTIVE,
          SessionStatus.EXTENDING,
          SessionStatus.CHECKING_OUT,
        ]),
      },
    });

    if (uncompletedSession) {
      throw new AppError(
        'Vui lòng thực hiện BƯỚC 1: XÁC NHẬN TRẢ XE trước khi mở thanh toán chuyển khoản quyết toán.',
        400,
        'SESSION_NOT_CHECKED_OUT',
      );
    }
  }

  const compRepo = AppDataSource.getRepository(PaymentComponent);
  const allPendingComponents = await compRepo.find({
    where: { bookingId, status: PaymentComponentStatus.PENDING },
  });

  const pendingComponents = allPendingComponents.filter((c) =>
    [
      PaymentComponentType.FNB_ON_SITE,
      PaymentComponentType.EXTENSION_FEE,
      PaymentComponentType.DAMAGE_CHARGE,
    ].includes(c.type),
  );

  const totalCharged = pendingComponents.reduce((sum, c) => sum + Number(c.amount), 0);
  if (totalCharged <= 0) {
    throw new AppError(
      'Không có khoản thanh toán phát sinh nào cần xử lý',
      400,
      'NO_PENDING_ADDITIONAL_FEES',
    );
  }

  const paymentRefCode = await allocatePaymentRefCode();
  const qrExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const bankTransfer = await buildBankTransferCheckout({
    cafeId: booking.cafeId,
    amount: totalCharged,
    refCode: paymentRefCode,
    expiresAt: qrExpiresAt,
  });

  const txRepo = AppDataSource.getRepository(PaymentTransaction);
  const txnRef = `ctr_${bookingId.replace(/-/g, '').substring(0, 18)}_${Date.now().toString().slice(-4)}`;

  const tx = txRepo.create({
    bookingId,
    customerPackageId: null,
    contestRegistrationId: null,
    subjectType: PaymentTransactionSubjectType.BOOKING,
    type: PaymentTransactionType.PAYMENT,
    gateway: 'VIETQR',
    txnRef,
    paymentRefCode,
    amount: totalCharged,
    status: PaymentTransactionStatus.PENDING,
    rawRequest: {
      bookingId,
      totalCharged,
      additionalPayment: true,
      initiatedByStaffId: staffId,
      qrExpiresAt: qrExpiresAt.toISOString(),
      bankTransfer,
    },
  });
  await txRepo.save(tx);

  return {
    success: true,
    bookingId,
    amount: totalCharged,
    bankTransfer,
  };
}

export async function confirmWalkInBankTransfer(
  staffId: string,
  cafeId: string,
  bookingId: string,
): Promise<{ success: boolean; bookingId: string; status: string }> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({
    where: { id: bookingId, cafeId },
  });
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const compRepo = AppDataSource.getRepository(PaymentComponent);
  const allPendingComponents = await compRepo.find({
    where: { bookingId: booking.id, status: PaymentComponentStatus.PENDING },
  });
  const pendingComponents = allPendingComponents.filter((c) =>
    [
      PaymentComponentType.FNB_ON_SITE,
      PaymentComponentType.EXTENSION_FEE,
      PaymentComponentType.DAMAGE_CHARGE,
    ].includes(c.type),
  );

  const sessionForNotification = await AppDataSource.getRepository(Session).findOne({
    where: { bookingId },
    order: { createdAt: 'DESC' },
  });

  if (
    sessionForNotification &&
    booking.playMode !== 'BYOC' &&
    [SessionStatus.ACTIVE, SessionStatus.EXTENDING].includes(sessionForNotification.status)
  ) {
    throw new AppError(
      'Khách hàng đang trong ca chơi. Vui lòng thực hiện BƯỚC 1: KIỂM TRA TRẢ XE trước khi quyết toán thu tiền.',
      400,
      'SESSION_NOT_CHECKED_OUT',
    );
  }

  let checkoutWasCompleted = false;
  let completedSessionId: string | undefined;

  await AppDataSource.transaction(async (em) => {
    if (booking.status === BookingStatus.PENDING) {
      booking.status = BookingStatus.CONFIRMED;
      await em.save(booking);
    }

    const txRepo = em.getRepository(PaymentTransaction);
    const tx = await txRepo.findOne({
      where: {
        bookingId: booking.id,
        type: PaymentTransactionType.PAYMENT,
        status: PaymentTransactionStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
    if (tx) {
      tx.status = PaymentTransactionStatus.SUCCESS;
      tx.rawResponse = {
        ...((tx.rawResponse as Record<string, unknown>) || {}),
        manualConfirmedByStaffId: staffId,
        manualConfirmedAt: new Date().toISOString(),
      };
      await txRepo.save(tx);
    }

    for (const comp of pendingComponents) {
      comp.status = PaymentComponentStatus.DISBURSED;
      await em.save(comp);
    }

    if (sessionForNotification && sessionForNotification.status === SessionStatus.CHECKING_OUT) {
      const inspection = await em.getRepository(Inspection).findOne({
        where: { sessionId: sessionForNotification.id, type: InspectionType.CHECK_OUT },
      });
      if (inspection) {
        const completion = await completeCheckingOutSession(
          sessionForNotification,
          inspection,
          staffId,
        );
        checkoutWasCompleted = !completion.alreadyCompleted;
        if (!completion.alreadyCompleted) {
          completedSessionId = sessionForNotification.id;
        }
      }
    }
  });

  if (checkoutWasCompleted) {
    await reconcileBookingAfterCheckout(booking);
    if (completedSessionId) {
      void pushCheckoutCompletedEvents(booking, completedSessionId, staffId);
    }
  }

  try {
    wsService.pushToCafe(cafeId, 'BOOKING_PAYMENT_UPDATED', {
      bookingId: booking.id,
      status: booking.status,
      paymentStatus: 'PAID',
    });
    if (booking.customerId) {
      wsService.pushToUser(booking.customerId, 'CUSTOMER_PAYMENT_CONFIRMED', {
        bookingId: booking.id,
        status: booking.status,
      });
    }
  } catch (err) {
    logger.warn('StaffService', `Failed to emit payment WS event: ${err}`);
  }

  return { success: true, bookingId: booking.id, status: booking.status };
}

const PART_TYPE_VIETNAMESE: Record<string, string> = {
  TIRE_WHEEL: 'Bánh xe / Lốp',
  SPOILER: 'Cánh gió',
  CHASSIS: 'Khung gầm',
  MOTOR: 'Motor / Động cơ',
  SHELL: 'Vỏ nhựa (Shell)',
  SERVO: 'Servo / Tay lái',
  REMOTE: 'Remote / Điều khiển',
  OTHER: 'Khác',
};

export interface StaffMaintenanceLogItem {
  logId: string;
  logCode: string;
  vehicleId: string;
  vehicleIdentifier: string;
  vehicleName: string;
  vehicleImageUrl?: string;
  cafeId: string;
  cafeName: string;
  categoryId: string;
  categoryName: string;
  categoryTier: string;
  issueDescription: string;
  staffNotes: string | null;
  cost: number;
  performedBy: string | null;
  status: 'SENT_TO_PROVIDER' | 'PENDING_REPAIR' | 'RECEIVED' | 'COMPLETED';
  createdAt: string;
  completedAt: string | null;
  inspectionPhotos?: { angle: string; url: string }[];
  damagedChecklist?: { itemKey: string; itemLabel: string; status: string; note: string }[];
}

export async function getMaintenanceLogs(
  cafeId: string,
  status?: string,
  search?: string,
): Promise<StaffMaintenanceLogItem[]> {
  await AppDataSource.query(
    `ALTER TABLE vehicle_maintenance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING_REPAIR'`,
  );

  const params: any[] = [cafeId];
  let statusClause = '';
  let searchClause = '';

  if (status && status !== 'ALL') {
    params.push(status);
    statusClause = `AND (COALESCE(vml.status, CASE WHEN v.status = 'AVAILABLE' THEN 'COMPLETED' ELSE 'PENDING_REPAIR' END) = $${params.length})`;
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const idx = params.length;
    searchClause = `AND (
      LOWER(v.identifier) LIKE $${idx} OR 
      LOWER(vc.name) LIKE $${idx} OR 
      LOWER(vml.description) LIKE $${idx} OR 
      LOWER(vml.id::text) LIKE $${idx}
    )`;
  }

  const rows = await AppDataSource.query<any[]>(
    `SELECT 
       COALESCE(vml.id::text, v.id::text) AS "logId",
       COALESCE(
         vml.status,
         CASE WHEN v.status = 'AVAILABLE' THEN 'COMPLETED' ELSE 'PENDING_REPAIR' END
       ) AS "status",
       COALESCE(vml.type, 'REPAIR') AS "type",
       COALESCE(vml.description, 'Xe ghi nhận hư hỏng cần bảo trì.') AS "issueDescription",
       COALESCE(vml.cost, 0) AS "cost",
       vml.performed_at AS "performedAt",
       COALESCE(vml.created_at, v.updated_at, NOW()) AS "createdAt",
       u_staff.full_name AS "performedBy",
       
       v.id AS "vehicleId",
       v.identifier AS "vehicleIdentifier",
       v.status AS "vehicleStatus",
       v.distinctive_image_url AS "vehicleImageUrl",
       
       c.id AS "cafeId",
       c.name AS "cafeName",
       
       vc.id AS "categoryId",
       vc.name AS "categoryName",
       vc.tier AS "categoryTier",

       (
         SELECT i.id
         FROM inspections i
         LEFT JOIN session_vehicles sv ON sv.session_id = i.session_id
         WHERE (i.session_id = vml.related_session_id OR sv.vehicle_id = v.id)
           AND i.type = 'CHECK_OUT'
         ORDER BY i.created_at DESC
         LIMIT 1
       ) AS "inspectionId"
     FROM vehicles v
     JOIN cafes c ON v.cafe_id = c.id
     LEFT JOIN vehicle_catalogs vc ON v.catalog_id = vc.id
     LEFT JOIN vehicle_maintenance_logs vml ON vml.vehicle_id = v.id
     LEFT JOIN users u_staff ON vml.performed_by = u_staff.id
     WHERE v.deleted_at IS NULL
       AND c.id = $1
       AND (vml.id IS NOT NULL OR v.status = 'MAINTENANCE')
       ${statusClause}
       ${searchClause}
     ORDER BY COALESCE(vml.created_at, v.updated_at) DESC`,
    params,
  );

  const result: StaffMaintenanceLogItem[] = [];

  for (const row of rows) {
    let photos: { angle: string; url: string }[] = [];
    let damagedChecklist: { itemKey: string; itemLabel: string; status: string; note: string }[] =
      [];
    let damageLineItems: {
      partType: string;
      customPartName?: string;
      partsPrice: number;
      laborPrice: number;
    }[] = [];
    let inspectionNote = '';

    if (row.inspectionId) {
      const photosRows = await AppDataSource.query<any[]>(
        `SELECT angle, url FROM inspection_photos WHERE inspection_id = $1`,
        [row.inspectionId],
      );
      photos = photosRows;

      const checklistRows = await AppDataSource.query<any[]>(
        `SELECT item_key AS "itemKey", item_label AS "itemLabel", status, note FROM inspection_checklists WHERE inspection_id = $1 AND status != 'OK'`,
        [row.inspectionId],
      );
      damagedChecklist = checklistRows.map((c) => ({
        ...c,
        itemLabel: PART_TYPE_VIETNAMESE[c.itemKey] || c.itemLabel || c.itemKey,
      }));

      const lineItemsRows = await AppDataSource.query<any[]>(
        `SELECT part_type AS "partType", custom_part_name AS "customPartName", parts_price AS "partsPrice", labor_price AS "laborPrice" FROM damage_line_items WHERE inspection_id = $1 AND deleted_at IS NULL`,
        [row.inspectionId],
      );
      damageLineItems = lineItemsRows;

      const [insp] = await AppDataSource.query<{ damage_description: string }[]>(
        `SELECT damage_description FROM inspections WHERE id = $1`,
        [row.inspectionId],
      );
      if (insp?.damage_description) {
        inspectionNote = insp.damage_description;
      }
    }

    let issueDescription = row.issueDescription;
    if (damagedChecklist.length > 0 || damageLineItems.length > 0 || inspectionNote) {
      const partsSummary = [
        ...damagedChecklist.map(
          (c) =>
            `${PART_TYPE_VIETNAMESE[c.itemKey] || c.itemLabel || c.itemKey} (${c.status === 'BROKEN' ? 'Hỏng nặng' : c.status === 'SCRATCHED' ? 'Trầy xước' : c.status}${c.note ? `: ${c.note}` : ''})`,
        ),
        ...damageLineItems.map(
          (l) => `${l.customPartName || PART_TYPE_VIETNAMESE[l.partType] || l.partType}`,
        ),
      ].join(', ');

      issueDescription = `[Ghi nhận hư hỏng từ Check-out của Staff] Linh kiện hư hại: ${partsSummary || inspectionNote || 'Ghi nhận hư hỏng sau phiên Check-out.'}`;
    }

    const mergedChecklist = [
      ...damagedChecklist,
      ...damageLineItems.map((l) => {
        const partsText =
          l.partsPrice > 0
            ? `Phạt đền bù linh kiện: ${Number(l.partsPrice).toLocaleString('vi-VN')} đ`
            : '';
        const laborText =
          l.laborPrice > 0 ? `Phí công sửa: ${Number(l.laborPrice).toLocaleString('vi-VN')} đ` : '';
        const noteText = [partsText, laborText].filter(Boolean).join(' | ');

        return {
          itemKey: l.partType,
          itemLabel: l.customPartName || PART_TYPE_VIETNAMESE[l.partType] || l.partType,
          status: 'BROKEN',
          note: noteText,
        };
      }),
    ];

    result.push({
      logId: row.logId,
      logCode: `MNT-${row.logId.substring(0, 4).toUpperCase()}`,
      vehicleId: row.vehicleId,
      vehicleIdentifier: row.vehicleIdentifier,
      vehicleName: row.categoryName
        ? `${row.categoryName} (${row.vehicleIdentifier})`
        : row.vehicleIdentifier,
      vehicleImageUrl: row.vehicleImageUrl,
      cafeId: row.cafeId,
      cafeName: row.cafeName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryTier: row.categoryTier,
      issueDescription,
      staffNotes: inspectionNote || null,
      cost: Number(row.cost || 0),
      performedBy: row.performedBy,
      status: row.status as any,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      completedAt: row.status === 'COMPLETED' ? new Date().toISOString() : null,
      inspectionPhotos: photos,
      damagedChecklist: mergedChecklist,
    });
  }

  return result;
}

export async function createMaintenanceLog(
  staffId: string,
  cafeId: string,
  body: {
    vehicleId: string;
    issueDescription: string;
    cost?: number;
    performedBy?: string;
    staffNotes?: string;
  },
): Promise<any> {
  const { vehicleId, issueDescription, cost = 0, performedBy } = body;

  await AppDataSource.query(
    `ALTER TABLE vehicle_maintenance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SENT_TO_PROVIDER'`,
  );

  const [vehicle] = await AppDataSource.query<{ id: string; cafe_id: string }[]>(
    `SELECT id, cafe_id FROM vehicles WHERE id = $1 AND deleted_at IS NULL`,
    [vehicleId],
  );

  if (!vehicle) {
    throw new AppError('Xe không tồn tại', 404, 'VEHICLE_NOT_FOUND');
  }

  const result = await AppDataSource.transaction(async (manager) => {
    await manager.query(
      `UPDATE vehicles SET status = 'MAINTENANCE', updated_at = NOW() WHERE id = $1`,
      [vehicleId],
    );

    const [log] = await manager.query<{ id: string; created_at: Date }[]>(
      `INSERT INTO vehicle_maintenance_logs (vehicle_id, type, description, cost, performed_by, status, performed_at)
       VALUES ($1, 'REPAIR', $2, $3, $4, 'PENDING_REPAIR', NOW())
       RETURNING id, created_at`,
      [vehicleId, issueDescription, cost, staffId],
    );

    return {
      logId: log.id,
      vehicleId,
      issueDescription,
      cost,
      performedBy: performedBy || 'Staff',
      status: 'PENDING_REPAIR',
      createdAt: log.created_at.toISOString(),
    };
  });

  try {
    wsService.pushToCafe(cafeId, 'VEHICLE_MAINTENANCE_CREATED', {
      logId: result.logId,
      vehicleId,
      issueDescription,
      route: '/staff/maintenance',
    });
  } catch (err) {
    logger.error('Staff', 'Failed to broadcast VEHICLE_MAINTENANCE_CREATED', err);
  }

  return result;
}

export async function updateMaintenanceStatus(
  staffId: string,
  logId: string,
  body: {
    status: 'SENT_TO_PROVIDER' | 'PENDING_REPAIR' | 'RECEIVED' | 'COMPLETED';
    cost?: number;
    staffNotes?: string;
  },
): Promise<any> {
  const { status, cost } = body;

  await AppDataSource.query(
    `ALTER TABLE vehicle_maintenance_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'SENT_TO_PROVIDER'`,
  );

  const [log] = await AppDataSource.query<{ id: string; vehicle_id: string }[]>(
    `SELECT id, vehicle_id FROM vehicle_maintenance_logs WHERE id::text = $1 OR vehicle_id::text = $1`,
    [logId],
  );

  const targetVehicleId = log ? log.vehicle_id : logId;

  await AppDataSource.transaction(async (manager) => {
    if (log) {
      let costUpdate = '';
      const params: any[] = [status, staffId, log.id];
      if (cost !== undefined) {
        params.push(cost);
        costUpdate = `, cost = $${params.length}`;
      }
      await manager.query(
        `UPDATE vehicle_maintenance_logs SET status = $1, performed_by = $2 ${costUpdate} WHERE id = $3`,
        params,
      );
      await manager.query(
        `UPDATE vehicle_maintenance_logs SET status = $1, performed_by = $2 WHERE vehicle_id = $3 AND status != 'COMPLETED'`,
        [status, staffId, targetVehicleId],
      );
    } else {
      await manager.query(
        `INSERT INTO vehicle_maintenance_logs (vehicle_id, type, description, cost, performed_by, status, performed_at)
         VALUES ($1, 'REPAIR', 'Xe ghi nhận bảo trì từ hệ thống', $2, $3, $4, NOW())`,
        [targetVehicleId, cost || 0, staffId, status],
      );
    }

    if (status === 'COMPLETED') {
      await manager.query(
        `UPDATE vehicles SET status = 'AVAILABLE', last_maintenance_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [targetVehicleId],
      );

      const [vehInfo] = await manager.query<
        {
          vehicleIdentifier: string;
          categoryName: string | null;
          cafeName: string;
          providerId: string;
        }[]
      >(
        `SELECT v.identifier AS "vehicleIdentifier", vc.name AS "categoryName", c.name AS "cafeName", c.provider_id AS "providerId"
         FROM vehicles v
         JOIN cafes c ON v.cafe_id = c.id
         LEFT JOIN vehicle_catalogs vc ON v.catalog_id = vc.id
         WHERE v.id = $1`,
        [targetVehicleId],
      );

      if (vehInfo && vehInfo.providerId) {
        const vehicleName = vehInfo.categoryName
          ? `${vehInfo.categoryName} (${vehInfo.vehicleIdentifier})`
          : vehInfo.vehicleIdentifier;

        const notifTitle = 'Bảo trì xe thành công';
        const notifMessage = `Xe ${vehicleName} thuộc cơ sở ${vehInfo.cafeName} đã được bảo trì thành công.`;

        try {
          await createNotification(
            vehInfo.providerId,
            NotificationType.SYSTEM,
            notifTitle,
            notifMessage,
            {
              vehicleId: targetVehicleId,
              vehicleName,
              cafeName: vehInfo.cafeName,
              status: 'COMPLETED',
              route: '/provider/vehicles',
            },
          );

          wsService.pushToUser(vehInfo.providerId, 'MAINTENANCE_COMPLETED_NOTIFICATION', {
            title: notifTitle,
            message: notifMessage,
            vehicleName,
            cafeName: vehInfo.cafeName,
            vehicleId: targetVehicleId,
            route: '/provider/vehicles',
          });
        } catch (err) {
          logger.error(
            'Staff',
            'Failed to create provider maintenance completion notification',
            err,
          );
        }
      }
    } else {
      await manager.query(
        `UPDATE vehicles SET status = 'MAINTENANCE', updated_at = NOW() WHERE id = $1`,
        [targetVehicleId],
      );

      if (status === 'RECEIVED') {
        const [vehInfo] = await manager.query<
          {
            vehicleIdentifier: string;
            categoryName: string | null;
            cafeName: string;
            providerId: string;
          }[]
        >(
          `SELECT v.identifier AS "vehicleIdentifier", vc.name AS "categoryName", c.name AS "cafeName", c.provider_id AS "providerId"
           FROM vehicles v
           JOIN cafes c ON v.cafe_id = c.id
           LEFT JOIN vehicle_catalogs vc ON v.catalog_id = vc.id
           WHERE v.id = $1`,
          [targetVehicleId],
        );

        if (vehInfo && vehInfo.providerId) {
          const vehicleName = vehInfo.categoryName
            ? `${vehInfo.categoryName} (${vehInfo.vehicleIdentifier})`
            : vehInfo.vehicleIdentifier;

          const notifTitle = 'Đã nhận xe bảo trì';
          const notifMessage = `Xe ${vehicleName} thuộc cơ sở ${vehInfo.cafeName} đã được nhận để tiến hành sửa chữa.`;

          try {
            await createNotification(
              vehInfo.providerId,
              NotificationType.SYSTEM,
              notifTitle,
              notifMessage,
              {
                vehicleId: targetVehicleId,
                vehicleName,
                cafeName: vehInfo.cafeName,
                status: 'RECEIVED',
                route: '/provider/vehicles',
              },
            );

            wsService.pushToUser(vehInfo.providerId, 'MAINTENANCE_LOG_UPDATED', {
              title: notifTitle,
              message: notifMessage,
              vehicleName,
              cafeName: vehInfo.cafeName,
              vehicleId: targetVehicleId,
              route: '/provider/vehicles',
            });
          } catch (err) {
            logger.error(
              'Staff',
              'Failed to create provider maintenance received notification',
              err,
            );
          }
        }
      }
    }
  });

  try {
    const [veh] = await AppDataSource.query<{ cafe_id: string }[]>(
      `SELECT cafe_id FROM vehicles WHERE id = $1`,
      [targetVehicleId],
    );
    if (veh?.cafe_id) {
      wsService.pushToCafe(veh.cafe_id, 'MAINTENANCE_LOG_UPDATED', {
        logId,
        status,
        route: '/staff/maintenance',
      });
    }
  } catch (err) {
    logger.error('Staff', 'Failed to broadcast MAINTENANCE_LOG_UPDATED', err);
  }

  return { success: true, logId, status };
}

export async function lookupCustomerPackages(
  query: string,
  staffUserId: string,
): Promise<{
  customer: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string;
    avatarUrl: string | null;
    trustScore: number;
  };
  activeSubscriptions: any[];
  purchasedPackages: any[];
}> {
  // 1. Lấy cafe_id mà staff được phân công
  const [assignment] = await AppDataSource.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [staffUserId],
  );

  if (!assignment?.cafe_id) {
    throw new AppError('Nhân viên chưa được gán vào chi nhánh nào', 403, 'STAFF_CAFE_NOT_ASSIGNED');
  }

  const assignedCafeId = assignment.cafe_id;
  const cleanQuery = query.trim();

  // 2. Tìm kiếm khách hàng theo SĐT / email / tên / UUID
  // Khách hàng đó phải từng mua ít nhất một gói (customer_packages) tại chi nhánh của staff
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery);
  let queryStr: string;
  let params: any[];

  if (isUuid) {
    queryStr = `SELECT 
       u.id AS "customerId",
       u.full_name AS "fullName",
       u.email AS "email",
       u.phone AS "phone",
       u.avatar_url AS "avatarUrl",
       u.trust_score AS "trustScore"
     FROM users u
     WHERE u.role = 'CUSTOMER'
       AND u.deleted_at IS NULL
       AND u.id = $1
       AND EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.customer_id = u.id
           AND b.cafe_id = $2
       )
     LIMIT 1`;
    params = [cleanQuery, assignedCafeId];
  } else {
    queryStr = `SELECT 
       u.id AS "customerId",
       u.full_name AS "fullName",
       u.email AS "email",
       u.phone AS "phone",
       u.avatar_url AS "avatarUrl",
       u.trust_score AS "trustScore"
     FROM users u
     WHERE u.role = 'CUSTOMER'
       AND u.deleted_at IS NULL
       AND (
         u.phone ILIKE $1 
         OR u.email ILIKE $1 
         OR u.full_name ILIKE $1 
         OR u.full_name ILIKE '% ' || $1
       )
       AND EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.customer_id = u.id
           AND b.cafe_id = $2
       )
     LIMIT 1`;
    params = [`${cleanQuery}%`, assignedCafeId];
  }

  const [customer] = await AppDataSource.query<
    {
      customerId: string;
      fullName: string;
      email: string;
      phone: string | null;
      avatarUrl: string | null;
      trustScore: string;
    }[]
  >(queryStr, params);

  if (!customer) {
    throw new AppError(
      'Không tìm thấy khách hàng hoặc khách hàng không có gói dịch vụ nào tại cơ sở của bạn phụ trách.',
      404,
      'CUSTOMER_NOT_FOUND',
    );
  }

  // 3. Lấy tất cả các gói customer_packages của khách hàng tại cafe_id này
  const customerPackages = await AppDataSource.query<
    {
      customerPackageId: string;
      packageName: string;
      purchasedAt: Date;
      expiresAt: Date | null;
      slotsRemaining: number;
      slotsTotal: number;
      cafeId: string;
      cafeName: string;
      billingPeriod: string;
      status: string;
    }[]
  >(
    `SELECT 
       cp.id AS "customerPackageId",
       cp.package_name_snapshot AS "packageName",
       cp.created_at AS "purchasedAt",
       cp.expires_at AS "expiresAt",
       cp.slots_remaining AS "slotsRemaining",
       cp.slots_total AS "slotsTotal",
       cp.cafe_id AS "cafeId",
       c.name AS "cafeName",
       p.billing_period AS "billingPeriod",
       cp.status AS "status"
     FROM customer_packages cp
     JOIN packages p ON cp.package_id = p.id
     LEFT JOIN cafes c ON cp.cafe_id = c.id
     WHERE cp.customer_id = $1 
       AND cp.cafe_id = $2`,
    [customer.customerId, assignedCafeId],
  );

  // 4. Phân loại gói
  const activeSubscriptions: any[] = [];
  const purchasedPackages: any[] = [];

  for (const cp of customerPackages) {
    const isSubscription = cp.billingPeriod === 'WEEK' || cp.billingPeriod === 'MONTH';
    const mappedItem = {
      subscriptionId: cp.customerPackageId,
      customerPackageId: cp.customerPackageId,
      packageName: cp.packageName,
      planName: cp.packageName,
      expiresAt: cp.expiresAt ? cp.expiresAt.toISOString() : null,
      purchasedAt: cp.purchasedAt.toISOString(),
      remainingSessions: cp.slotsRemaining,
      remainingSlots: cp.slotsRemaining,
      totalSessions: cp.slotsTotal,
      totalSlots: cp.slotsTotal,
      cafeId: cp.cafeId,
      cafeName: cp.cafeName,
      status: cp.status,
    };

    if (isSubscription) {
      activeSubscriptions.push(mappedItem);
    } else {
      purchasedPackages.push(mappedItem);
    }
  }

  return {
    customer: {
      id: customer.customerId,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      avatarUrl: customer.avatarUrl,
      trustScore: Number(customer.trustScore),
    },
    activeSubscriptions,
    purchasedPackages,
  };
}

export async function getTopCustomersForCafe(staffUserId: string): Promise<
  {
    customerId: string;
    fullName: string;
    phone: string | null;
    email: string;
    avatarUrl: string | null;
    playCount: number;
  }[]
> {
  const [assignment] = await AppDataSource.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [staffUserId],
  );

  if (!assignment?.cafe_id) {
    throw new AppError('Nhân viên chưa được gán vào chi nhánh nào', 403, 'STAFF_CAFE_NOT_ASSIGNED');
  }

  const assignedCafeId = assignment.cafe_id;

  const rows = await AppDataSource.query<any[]>(
    `SELECT 
       u.id AS "customerId",
       u.full_name AS "fullName",
       u.phone AS "phone",
       u.email AS "email",
       u.avatar_url AS "avatarUrl",
       COUNT(b.id) AS "playCount"
     FROM bookings b
     JOIN users u ON b.customer_id = u.id
     WHERE b.cafe_id = $1
       AND b.status = 'COMPLETED'
       AND u.deleted_at IS NULL
     GROUP BY u.id, u.full_name, u.phone, u.email, u.avatar_url
     ORDER BY "playCount" DESC
     LIMIT 5`,
    [assignedCafeId],
  );

  return rows.map((row) => ({
    customerId: row.customerId,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    avatarUrl: row.avatarUrl,
    playCount: Number(row.playCount),
  }));
}

export async function searchCustomersForCafe(
  query: string,
  staffUserId: string,
): Promise<
  {
    customerId: string;
    fullName: string;
    phone: string | null;
    email: string;
    avatarUrl: string | null;
  }[]
> {
  const [assignment] = await AppDataSource.query<{ cafe_id: string }[]>(
    `SELECT cafe_id FROM staff_cafe_assignments WHERE staff_id = $1`,
    [staffUserId],
  );

  if (!assignment?.cafe_id) {
    throw new AppError('Nhân viên chưa được gán vào chi nhánh nào', 403, 'STAFF_CAFE_NOT_ASSIGNED');
  }

  const assignedCafeId = assignment.cafe_id;
  const cleanQuery = query.trim();

  const rows = await AppDataSource.query<any[]>(
    `SELECT 
       u.id AS "customerId",
       u.full_name AS "fullName",
       u.phone AS "phone",
       u.email AS "email",
       u.avatar_url AS "avatarUrl"
     FROM users u
     WHERE u.role = 'CUSTOMER'
       AND u.deleted_at IS NULL
       AND (
         u.phone ILIKE $1 
         OR u.email ILIKE $1 
         OR u.full_name ILIKE $1
         OR u.full_name ILIKE '% ' || $1
       )
       AND EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.customer_id = u.id
           AND b.cafe_id = $2
       )
     LIMIT 10`,
    [`${cleanQuery}%`, assignedCafeId],
  );

  return rows.map((row) => ({
    customerId: row.customerId,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    avatarUrl: row.avatarUrl,
  }));
}
