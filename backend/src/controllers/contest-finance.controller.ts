import { Response, NextFunction } from 'express';
import { AppError, AuthRequest } from '../types';
import {
  ContestLedgerListQuerySchema,
  CreateContestLedgerEntrySchema,
  UpdateContestLedgerEntrySchema,
} from '../validate';
import { buildContestFinanceReport } from '../services/contest/finance';
import {
  createLedgerEntry,
  listLedgerEntries,
  listMyLedgerEntries,
  softDeleteLedgerEntry,
  updateLedgerEntry,
  uploadLedgerReceipt,
} from '../services/contest/ledger';
import { assertContestFinanceOwner } from '../services/contest/guards';

function requireViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

export const contestFinanceController = {
  // GET /api/v1/contests/:contestId/finance  [auth]
  async getFinanceReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      // Guard riêng của phần tài chính: chỉ provider sở hữu giải. Không dùng
      // assertContestOperator (lọt STAFF) hay mẫu của contest-fee (lọt ADMIN).
      await assertContestFinanceOwner(req.params.contestId, viewer);

      const data = await buildContestFinanceReport(req.params.contestId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/contests/:contestId/ledger-entries  [auth]
  async listEntries(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const query = ContestLedgerListQuerySchema.parse(req.query);
      const data = await listLedgerEntries(req.params.contestId, viewer, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/ledger-entries  [auth]
  async createEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const body = CreateContestLedgerEntrySchema.parse(req.body);
      const data = await createLedgerEntry(req.params.contestId, viewer, body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/contests/:contestId/ledger-entries/mine  [auth]
  async listMyEntries(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const data = await listMyLedgerEntries(req.params.contestId, viewer);
      // Cố ý không kèm meta.total hay bất kỳ số tổng nào — nhân viên chỉ được
      // thấy khoản mình ghi, không thấy bức tranh tài chính của giải.
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /api/v1/contest-ledger-entries/:entryId  [auth]
  async updateEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const body = UpdateContestLedgerEntrySchema.parse(req.body);
      const data = await updateLedgerEntry(req.params.entryId, viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/v1/contest-ledger-entries/:entryId  [auth]
  async deleteEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const data = await softDeleteLedgerEntry(req.params.entryId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/ledger-entries/receipt  [auth]
  async uploadReceipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = requireViewer(req);
      const file = req.file;
      if (!file) throw new AppError('File là bắt buộc.', 400, 'FILE_REQUIRED');

      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
      if (!allowed.has(file.mimetype)) {
        throw new AppError('Chỉ hỗ trợ ảnh JPG, PNG, WEBP.', 422, 'UNSUPPORTED_FORMAT');
      }

      const data = await uploadLedgerReceipt(req.params.contestId, viewer, {
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
