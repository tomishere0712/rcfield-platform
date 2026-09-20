import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: () => process.env.NODE_ENV === 'development',
});

const router = Router();
router.use(authLimiter);

router.post('/register', authController.register);
router.post('/check-exists', authController.checkExists);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', authController.forgotPassword);
router.post('/forgot-password/verify', authController.verifyPasswordResetCode);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/logout', authenticate, authController.logout);

export { router as authRouter };
