import type { Request, Response, NextFunction } from 'express';
import { In, Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import {
  AppError,
  AuthRequest,
  UserRole,
  BookingStatus,
  SessionStatus,
  InspectionType,
  PaymentComponentStatus,
  PaymentComponentType,
  PaymentTransactionSubjectType,
  ExtensionProposalStatus,
} from '../types';
import {
  CreateBookingSchema,
  CreateContestRentalBookingSchema,
  CancelBookingSchema,
  ListMyBookingsSchema,
  ListCafeBookingsSchema,
  ListCafeSessionsSchema,
} from '../validate';
import * as bookingService from '../services/booking.service';
import { bookContestRental } from '../services/contest-rental.service';
import {
  createCheckoutUrl,
  mockConfirmPayment,
  processRefund,
  getCancellationQuote,
  createPaymentComponents,
  createCheckoutAdditionalPaymentUrl,
} from '../services/payment.service';
import type { BookingSnapshot } from '../services/payment.service';
import { assertPaymentMethodAvailable } from '../services/payment-method-resolver';
import { env } from '../config/env';
import { Booking } from '../models/booking.entity';
import { BookingParticipant } from '../models/booking-participant.entity';
import { BookingVehicle } from '../models/booking-vehicle.entity';
import { Vehicle } from '../models/vehicle.entity';
import { PaymentComponent } from '../models/payment-component.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import { FnbOrder } from '../models/fnb-order.entity';
import { FnbOrderItem } from '../models/fnb-order-item.entity';
import { Cafe } from '../models/cafe.entity';
import { User } from '../models/user.entity';
import { Review } from '../models/review.entity';
import { MenuItem } from '../models/menu-item.entity';
import { TrackType } from '../models/track-type.entity';
import { Session } from '../models/session.entity';
import { PaymentTransaction } from '../models/payment-transaction.entity';
import { Inspection } from '../models/inspection.entity';
import { DamageLineItem } from '../models/damage-line-item.entity';
import { ExtensionProposal } from '../models/extension-proposal.entity';
import {
  buildBookingFinancialSummary,
  type PendingInitialPaymentSnapshot,
} from '../lib/booking-financial-summary';

function getInitialPaymentReceiptComponents(
  value: unknown,
): Array<{ type: string; amount: number }> {
  const snapshot = value as Partial<BookingSnapshot> | null;
  if (!snapshot) return [];

  const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles : [];
  const rentalFee = vehicles.reduce((sum, vehicle) => sum + Number(vehicle?.rental_fee ?? 0), 0);
  return [
    { type: PaymentComponentType.SLOT_FEE, amount: Number(snapshot.slot_fee_total ?? 0) },
    { type: PaymentComponentType.RENTAL_FEE, amount: rentalFee },
    { type: PaymentComponentType.FB_PREORDER, amount: Number(snapshot.fnb_total ?? 0) },
    { type: 'PROMOTION_DISCOUNT', amount: -Number(snapshot.discount_amount ?? 0) },
  ].filter((component) => Number.isFinite(component.amount) && component.amount !== 0);
}

export const bookingController = {
  // POST /api/v1/bookings  [auth CUSTOMER]
  async createBooking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreateBookingSchema.parse(req.body);
      const result = await bookingService.createBooking(req.user!.userId, body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/bookings/contest-rental  [auth CUSTOMER]  (WF-A)
  async createContestRental(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreateContestRentalBookingSchema.parse(req.body);
      const result = await bookContestRental(body.contest_id, req.user!.userId, {
        cafe_id: body.cafe_id,
        slot_start: body.slot_start,
        slot_end: body.slot_end,
        track_config_id: body.track_config_id ?? null,
        vehicle_catalog_id: body.vehicle_catalog_id ?? null,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/bookings/:id/checkout  [auth CUSTOMER, PROVIDER, STAFF]
  async createCheckout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookingId = req.params.id;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(bookingId)) {
        throw new AppError('Invalid booking ID format', 400, 'VALIDATION_ERROR');
      }

      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddr =
        (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null) ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      // Ownership check: verify booking belongs to this customer OR staff/provider of this cafe
      const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: bookingId },
      });
      if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

      const role = req.user!.role;
      if (role === UserRole.CUSTOMER && booking.customerId !== req.user!.userId) {
        throw new AppError('Access denied', 403, 'NOT_BOOKING_OWNER');
      }
      if (role === UserRole.PROVIDER) {
        const ownsCafe = await AppDataSource.getRepository(Cafe).exist({
          where: { id: booking.cafeId, providerId: req.user!.userId },
        });
        if (!ownsCafe) {
          throw new AppError('Access denied', 403, 'BOOKING_CAFE_FORBIDDEN');
        }
      }
      if (role === UserRole.STAFF) {
        const [assignment] = await AppDataSource.query<{ exists: boolean }[]>(
          `SELECT EXISTS(
             SELECT 1
             FROM staff_cafe_assignments assignment
             JOIN users staff ON staff.id = assignment.staff_id
             WHERE assignment.staff_id = $1
               AND assignment.cafe_id = $2
               AND staff.is_active = true
               AND staff.deleted_at IS NULL
           ) AS exists`,
          [req.user!.userId, booking.cafeId],
        );
        if (!assignment?.exists) {
          throw new AppError('Access denied', 403, 'STAFF_NOT_ASSIGNED_TO_CAFE');
        }
      }

      // `payment_method` vắng mặt nghĩa là VNPay — hành vi y hệt trước khi có
      // tính năng chuyển khoản. Mọi client cũ tiếp tục chạy không đổi.
      const paymentMethod = await assertPaymentMethodAvailable(
        booking.cafeId,
        req.body?.payment_method,
      );

      const result = await createCheckoutUrl(
        bookingId,
        ipAddr,
        req.body?.return_url,
        paymentMethod,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/bookings/:id/checkout-additional-payment  [auth CUSTOMER, PROVIDER, STAFF]
  async createCheckoutAdditionalPayment(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const bookingId = req.params.id;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(bookingId)) {
        throw new AppError('Invalid booking ID format', 400, 'VALIDATION_ERROR');
      }

      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddr =
        (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null) ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: bookingId },
      });
      if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

      const role = req.user!.role;
      if (role === UserRole.CUSTOMER && booking.customerId !== req.user!.userId) {
        throw new AppError('Access denied', 403, 'NOT_BOOKING_OWNER');
      }
      if (role === UserRole.PROVIDER) {
        const ownsCafe = await AppDataSource.getRepository(Cafe).exist({
          where: { id: booking.cafeId, providerId: req.user!.userId },
        });
        if (!ownsCafe) {
          throw new AppError('Access denied', 403, 'BOOKING_CAFE_FORBIDDEN');
        }
      }
      if (role === UserRole.STAFF) {
        const [assignment] = await AppDataSource.query<{ exists: boolean }[]>(
          `SELECT EXISTS(
             SELECT 1
             FROM staff_cafe_assignments assignment
             JOIN users staff ON staff.id = assignment.staff_id
             WHERE assignment.staff_id = $1
               AND assignment.cafe_id = $2
               AND staff.is_active = true
               AND staff.deleted_at IS NULL
           ) AS exists`,
          [req.user!.userId, booking.cafeId],
        );
        if (!assignment?.exists) {
          throw new AppError('Access denied', 403, 'STAFF_NOT_ASSIGNED_TO_CAFE');
        }
      }

      // Dùng đúng bộ kiểm của luồng đặt lịch: chi nhánh chưa cấu hình xong tài
      // khoản nhận tiền thì chặn ngay ở đây, không để khách quét một mã QR trỏ
      // vào tài khoản chưa xác minh.
      const paymentMethod = await assertPaymentMethodAvailable(
        booking.cafeId,
        req.body?.payment_method,
      );

      const result = await createCheckoutAdditionalPaymentUrl(
        bookingId,
        ipAddr,
        req.body?.return_url,
        paymentMethod,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/bookings/payment-transactions/:txnRef  [auth]
  // Resolves a payment-result URL to its booking and receipt data. The transaction
  // reference is intentionally not parsed on the client because counter-payment
  // references are abbreviated and cannot safely reconstruct a booking UUID.
  async getPaymentTransaction(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await AppDataSource.getRepository(PaymentTransaction).findOne({
        where: { txnRef: req.params.txnRef },
      });
      if (!transaction) {
        throw new AppError(
          'Không tìm thấy giao dịch đặt lịch',
          404,
          'PAYMENT_TRANSACTION_NOT_FOUND',
        );
      }

      /**
       * Phí dự thi KHÔNG gắn với đơn đặt nào — nó mang `contestRegistrationId`
       * và để trống `bookingId`.
       *
       * Trước đây chỗ này chặn thẳng mọi giao dịch không có `bookingId`, nên
       * trang kết quả không đối chiếu được và luôn hiện "Chưa thể xác thực
       * thanh toán" — kể cả khi tiền đã vào và đăng ký đã ghi nhận đã trả. Tức
       * là khách trả tiền thành công mà màn hình nói ngược lại.
       */
      if (!transaction.bookingId) {
        if (
          transaction.subjectType !== PaymentTransactionSubjectType.CONTEST_ENTRY ||
          !transaction.contestRegistrationId
        ) {
          throw new AppError(
            'Không tìm thấy giao dịch đặt lịch',
            404,
            'PAYMENT_TRANSACTION_NOT_FOUND',
          );
        }

        const registration = await AppDataSource.getRepository(ContestRegistration).findOne({
          where: { id: transaction.contestRegistrationId },
        });
        if (!registration) {
          throw new AppError('Đăng ký giải không tồn tại', 404, 'REGISTRATION_NOT_FOUND');
        }
        // Biên nhận là dữ liệu riêng của người trả tiền. Không kiểm chủ sở hữu
        // ở đây thì bất kỳ ai đoán được mã giao dịch đều đọc được số tiền và
        // thời điểm thanh toán của người khác.
        if (req.user!.role === UserRole.CUSTOMER && registration.userId !== req.user!.userId) {
          throw new AppError('Access denied', 403, 'NOT_TRANSACTION_OWNER');
        }

        res.json({
          success: true,
          data: {
            bookingId: null,
            contestRegistrationId: registration.id,
            amount: Number(transaction.amount),
            status: transaction.status,
            gateway: transaction.gateway,
            type: transaction.type,
            additionalPayment: false,
            components: [{ type: 'CONTEST_ENTRY_FEE', amount: Number(transaction.amount) }],
            createdAt: transaction.createdAt.toISOString(),
            paidAt: transaction.updatedAt.toISOString(),
          },
        });
        return;
      }

      const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: transaction.bookingId },
      });
      if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      if (req.user!.role === UserRole.CUSTOMER && booking.customerId !== req.user!.userId) {
        throw new AppError('Access denied', 403, 'NOT_BOOKING_OWNER');
      }

      const rawRequest = (transaction.rawRequest ?? {}) as {
        additionalPayment?: boolean;
        components?: { id?: string; type?: string; amount?: number }[];
      };
      const isAdditionalPayment =
        rawRequest.additionalPayment === true || transaction.txnRef.startsWith('ctr_');
      const recordedComponents = Array.isArray(rawRequest.components)
        ? rawRequest.components
            .filter((component) => component.type && Number.isFinite(Number(component.amount)))
            .map((component) => ({
              id: component.id,
              type: component.type!,
              amount: Number(component.amount),
            }))
        : [];

      // Older counter transactions did not snapshot their individual fees. Use
      // current settled components only if they reconcile exactly, otherwise
      // keep the receipt honest and show one generic counter-service line.
      const settledCounterComponents =
        recordedComponents.length === 0 && isAdditionalPayment
          ? (
              await AppDataSource.getRepository(PaymentComponent).find({
                where: {
                  bookingId: transaction.bookingId,
                  status: PaymentComponentStatus.DISBURSED,
                },
              })
            )
              .filter((component) =>
                [
                  PaymentComponentType.FB_PREORDER,
                  PaymentComponentType.FNB_ON_SITE,
                  PaymentComponentType.EXTENSION_FEE,
                  PaymentComponentType.DAMAGE_CHARGE,
                ].includes(component.type),
              )
              .map((component) => ({
                id: component.id,
                type: component.type,
                amount: Number(component.amount),
              }))
          : [];
      const settledTotal = settledCounterComponents.reduce(
        (sum, component) => sum + component.amount,
        0,
      );
      const legacyInitialComponents =
        recordedComponents.length === 0 && !isAdditionalPayment
          ? getInitialPaymentReceiptComponents(booking.snapshot)
          : [];
      const legacyInitialTotal = legacyInitialComponents.reduce(
        (sum, component) => sum + component.amount,
        0,
      );
      const components =
        recordedComponents.length > 0
          ? recordedComponents
          : settledCounterComponents.length > 0 && settledTotal === Number(transaction.amount)
            ? settledCounterComponents
            : isAdditionalPayment
              ? [{ type: 'COUNTER_SERVICE', amount: Number(transaction.amount) }]
              : legacyInitialComponents.length > 0 &&
                  legacyInitialTotal === Number(transaction.amount)
                ? legacyInitialComponents
                : [{ type: 'BOOKING_PAYMENT', amount: Number(transaction.amount) }];

      res.json({
        success: true,
        data: {
          bookingId: transaction.bookingId,
          amount: Number(transaction.amount),
          status: transaction.status,
          gateway: transaction.gateway,
          type: transaction.type,
          additionalPayment: isAdditionalPayment,
          components,
          createdAt: transaction.createdAt.toISOString(),
          paidAt: transaction.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/bookings/:id  [auth]
  async getBooking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookingId = req.params.id;
      const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: bookingId },
      });
      if (!booking) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

      // Access control: customer sees own bookings; staff/provider sees their cafe's bookings
      const role = req.user!.role;
      if (role === UserRole.CUSTOMER && booking.customerId !== req.user!.userId) {
        throw new AppError('Access denied', 403, 'NOT_BOOKING_OWNER');
      }
      if (role === UserRole.PROVIDER) {
        const ownsCafe = await AppDataSource.getRepository(Cafe).exist({
          where: { id: booking.cafeId, providerId: req.user!.userId },
        });
        if (!ownsCafe) {
          throw new AppError('Access denied', 403, 'BOOKING_CAFE_FORBIDDEN');
        }
      }
      if (role === UserRole.STAFF) {
        const [assignment] = await AppDataSource.query<{ exists: boolean }[]>(
          `SELECT EXISTS(
             SELECT 1
             FROM staff_cafe_assignments assignment
             JOIN users staff ON staff.id = assignment.staff_id
             WHERE assignment.staff_id = $1
               AND assignment.cafe_id = $2
               AND staff.is_active = true
               AND staff.deleted_at IS NULL
           ) AS "exists"`,
          [req.user!.userId, booking.cafeId],
        );
        if (!assignment?.exists) {
          throw new AppError('Access denied', 403, 'BOOKING_CAFE_FORBIDDEN');
        }
      }

      // Load related records
      const [
        rawParticipants,
        vehicles,
        components,
        fnbOrders,
        cafe,
        session,
        transactions,
        review,
      ] = await Promise.all([
        AppDataSource.getRepository(BookingParticipant).find({ where: { bookingId } }),
        AppDataSource.getRepository(BookingVehicle).find({ where: { bookingId } }),
        AppDataSource.getRepository(PaymentComponent).find({
          where: { bookingId },
          order: { createdAt: 'ASC' },
        }),
        AppDataSource.getRepository(FnbOrder).find({
          where: { bookingId },
          order: { createdAt: 'ASC' },
        }),
        AppDataSource.getRepository(Cafe).findOne({ where: { id: booking.cafeId } }),
        AppDataSource.getRepository(Session).findOne({ where: { bookingId } }),
        AppDataSource.getRepository(PaymentTransaction).find({
          where: { bookingId },
          order: { createdAt: 'ASC' },
        }),
        AppDataSource.getRepository(Review).findOne({ where: { bookingId } }),
      ]);

      // Damage/inspection details are handled by the cafe's staff team. Providers
      // do not participate in disputes and must not receive this breakdown.
      let damageBreakdown: {
        lineItems: {
          id: string;
          partType: string;
          customPartName: string | null;
          partsPrice: number;
          laborPrice: number;
          subtotal: number;
        }[];
        totalDamageCharge: number;
        status: string;
      } | null = null;
      if (session) {
        const checkoutInspection = await AppDataSource.getRepository(Inspection).findOne({
          where: { sessionId: session.id, type: InspectionType.CHECK_OUT, damageNoted: true },
        });
        if (checkoutInspection) {
          const lineItems = await AppDataSource.getRepository(DamageLineItem).find({
            where: { inspectionId: checkoutInspection.id },
          });
          const totalDamageCharge =
            lineItems.length > 0
              ? lineItems.reduce(
                  (sum, item) => sum + Number(item.partsPrice) + Number(item.laborPrice),
                  0,
                )
              : Number(checkoutInspection.damageCostEstimate ?? 0) * 1.5;
          const damageStatus =
            booking.status === 'COMPLETED'
              ? 'SETTLED'
              : booking.status === 'AWAITING_PAYMENT'
                ? 'AWAITING_PAYMENT'
                : 'PENDING';
          damageBreakdown = {
            lineItems: lineItems.map((item) => ({
              id: item.id,
              partType: item.partType,
              customPartName: item.customPartName,
              partsPrice: Number(item.partsPrice),
              laborPrice: Number(item.laborPrice),
              subtotal: Number(item.partsPrice) + Number(item.laborPrice),
            })),
            totalDamageCharge,
            status: damageStatus,
          };
        }
      }

      // Enrich participants: resolve name/phone for registered users
      const userIds = rawParticipants.map((p) => p.userId).filter(Boolean) as string[];
      const users = userIds.length
        ? await AppDataSource.getRepository(User).findByIds(userIds)
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));
      const participants = rawParticipants.map((p) => ({
        ...p,
        // A linked account owns its current profile details. guestName/phone is
        // retained only for walk-in guests without an account.
        resolvedName: userMap.get(p.userId ?? '')?.full_name ?? p.guestName ?? null,
        resolvedPhone: userMap.get(p.userId ?? '')?.phone ?? p.guestPhone ?? null,
        resolvedAvatarUrl: userMap.get(p.userId ?? '')?.avatar_url ?? null,
      }));

      // Enrich vehicles with catalog info (name, tier, identifier, color, image)
      const vehicleIds = vehicles.map((v) => v.vehicleId);
      const enrichedVehicles = await Promise.all(
        vehicles.map(async (bv) => {
          const vehicle = await AppDataSource.getRepository(Vehicle).findOne({
            where: { id: bv.vehicleId },
            relations: ['catalog'],
          });
          return {
            ...bv,
            catalogName: bv.catalogNameSnapshot ?? vehicle?.catalog?.name ?? null,
            tier: bv.tierSnapshot ?? vehicle?.catalog?.tier ?? null,
            identifier: bv.identifierSnapshot ?? vehicle?.identifier ?? null,
            color: bv.colorSnapshot ?? vehicle?.color ?? null,
            // A unit's own photo represents the assigned rental car more accurately.
            // Use the catalog cover only when that unit has no photo.
            coverImageUrl:
              bv.coverImageUrlSnapshot ??
              vehicle?.distinctiveImageUrl ??
              vehicle?.catalog?.coverImageUrl ??
              null,
          };
        }),
      );
      void vehicleIds; // suppress unused warning

      // Booking history includes cancelled F&B too. They must stay out of
      // preparation queues, but remain visible on the booking for audit and
      // refund reconciliation.
      type EnrichedFnbOrderItem = FnbOrderItem & {
        itemName: string | null;
        variantName: string | null;
      };
      let fnbItems: EnrichedFnbOrderItem[] = [];
      let fnbOrdersWithItems: Array<{
        id: string;
        bookingId: string;
        orderType: FnbOrder['orderType'];
        status: FnbOrder['status'];
        totalAmount: number;
        items: EnrichedFnbOrderItem[];
      }> = [];
      let mergedFnbOrder = null;

      const historicalFnbOrders = fnbOrders;

      if (historicalFnbOrders.length > 0) {
        const allRawItems: FnbOrderItem[] = [];
        const itemsByOrderId = new Map<string, FnbOrderItem[]>();
        for (const order of historicalFnbOrders) {
          const items = await AppDataSource.getRepository(FnbOrderItem).find({
            where: { fnbOrderId: order.id },
            order: { createdAt: 'ASC' },
          });
          allRawItems.push(...items);
          itemsByOrderId.set(order.id, items);
        }

        const menuItemIds = [
          ...new Set(
            allRawItems.map((i) => i.menuItemId).filter((id): id is string => Boolean(id)),
          ),
        ];
        const menuItems = menuItemIds.length
          ? await AppDataSource.getRepository(MenuItem).findByIds(menuItemIds)
          : [];
        const menuMap = new Map(menuItems.map((m) => [m.id, m.name]));

        fnbItems = allRawItems.map((i) => ({
          ...i,
          // Snapshot takes precedence so an old paid order does not silently
          // change its label after Provider renames a menu item.
          itemName: i.itemNameSnapshot ?? (i.menuItemId ? menuMap.get(i.menuItemId) : null) ?? null,
          variantName: i.variantNameSnapshot ?? null,
        }));

        const enrichedItemsByOrderId = new Map<string, EnrichedFnbOrderItem[]>();
        for (const [orderId, items] of itemsByOrderId) {
          enrichedItemsByOrderId.set(
            orderId,
            items.map((item) => ({
              ...item,
              itemName:
                item.itemNameSnapshot ??
                (item.menuItemId ? menuMap.get(item.menuItemId) : null) ??
                null,
              variantName: item.variantNameSnapshot ?? null,
            })),
          );
        }

        // Keep each order separate so clients can distinguish food and drinks
        // paid at booking from items ordered during the session.
        fnbOrdersWithItems = historicalFnbOrders.map((order) => ({
          id: order.id,
          bookingId: order.bookingId,
          orderType: order.orderType,
          status: order.status,
          totalAmount: Number(order.totalAmount),
          createdAt: order.createdAt,
          items: enrichedItemsByOrderId.get(order.id) ?? [],
        }));

        // Retained temporarily for older clients that still expect a merged list.
        mergedFnbOrder = {
          id: historicalFnbOrders[0].id,
          bookingId,
          orderType: 'MERGED',
          totalAmount: historicalFnbOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
          status: historicalFnbOrders.every((order) => order.status === 'CANCELLED')
            ? 'CANCELLED'
            : 'CONFIRMED',
          items: fnbItems,
        };
      }

      // Backfill payment components if booking is confirmed but components are missing
      if (
        ['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(booking.status) &&
        components.length === 0 &&
        booking.snapshot
      ) {
        const paymentSnapshot = booking.snapshot as unknown as BookingSnapshot;
        await createPaymentComponents(booking, paymentSnapshot, vehicles);
        components.push(
          ...(await AppDataSource.getRepository(PaymentComponent).find({ where: { bookingId } })),
        );
      }

      // Resolve track type name: snapshot first, then DB lookup
      const snapshot = booking.snapshot as Record<string, unknown> | null;
      let trackTypeName: string | null = (snapshot?.track_type_name as string) ?? null;
      let trackTypeCoverImage: string | null = null;
      if (booking.trackConfigId) {
        const [trackConfigRow] = await AppDataSource.query<{ images: string[]; name: string }[]>(
          `SELECT ctc.images, tt.name FROM cafe_track_configs ctc
           JOIN track_types tt ON tt.id = ctc.track_type_id
           WHERE ctc.id = $1 LIMIT 1`,
          [booking.trackConfigId],
        );
        if (trackConfigRow) {
          if (!trackTypeName) trackTypeName = trackConfigRow.name;
          trackTypeCoverImage =
            Array.isArray(trackConfigRow.images) && trackConfigRow.images.length > 0
              ? trackConfigRow.images[0]
              : null;
        }
      } else if (booking.trackTypeId) {
        const tt = await AppDataSource.getRepository(TrackType).findOne({
          where: { id: booking.trackTypeId },
        });
        if (tt && !trackTypeName) trackTypeName = tt.name;
      }

      let proposedExtensionMinutes: number | null = null;
      let approvedExtensionMinutes = 0;
      if (session) {
        if (session.status === 'EXTENDING') {
          const proposal = await AppDataSource.getRepository(ExtensionProposal).findOne({
            where: { sessionId: session.id, status: ExtensionProposalStatus.PENDING },
            order: { createdAt: 'DESC' },
          });
          if (proposal) {
            proposedExtensionMinutes = Number(proposal.durationMinutes);
          }
        }
        const approvedProposals = await AppDataSource.getRepository(ExtensionProposal).find({
          where: { sessionId: session.id, status: ExtensionProposalStatus.APPROVED },
        });
        approvedExtensionMinutes = approvedProposals.reduce(
          (sum, p) => sum + Number(p.durationMinutes),
          0,
        );
      }

      res.json({
        success: true,
        data: {
          ...booking,
          participants,
          vehicles: enrichedVehicles,
          payment_components: components,
          financial_summary: buildBookingFinancialSummary(
            components,
            transactions,
            Number(booking.discountAmount) || 0,
            booking.status === 'PENDING'
              ? (booking.snapshot as PendingInitialPaymentSnapshot | null)
              : undefined,
          ),
          payment_transactions: transactions.map((t) => ({
            id: t.id,
            type: t.type,
            gateway: t.gateway,
            txnRef: t.txnRef,
            amount: Number(t.amount),
            status: t.status,
            createdAt: t.createdAt,
          })),
          fnb_orders: fnbOrdersWithItems,
          fnb_order: mergedFnbOrder,
          cafe: cafe
            ? {
                name: cafe.name,
                address: cafe.address,
                city: cafe.city,
                coverImageUrl: cafe.coverImageUrl,
              }
            : null,
          track_type_name: trackTypeName,
          track_type_cover_image: trackTypeCoverImage,
          session: session
            ? {
                id: session.id,
                status: session.status,
                plannedEndAt: session.plannedEndAt,
                actualStartAt: session.actualStartAt,
                actualEndAt: session.actualEndAt,
                proposedExtensionMinutes,
                approvedExtensionMinutes,
              }
            : null,
          damage_breakdown: role === UserRole.PROVIDER ? null : damageBreakdown,
          review: review
            ? {
                id: review.id,
                overallScore: review.overallScore,
                vehicleScore: review.vehicleScore,
                staffScore: review.staffScore,
                facilityScore: review.facilityScore,
                note: review.note,
                createdAt: review.createdAt,
              }
            : null,
          can_review:
            (booking.status === BookingStatus.COMPLETED || session?.status === 'COMPLETED') &&
            !review &&
            !booking.reviewDismissedAt &&
            !(
              (booking.completedAt || session?.actualEndAt || booking.slotEnd) &&
              new Date().getTime() -
                new Date(booking.completedAt || session?.actualEndAt || booking.slotEnd).getTime() >
                5 * 24 * 60 * 60 * 1000
            ),
          is_review_expired:
            !!(booking.completedAt || session?.actualEndAt || booking.slotEnd) &&
            new Date().getTime() -
              new Date(booking.completedAt || session?.actualEndAt || booking.slotEnd).getTime() >
              5 * 24 * 60 * 60 * 1000,
          review_deadline:
            booking.completedAt || session?.actualEndAt || booking.slotEnd
              ? new Date(
                  new Date(
                    booking.completedAt || session?.actualEndAt || booking.slotEnd,
                  ).getTime() +
                    5 * 24 * 60 * 60 * 1000,
                ).toISOString()
              : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/bookings  [auth CUSTOMER]
  async listMyBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListMyBookingsSchema.parse(req.query);
      let qb = AppDataSource.getRepository(Booking)
        .createQueryBuilder('b')
        .leftJoin(Cafe, 'c', 'c.id = b.cafeId')
        .select([
          'b.id',
          'b.customerId',
          'b.cafeId',
          'b.playMode',
          'b.status',
          'b.slotStart',
          'b.slotEnd',
          'b.paymentExpiresAt',
          'b.snapshot',
          'b.contestId',
          'b.createdAt',
          'b.updatedAt',
        ])
        .addSelect('c.name', 'cafeName')
        .where('b.customer_id = :customerId', { customerId: req.user!.userId })
        // Sắp theo LÚC TẠO ĐƠN, không theo giờ chơi.
        //
        // Theo giờ chơi thì đơn vừa đặt cho tuần sau nằm dưới đơn đặt từ tháng
        // trước cho tháng sau — khách vừa bấm xong không thấy đơn của mình đâu.
        //
        // `b.id` làm khoá phụ để thứ tự luôn xác định: hai đơn trùng mốc tạo mà
        // không có tiêu chí phá hoà thì Postgres trả về thứ tự tuỳ lúc, và phân
        // trang sẽ có dòng hiện hai lần ở hai trang hoặc biến mất hẳn.
        .orderBy('b.createdAt', 'DESC')
        .addOrderBy('b.id', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);

      if (query.status) {
        qb = qb.andWhere('b.status = :status', { status: query.status });
      }
      if (query.play_mode) {
        qb = qb.andWhere('b.play_mode = :playMode', { playMode: query.play_mode });
      }

      // Tạo câu query đếm tổng số lượng phù hợp với filter status
      let countQb = AppDataSource.getRepository(Booking)
        .createQueryBuilder('b')
        .where('b.customer_id = :customerId', { customerId: req.user!.userId });
      if (query.status) {
        countQb = countQb.andWhere('b.status = :status', { status: query.status });
      }
      if (query.play_mode) {
        countQb = countQb.andWhere('b.play_mode = :playMode', { playMode: query.play_mode });
      }

      const [rawAndEntities, total] = await Promise.all([
        qb.getRawAndEntities(),
        countQb.getCount(),
      ]);

      const bookings = rawAndEntities.entities;
      const rawResults = rawAndEntities.raw;

      // Batch-fetch active sessions and payment components for these bookings
      const bookingIds = bookings.map((b) => b.id);
      const [activeSessions, paymentComponents] = await Promise.all([
        bookingIds.length > 0
          ? AppDataSource.getRepository(Session).find({
              where: {
                bookingId: In(bookingIds),
                status: Not(In([SessionStatus.COMPLETED, SessionStatus.CANCELLED])),
              },
              select: ['id', 'bookingId', 'status', 'plannedEndAt', 'actualStartAt'],
            })
          : Promise.resolve([]),
        bookingIds.length > 0
          ? AppDataSource.getRepository(PaymentComponent).find({
              where: { bookingId: In(bookingIds) },
            })
          : Promise.resolve([]),
      ]);

      const sessionByBookingId = new Map(activeSessions.map((s) => [s.bookingId, s]));
      const componentsByBookingId = new Map<string, PaymentComponent[]>();
      paymentComponents.forEach((c) => {
        const list = componentsByBookingId.get(c.bookingId) || [];
        list.push(c);
        componentsByBookingId.set(c.bookingId, list);
      });

      const data = bookings.map((b, idx) => {
        const sess = sessionByBookingId.get(b.id);
        const raw = rawResults[idx];
        const comps = componentsByBookingId.get(b.id) || [];

        let totalAmount: number;
        if (comps.length > 0) {
          totalAmount = comps
            .filter((c) => c.type !== PaymentComponentType.SECURITY_DEPOSIT)
            .reduce((sum, c) => sum + Number(c.amount), 0);
        } else {
          const snapshot = b.snapshot as { total_charged?: number; total_amount?: number } | null;
          totalAmount = Number(snapshot?.total_charged ?? snapshot?.total_amount ?? 0);
        }

        return {
          ...b,
          totalAmount,
          cafe: raw?.cafeName ? { name: raw.cafeName } : null,
          session: sess
            ? {
                id: sess.id,
                status: sess.status,
                plannedEndAt: sess.plannedEndAt,
                actualStartAt: sess.actualStartAt,
              }
            : null,
        };
      });

      res.json({ success: true, data, total, page: query.page, limit: query.limit });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/bookings/:id/cancellation-quote  [auth CUSTOMER, PROVIDER]
  async getCancellationQuote(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await getCancellationQuote(req.params.id, req.user!.userId, req.user!.role);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/bookings/:id/cancel  [auth CUSTOMER, PROVIDER]
  async cancelBooking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookingId = req.params.id;
      const body = CancelBookingSchema.parse(req.body);
      const cancellation = await bookingService.cancelBooking(
        bookingId,
        req.user!.userId,
        req.user!.role,
        body.reason,
      );
      // A PENDING booking is only a free hold. Calling the refund service here
      // used to try to calculate/refund a payment that never existed, which
      // could turn a successful hold cancellation into a 500 response.
      const refund = cancellation.requiresRefundProcessing
        ? await processRefund(bookingId, req.user!.role)
        : {
            slotFeeRefund: 0,
            rentalFeeRefund: 0,
            depositRefund: 0,
            fnbRefund: 0,
            totalRefund: 0,
          };
      res.json({ success: true, data: { bookingId, refund } });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/bookings/:id/mock-checkout  [auth CUSTOMER] [dev only]
  async mockCheckout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (env.NODE_ENV === 'production') {
        throw new AppError('Not available in production', 403, 'FORBIDDEN');
      }
      const result = await mockConfirmPayment(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/cafes/:cafeId/bookings  [auth PROVIDER, STAFF]
  async listCafeBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafeId = req.params.cafeId;
      const query = ListCafeBookingsSchema.parse(req.query) as bookingService.ListCafeBookingsQuery;
      const result = await bookingService.listCafeBookings(cafeId, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/cafes/:cafeId/sessions  [auth PROVIDER, STAFF]
  async listCafeSessions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafeId = req.params.cafeId;
      const query = ListCafeSessionsSchema.parse(req.query);
      const result = await bookingService.listCafeSessions(cafeId, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/cafes/:cafeId/sessions/stats  [auth PROVIDER, STAFF]
  async listCafeSessionStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafeId = req.params.cafeId;
      const date =
        typeof req.query.date === 'string'
          ? req.query.date
          : new Date().toISOString().split('T')[0];
      const result = await bookingService.listCafeSessionStats(cafeId, date);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/bookings/:id/qr  [public]
  async getBookingQr(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return next(new AppError('Invalid booking ID format', 400, 'VALIDATION_ERROR'));
      }
      const QRCode = await import('qrcode');
      const buffer = await QRCode.toBuffer(id, {
        errorCorrectionLevel: 'M',
        width: 256,
        margin: 2,
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
};
