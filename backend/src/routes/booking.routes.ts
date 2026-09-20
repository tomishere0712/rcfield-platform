import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { bookingController } from '../controllers/booking.controller';
import { UserRole } from '../types';

export const bookingRouter = Router();

// Public route — no auth: email clients load this image without JWT
bookingRouter.get('/:id/qr', bookingController.getBookingQr);

bookingRouter.post(
  '/',
  authenticate,
  authorize(UserRole.CUSTOMER),
  bookingController.createBooking,
);

bookingRouter.post(
  '/contest-rental',
  authenticate,
  authorize(UserRole.CUSTOMER),
  bookingController.createContestRental,
);

bookingRouter.get(
  '/',
  authenticate,
  authorize(UserRole.CUSTOMER),
  bookingController.listMyBookings,
);

bookingRouter.get(
  '/payment-transactions/:txnRef',
  authenticate,
  bookingController.getPaymentTransaction,
);

bookingRouter.get(
  '/:id/cancellation-quote',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.STAFF),
  bookingController.getCancellationQuote,
);

bookingRouter.get('/:id', authenticate, bookingController.getBooking);

bookingRouter.post(
  '/:id/checkout',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.STAFF),
  bookingController.createCheckout,
);

bookingRouter.post(
  '/:id/checkout-additional-payment',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.STAFF),
  bookingController.createCheckoutAdditionalPayment,
);

bookingRouter.post(
  '/:id/mock-checkout',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.STAFF),
  bookingController.mockCheckout,
);

bookingRouter.post(
  '/:id/cancel',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.STAFF),
  bookingController.cancelBooking,
);
