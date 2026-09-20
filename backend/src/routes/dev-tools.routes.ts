import { NextFunction, Request, Response, Router } from 'express';
import { CLIENT_SCRIPT, STYLE, renderContestLab } from '../dev-tools/contest-lab.template';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { AppDataSource } from '../config/database';
import { AppError, AuthRequest, UserRole } from '../types';
import { ContestCheckInSchema } from '../validate';
import { checkInRegistration, openContestRegistrationForDemo } from '../services/contest';
import {
  executeContestPurge,
  hardDeleteUsers,
  inTransaction,
  previewContestPurge,
  previewUserPurge,
  softDeleteUsers,
} from '../services/purge.service';

/**
 * Công cụ dựng dữ liệu giải đấu cho môi trường thử.
 *
 * Trang này KHÔNG chạm vào cơ sở dữ liệu — nó gọi đúng những endpoint mà giao
 * diện thật gọi, theo đúng thứ tự. Nhờ vậy dữ liệu sinh ra đi qua đủ mọi kiểm
 * tra nghiệp vụ, không bị lệch trạng thái như khi chèn thẳng vào bảng.
 *
 * Phục vụ từ chính backend nên trang cùng nguồn với API — không vướng CORS, và
 * không phải dựng thêm gì để chạy.
 */
const router = Router();

/**
 * Khoá mở cửa, chỉ có hiệu lực khi `DEV_TOOLS_TOKEN` được khai.
 *
 * Đây không phải lớp xác thực — trang tự nó không cầm quyền gì, mọi lời gọi
 * API đều mang token đăng nhập do người dùng tự nhập. Khoá này chỉ để trang
 * không nằm phơi trên tên miền thật cho ai gõ trúng đường dẫn cũng thấy.
 *
 * Trả 404 chứ không 403: 403 xác nhận đường dẫn có tồn tại, còn 404 thì với
 * người dò đường trang này không khác gì đã tắt.
 */
function requireDevToolsKey(req: Request, res: Response, next: NextFunction) {
  if (!env.devTools.token) return next();
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (key !== env.devTools.token) {
    res.status(404).type('text').send('Not Found');
    return;
  }
  next();
}

router.use(requireDevToolsKey);

/**
 * The production deployment must explicitly configure a second, non-user
 * secret before the time-bypass route can even be discovered.
 */
function requireProductionDevToolsToken(_req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV === 'production' && !env.devTools.token) {
    res.status(404).type('text').send('Not Found');
    return;
  }
  next();
}

