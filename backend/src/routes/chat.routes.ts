import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  chat,
  chatStream,
  getWidgetConfig,
  updateWidgetConfig,
} from '../controllers/chat.controller';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  debugKb,
} from '../controllers/kb.controller';
import { UserRole } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateCafeId = (req: Request, res: Response, next: NextFunction) => {
  if (!UUID_RE.test(req.params.cafeId)) {
    res.status(400).json({ success: false, message: 'Invalid cafeId format' });
    return;
  }
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// mergeParams: true so :cafeId from parent router is accessible
const router = Router({ mergeParams: true });

router.use(validateCafeId);

// ── Public chat endpoints ──────────────────────────────────────────────────────

router.post('/chat', chat);
router.post('/chat/stream', chatStream);
router.get('/chat/config', getWidgetConfig);
router.get('/kb/debug', debugKb);

// ── Provider-only endpoints ────────────────────────────────────────────────────

router.put(
  '/chat/config',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  updateWidgetConfig,
);

router.get(
  '/kb/documents',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  listDocuments,
);

router.post(
  '/kb/documents',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  upload.single('file'),
  uploadDocument,
);

router.delete(
  '/kb/documents/:documentId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  deleteDocument,
);

export { router as chatRouter };
