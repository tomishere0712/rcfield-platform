import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';
import {
  CreateStaffSchema,
  TransferStaffSchema,
  UpdateFnbOrderStatusSchema,
  CreateWalkInBookingSchema,
  SubmitInspectionV2Schema,
  ConfirmCheckoutSchema,
  ConfirmRefundSchema,
  UpdateDamageItemsSchema,
  StaffBookingsQuerySchema,
  AddSessionFnbOrderSchema,
  RespondExtensionOnBehalfSchema,
  ConfirmInspectionOnBehalfSchema,
} from '../validate';
import { AppError, AuthPayload, AuthRequest, UserRole } from '../types';
import * as staffService from '../services/staff.service';
import { confirmRefund } from '../services/payment.service';
import { env } from '../config/env';

export const staffController = {
  // POST /api/v1/staff/sessions/:sessionId/extension/respond-for-customer  [auth]
  async respondExtensionForCustomer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { approved, reason } = RespondExtensionOnBehalfSchema.parse(req.body);
      const data = await staffService.respondExtensionOnBehalf(
        req.params.sessionId,
        req.user.userId,
        approved,
        reason,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/inspections/:inspectionId/confirm-for-customer  [auth]
  async confirmInspectionForCustomer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { agreed, reason } = ConfirmInspectionOnBehalfSchema.parse(req.body);
      const data = await staffService.confirmInspectionOnBehalf(
        req.params.sessionId,
        req.params.inspectionId,
        req.user.userId,
        agreed,
        reason,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/staff  [auth]
  async createStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = CreateStaffSchema.parse(req.body);
      const data = await staffService.createStaffForProvider(req.user.userId, body);
      logger.auth('provider create staff', {
        providerId: req.user.userId,
        staffId: data.id,
        cafeId: data.cafeId,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/staff  [auth]
  async listStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const cafeId = typeof req.query.cafe_id === 'string' ? req.query.cafe_id : undefined;
      const data = await staffService.listStaffForProvider(req.user.userId, cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/provider/staff/:staffId/deactivate  [auth]
  async deactivateStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      await staffService.deactivateStaff(req.user.userId, req.params.staffId);
      logger.info('Staff', 'deactivated', {
        providerId: req.user.userId,
        staffId: req.params.staffId,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/provider/staff/:staffId/reactivate  [auth]
  async reactivateStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      await staffService.reactivateStaff(req.user.userId, req.params.staffId);
      logger.info('Staff', 'reactivated', {
        providerId: req.user.userId,
        staffId: req.params.staffId,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/staff/:staffId/resend-invite  [auth]
  async resendInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.resendInvite(req.user.userId, req.params.staffId);
      logger.info('Staff', 'invite resent', {
        providerId: req.user.userId,
        staffId: req.params.staffId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/provider/staff/:staffId/branch  [auth]
  async transferStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { cafe_id } = TransferStaffSchema.parse(req.body);
      await staffService.transferStaff(req.user.userId, req.params.staffId, cafe_id);
      logger.info('Staff', 'transferred', {
        providerId: req.user.userId,
        staffId: req.params.staffId,
        newCafeId: cafe_id,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/staff/:staffId/impersonate  [auth]
  async impersonateStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const staff = await staffService.getStaffForImpersonation(
        req.user.userId,
        req.params.staffId,
      );
      const payload: AuthPayload = {
        userId: staff.id,
        role: UserRole.STAFF,
        email: staff.email,
        cafeId: staff.cafeId,
        impersonated_by: req.user.userId,
      };
      const token = jwt.sign(payload, env.jwt.secret, { expiresIn: '2h' });
      logger.auth('provider impersonate staff', {
        providerId: req.user.userId,
        staffId: staff.id,
        cafeId: staff.cafeId,
      });
      res.json({
        token,
        staff: {
          id: staff.id,
          email: staff.email,
          fullName: staff.fullName,
          cafeName: staff.cafeName,
          cafeId: staff.cafeId,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/staff/:staffId  [auth]
  async getStaffDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.getStaffDetail(req.user.userId, req.params.staffId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/staff/:staffId/kpi  [auth]
  async getStaffKpi(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const periodRaw = req.query.period;
      const VALID_PERIODS = ['7d', '30d', '90d'] as const;
      const period = VALID_PERIODS.includes(periodRaw as (typeof VALID_PERIODS)[number])
        ? (periodRaw as (typeof VALID_PERIODS)[number])
        : '30d';
      const data = await staffService.getStaffKpi(req.user.userId, req.params.staffId, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/staff/:staffId/activity  [auth]
  async getStaffActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20), 50);
      const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
      const data = await staffService.getStaffActivity(
        req.user.userId,
        req.params.staffId,
        limit,
        offset,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/today-bookings  [auth]
  async todayBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const data = await staffService.getTodayBookings(req.user.cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/bookings?date=YYYY-MM-DD  [auth]
  async bookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const { date } = StaffBookingsQuerySchema.parse(req.query);
      const data = await staffService.getBookingsByDate(req.user.cafeId, date);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings  [auth]
  async createWalkInBooking(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const body = CreateWalkInBookingSchema.parse(req.body);
      const data = await staffService.createWalkInBooking(req.user.userId, req.user.cafeId, body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings/:bookingId/confirm-bank-transfer [auth]
  async confirmWalkInBankTransfer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const { bookingId } = req.params;
      const data = await staffService.confirmWalkInBankTransfer(
        req.user.userId,
        req.user.cafeId,
        bookingId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings/:bookingId/settle-bank-transfer [auth]
  async initiateWalkInSettleBankTransfer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const { bookingId } = req.params;
      const data = await staffService.initiateWalkInSettleBankTransfer(
        req.user.userId,
        req.user.cafeId,
        bookingId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/fnb-orders  [auth]
  async getFnbOrders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const data = await staffService.getTodayFnbOrders(req.user.cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/staff/fnb-orders/:orderId  [auth]
  async updateFnbOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const { status } = UpdateFnbOrderStatusSchema.parse(req.body);
      await staffService.updateFnbOrderStatus(
        req.params.orderId,
        req.user.cafeId,
        status,
        req.user.userId,
      );
      logger.info('Staff', 'fnb order updated via API', {
        orderId: req.params.orderId,
        cafeId: req.user.cafeId,
        status,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings/:bookingId/check-in [auth]
  async checkIn(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.startCheckIn(req.params.bookingId, req.user.userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/sessions/:sessionId [auth]
  async getSessionDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.getSessionDetail(req.params.sessionId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/inspections [auth]
  async submitInspection(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = SubmitInspectionV2Schema.parse(req.body);
      const data = await staffService.submitInspection(req.params.sessionId, req.user.userId, body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/extensions [auth]
  async proposeExtension(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.proposeExtension(
        req.params.sessionId,
        req.user.userId,
        req.body,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/fnb-orders [auth]
  async addSessionFnbOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = AddSessionFnbOrderSchema.parse(req.body);
      const data = await staffService.addSessionFnbOrder(
        req.params.sessionId,
        req.user.userId,
        body,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/swap-vehicle [auth]
  async swapSessionVehicle(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { oldVehicleId, newVehicleId, oldVehicleNewStatus } = req.body;
      const data = await staffService.swapSessionVehicle(
        req.params.sessionId,
        oldVehicleId,
        newVehicleId,
        oldVehicleNewStatus,
        req.user.userId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/simulate-check-out-response [auth]
  async simulateClientCheckOut(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.simulateClientCheckOutResponse(req.params.sessionId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/simulate-extension-response [auth]
  async simulateClientExtension(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { approved } = req.body;
      const data = await staffService.simulateClientExtensionResponse(
        req.params.sessionId,
        approved,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings/:bookingId/settle-pending-payments [auth]
  async settlePendingPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.settlePendingPayments(req.params.bookingId, req.user.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/bookings/:bookingId/confirm-refund [auth]
  async confirmRefund(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = ConfirmRefundSchema.parse(req.body);
      await confirmRefund(req.params.bookingId, req.user.userId, body);
      res.json({ success: true, message: 'Đã xác nhận hoàn tiền thành công' });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/confirm-checkout [auth]
  async confirmCheckout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { inspectionId } = ConfirmCheckoutSchema.parse(req.body);
      const data = await staffService.staffConfirmCheckout(
        req.params.sessionId,
        inspectionId,
        req.user.userId,
      );
      logger.info('Staff', 'confirmCheckout', {
        staffId: req.user.userId,
        sessionId: req.params.sessionId,
        inspectionId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/sessions/:sessionId/complete-byoc [auth]
  async completeByocSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.completeByocSession(req.params.sessionId, req.user.userId);
      logger.info('Staff', 'completeByocSession', {
        staffId: req.user.userId,
        sessionId: req.params.sessionId,
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/staff/sessions/:sessionId/inspections/:inspectionId/damage-items [auth]
  async updateDamageItems(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { damageLineItems, checklist, staffNotes } = UpdateDamageItemsSchema.parse(req.body);
      const data = await staffService.updateDamageLineItems(
        req.params.sessionId,
        req.params.inspectionId,
        damageLineItems,
        checklist,
        staffNotes ?? undefined,
      );
      logger.info('Staff', 'updateDamageItems', {
        staffId: req.user.userId,
        sessionId: req.params.sessionId,
        inspectionId: req.params.inspectionId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/maintenance-logs [auth]
  async getMaintenanceLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const data = await staffService.getMaintenanceLogs(req.user.cafeId, status, search);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/staff/maintenance-logs [auth]
  async createMaintenanceLog(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (!req.user.cafeId)
        throw new AppError('Staff chưa được gán chi nhánh', 403, 'CAFE_NOT_ASSIGNED');
      const data = await staffService.createMaintenanceLog(
        req.user.userId,
        req.user.cafeId,
        req.body,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/staff/maintenance-logs/:id/status [auth]
  async updateMaintenanceStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.updateMaintenanceStatus(
        req.user.userId,
        req.params.id,
        req.body,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/packages/lookup [auth]
  async lookupCustomerPackages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const query = req.query.query;
      if (typeof query !== 'string' || !query.trim()) {
        throw new AppError('Từ khóa tìm kiếm không hợp lệ', 400, 'INVALID_QUERY');
      }
      const data = await staffService.lookupCustomerPackages(query, req.user.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/packages/top-customers [auth]
  async getTopCustomers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await staffService.getTopCustomersForCafe(req.user.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/staff/packages/search-customers [auth]
  async searchCustomers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const query = req.query.query;
      if (typeof query !== 'string' || !query.trim()) {
        throw new AppError('Từ khóa tìm kiếm không hợp lệ', 400, 'INVALID_QUERY');
      }
      const data = await staffService.searchCustomersForCafe(query, req.user.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
