import { Router } from 'express';
import { authenticate, authorize, requireActiveProvider } from '../middlewares/auth.middleware';
import { pricingController } from '../controllers/pricing.controller';
import { UserRole } from '../types';

export const pricingRouter = Router();

// ── Public endpoints (no auth) ────────────────────────────────────────────────

pricingRouter.get('/cafes/:cafeId/pricing', pricingController.getPublicPricing);
pricingRouter.get('/cafes/:cafeId/pricing-preview', pricingController.getPricingPreview);

// ── Provider endpoints ────────────────────────────────────────────────────────

pricingRouter.get(
  '/provider/cafes/:cafeId/pricing',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.getProviderPricing,
);

pricingRouter.put(
  '/provider/cafes/:cafeId/pricing/rules',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.updatePricingRules,
);

pricingRouter.get(
  '/provider/cafes/:cafeId/pricing/holidays',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.listHolidays,
);

pricingRouter.post(
  '/provider/cafes/:cafeId/pricing/holidays',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.createHoliday,
);

// Override delete must come before the general /:holidayId routes to avoid conflict
pricingRouter.delete(
  '/provider/cafes/:cafeId/pricing/holidays/:holidayId/override',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.deleteHolidayOverride,
);

pricingRouter.put(
  '/provider/cafes/:cafeId/pricing/holidays/:holidayId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.updateHoliday,
);

pricingRouter.delete(
  '/provider/cafes/:cafeId/pricing/holidays/:holidayId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  pricingController.deleteHoliday,
);
