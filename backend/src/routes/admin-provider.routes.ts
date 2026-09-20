import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { providerOnboardingController } from '../controllers/provider-onboarding.controller';

export const adminProviderRouter = Router();

adminProviderRouter.use(authenticate, authorize(UserRole.ADMIN));

adminProviderRouter.get('/', providerOnboardingController.getProviders);
adminProviderRouter.get('/:id', providerOnboardingController.getProviderDetail);
adminProviderRouter.get('/:id/cafes', providerOnboardingController.getProviderCafes);
adminProviderRouter.post('/:id/approve', providerOnboardingController.approveProvider);
adminProviderRouter.post('/:id/reject', providerOnboardingController.rejectProvider);
adminProviderRouter.post('/:id/suspend', providerOnboardingController.suspendProvider);
adminProviderRouter.post('/:id/unsuspend', providerOnboardingController.unsuspendProvider);
adminProviderRouter.post('/:id/impersonate', providerOnboardingController.impersonateProvider);
