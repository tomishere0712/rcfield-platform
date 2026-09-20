import { Router } from 'express';
import { providerOnboardingController } from '../controllers/provider-onboarding.controller';
import { kycUpload } from '../config/multer.config';

export const providerOnboardingRouter = Router();

const kycFields = kycUpload.fields([
  { name: 'cccd_front', maxCount: 1 },
  { name: 'cccd_back', maxCount: 1 },
  { name: 'gpkd', maxCount: 1 },
  { name: 'representative_id', maxCount: 1 },
  { name: 'venue_photo', maxCount: 1 },
]);

// kycFields middleware must run BEFORE controller so req.body text fields are populated
providerOnboardingRouter.post(
  '/register-provider',
  kycFields,
  providerOnboardingController.registerProvider,
);