// POST /dev-tools/contest-registrations/:registrationId/check-in-now [provider/staff]
//
// Only the contest time/status window is bypassed. The shared service still
// checks confirmation, entry fee, branch, operator permission and vehicle
// inspection/handover exactly like the production endpoint.
router.post(
  '/contest-registrations/:registrationId/check-in-now',
  requireProductionDevToolsToken,
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.STAFF),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      if (!authReq.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = ContestCheckInSchema.parse(req.body);
      const data = await checkInRegistration(
        req.params.registrationId,
        body.checked_in_cafe_id,
        { userId: authReq.user.userId, role: authReq.user.role },
        body.rental_vehicle_id ?? null,
        body.byoc_confirmed,
        body.byoc_inspection,
        { bypassWindow: true, bypassReason: 'CONTEST_LAB' },
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// POST /dev-tools/contests/:contestId/open-registration-now [provider]
//
// Chỉ đổi mốc mở đăng ký của đúng contest đang demo. API đăng ký thật vẫn chạy
// toàn bộ guard production; endpoint này không bật bypass toàn máy chủ.
router.post(
  '/contests/:contestId/open-registration-now',
  requireProductionDevToolsToken,
  authenticate,
  authorize(UserRole.PROVIDER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      if (!authReq.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await openContestRegistrationForDemo(req.params.contestId, {
        userId: authReq.user.userId,
        role: authReq.user.role,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// GET /dev-tools/contest-lab
router.get('/contest-lab', (req, res) => {
  // Chuyển tiếp khoá xuống hai tệp con — xem chú thích ở `renderContestLab`.
  const assetQuery = env.devTools.token
    ? `?key=${encodeURIComponent(String(req.query.key ?? ''))}`
    : '';
  res.type('html').send(renderContestLab(assetQuery));
});

// GET /dev-tools/contest-lab.css
router.get('/contest-lab.css', (_req, res) => {
  res.type('css').send(STYLE);
});

// GET /dev-tools/contest-lab.js
//
// Tách khỏi trang thay vì nhúng nội tuyến: chính sách bảo mật nội dung của ứng
// dụng chỉ cho chạy script cùng nguồn.
router.get('/contest-lab.js', (_req, res) => {
  res.type('js').send(CLIENT_SCRIPT);
});

/**
 * GET /dev-tools/customers  [admin]
 *
 * Danh sách tài khoản khách để chọn làm vận động viên, thay cho việc gõ tay
 * từng email — gõ tay thì mười người đã mất kiên nhẫn, mà giải đấu thật cần
 * mười sáu, ba hai.
 *
 * Đặt ở dev-tools chứ KHÔNG mở một endpoint liệt kê người dùng cho toàn hệ
 * thống: đây là nhu cầu của công cụ dựng dữ liệu, không phải năng lực sản phẩm.
 * Mở ra ở /api/v1 là từ đó về sau có một API xuất danh bạ người dùng mà không ai
 * cố ý thêm.
 *
 * Chặn hai lớp: khoá dev-tools ở trên, và token ADMIN thật ở đây. Chỉ khoá thôi
 * là chưa đủ — email người dùng là dữ liệu cá nhân, ai cầm khoá cũng tải được
 * cả danh bạ thì khoá đó thành chìa vạn năng.
 */
router.get(
  '/customers',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const rows = await AppDataSource.query<
        { id: string; email: string; full_name: string | null; created_at: Date }[]
      >(
        `SELECT id, email, full_name, created_at
           FROM users
          WHERE role = $1 AND deleted_at IS NULL AND is_active = true
            AND ($2 = '' OR email ILIKE '%' || $2 || '%' OR full_name ILIKE '%' || $2 || '%')
          ORDER BY created_at DESC
          LIMIT $3`,
        [UserRole.CUSTOMER, q, limit],
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Dọn dữ liệu thử qua giao diện.
 *
 * Nguy hiểm hơn hẳn bản dòng lệnh: chạy script cần quyền vào máy chủ, còn ở đây
 * chỉ cần khoá dev-tools và một phiên admin. Nên siết thêm hai thứ mà CLI không
 * có:
 *
 *  1. Xem trước và thực hiện là HAI endpoint. Không có đường nào xoá chỉ bằng
 *     một lời gọi — muốn xoá phải chủ ý gọi đúng endpoint xoá.
 *  2. Thân yêu cầu phải mang lại CHÍNH mục tiêu đang xoá trong trường `confirm`.
 *     Bấm nhầm nút không đủ để mất dữ liệu; phải gõ lại đúng email hoặc mẫu.
 *
 * Toàn bộ logic dùng chung `purge.service` với CLI, nên chốt chặn không thể
 * lệch giữa hai đường.
 */
function assertConfirm(body: unknown, expected: string): void {
  const confirm = (body as { confirm?: string } | null)?.confirm;
  if (typeof confirm !== 'string' || confirm.trim() !== expected.trim()) {
    throw new AppError(
      `Gõ lại chính xác "${expected}" vào ô xác nhận để thực hiện.`,
      400,
      'CONFIRM_MISMATCH',
    );
  }
}

const adminOnly = [authenticate, authorize(UserRole.ADMIN)];

// POST /dev-tools/purge/contests/preview  [admin]
router.post('/purge/contests/preview', ...adminOnly, async (req, res, next) => {
  try {
    const provider = String((req.body as { provider?: string })?.provider ?? '');
    const data = await inTransaction(false, (qr) => previewContestPurge(qr, provider));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /dev-tools/purge/contests  [admin]
router.post('/purge/contests', ...adminOnly, async (req, res, next) => {
  try {
    const provider = String((req.body as { provider?: string })?.provider ?? '');
    const data = await inTransaction(true, async (qr) => {
      const pv = await previewContestPurge(qr, provider);
      // Xác nhận bằng EMAIL chủ sân, không phải bằng chuỗi người dùng tự gõ vào
      // ô tìm kiếm: nhập id rồi xác nhận id thì không đọc lại được mình sắp xoá
      // giải của ai.
      assertConfirm(req.body, pv.provider.email);
      await executeContestPurge(qr, pv.contestIds);
      return { deleted: pv.contestIds.length, counts: pv.counts };
    });
    logger.warn('Purge', `xoá giải qua Contest Lab: ${provider}`, {
      actor: (req as AuthRequest).user?.userId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** Đọc bộ chọn từ thân yêu cầu: danh sách id ưu tiên hơn mẫu email. */
function readSelector(body: unknown): { like: string } | { ids: string[] } {
  const b = (body ?? {}) as { like?: string; ids?: unknown };
  // Mảng RỖNG vẫn là chọn-theo-danh-sách. Rơi sang nhánh mẫu email thì lỗi trả
  // về là "Thiếu mẫu email", trong khi người dùng đang ở bảng tick và chỉ quên
  // chọn ai — thông báo chỉ sai chỗ chứ không sai ít.
  if (Array.isArray(b.ids)) return { ids: b.ids.map(String) };
  return { like: String(b.like ?? '') };
}

// POST /dev-tools/purge/users/preview  [admin]
router.post('/purge/users/preview', ...adminOnly, async (req, res, next) => {
  try {
    const data = await inTransaction(false, (qr) => previewUserPurge(qr, readSelector(req.body)));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /dev-tools/purge/users  [admin]
router.post('/purge/users', ...adminOnly, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { like?: string; hard?: boolean; cascade?: boolean };
    const selector = readSelector(req.body);

    const data = await inTransaction(true, async (qr) => {
      const pv = await previewUserPurge(qr, selector);
      // Chọn theo danh sách thì không có mẫu để gõ lại, nên xác nhận bằng SỐ
      // LƯỢNG: buộc phải đọc bảng xem trước mới gõ đúng. Chọn theo mẫu thì gõ
      // lại chính mẫu đó.
      assertConfirm(
        req.body,
        'ids' in selector ? 'xoa ' + pv.users.length : String(body.like ?? ''),
      );
      if (!pv.users.length) return { affected: 0, mode: 'none' };
      if (pv.nonCustomers.length) {
        // Ở dòng lệnh có --include-staff, ở đây thì KHÔNG mở cửa đó: một nút web
        // xoá được chủ sân là rủi ro không đáng đổi lấy tiện lợi.
        throw new AppError(
          'Mẫu này quét trúng ' +
            pv.nonCustomers.map((u) => `${u.email} (${u.role})`).join(', ') +
            '. Thu hẹp lại để chỉ còn tài khoản khách.',
          409,
          'PATTERN_HITS_NON_CUSTOMER',
        );
      }
      const ids = pv.users.map((u) => u.id);
      if (body.hard) {
        await hardDeleteUsers(qr, ids, Boolean(body.cascade));
        return { affected: ids.length, mode: 'hard' };
      }
      await softDeleteUsers(qr, ids);
      return { affected: ids.length, mode: 'soft' };
    });
    logger.warn('Purge', 'dọn tài khoản qua Contest Lab', {
      actor: (req as AuthRequest).user?.userId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export { router as devToolsRouter };
