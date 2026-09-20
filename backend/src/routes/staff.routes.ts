import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { staffController } from '../controllers/staff.controller';

export const staffRouter = Router();

staffRouter.use(authenticate, authorize(UserRole.STAFF));

staffRouter.get('/today-bookings', staffController.todayBookings);
staffRouter.get('/packages/lookup', staffController.lookupCustomerPackages);
staffRouter.get('/packages/top-customers', staffController.getTopCustomers);
staffRouter.get('/packages/search-customers', staffController.searchCustomers);
staffRouter.get('/bookings', staffController.bookings);
staffRouter.post('/bookings', staffController.createWalkInBooking);
staffRouter.post(
  '/bookings/:bookingId/confirm-bank-transfer',
  staffController.confirmWalkInBankTransfer,
);
staffRouter.get('/fnb-orders', staffController.getFnbOrders);
staffRouter.patch('/fnb-orders/:orderId', staffController.updateFnbOrder);

// Session Check-In & Details
staffRouter.post('/bookings/:bookingId/check-in', staffController.checkIn);
staffRouter.get('/sessions/:sessionId', staffController.getSessionDetail);

// Session Operations
staffRouter.post('/sessions/:sessionId/inspections', staffController.submitInspection);
staffRouter.post('/sessions/:sessionId/confirm-checkout', staffController.confirmCheckout);
staffRouter.post('/sessions/:sessionId/complete-byoc', staffController.completeByocSession);
staffRouter.put(
  '/sessions/:sessionId/inspections/:inspectionId/damage-items',
  staffController.updateDamageItems,
);
staffRouter.post('/sessions/:sessionId/extensions', staffController.proposeExtension);
staffRouter.post('/sessions/:sessionId/fnb-orders', staffController.addSessionFnbOrder);
staffRouter.post('/sessions/:sessionId/swap-vehicle', staffController.swapSessionVehicle);
staffRouter.post(
  '/bookings/:bookingId/settle-pending-payments',
  staffController.settlePendingPayments,
);
staffRouter.post(
  '/bookings/:bookingId/settle-bank-transfer',
  staffController.initiateWalkInSettleBankTransfer,
);
staffRouter.post('/bookings/:bookingId/confirm-refund', staffController.confirmRefund);

// Maintenance Logs Routes
staffRouter.get('/maintenance-logs', staffController.getMaintenanceLogs);
staffRouter.post('/maintenance-logs', staffController.createMaintenanceLog);
staffRouter.patch('/maintenance-logs/:id/status', staffController.updateMaintenanceStatus);

// Client Simulators
staffRouter.post(
  '/sessions/:sessionId/simulate-check-out-response',
  staffController.simulateClientCheckOut,
);
staffRouter.post(
  '/sessions/:sessionId/simulate-extension-response',
  staffController.simulateClientExtension,
);
