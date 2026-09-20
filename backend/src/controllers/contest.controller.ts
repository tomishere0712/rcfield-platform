import type { NextFunction, Request, Response } from 'express';
import { AuthRequest, AppError, ContestStatus, UserRole } from '../types';
import {
  ContestCatalogTemplateQuerySchema,
  ContestAssignStaffSchema,
  ContestAuditLogsQuerySchema,
  ContestBanCreateSchema,
  ContestBanLiftSchema,
  ContestCorrectResultsSchema,
  ContestCheckInSchema,
  ContestEntryPaymentCreateSchema,
  ContestGenerateMatchesSchema,
  ContestListQuerySchema,
  ContestMatchesQuerySchema,
  ContestMarkFeePaidSchema,
  ContestMatchParticipantsUpdateSchema,
  ContestRegistrationsQuerySchema,
  ContestRegistrationActionSchema,
  ContestMatchWalkoverSchema,
  ContestRejectRegistrationSchema,
  ContestSubmitResultsSchema,
  CreateContestRegistrationSchema,
  CreateContestSchema,
  MyContestRegistrationsQuerySchema,
  UpdateByocDeclarationSchema,
  UpdateContestSchema,
} from '../validate';
import * as contestService from '../services/contest.service';
import * as contestRuntimeService from '../services/contest-runtime.service';
import * as contestRentalService from '../services/contest-rental.service';
import * as racingNetworkService from '../services/racing-network.service';

function requireViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

export const contestController = {
  async listContestTypes(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await contestService.listContestTypes();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listContestFormats(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await contestService.listContestFormats();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listContestTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ContestCatalogTemplateQuerySchema.parse(req.query);
      const data = await contestService.listContestTemplates(query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listContests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = ContestListQuerySchema.parse(req.query);
      const viewer = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await contestService.listContests({ ...query, viewer });
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: query.page, limit: query.limit },
      });
    } catch (error) {
      next(error);
    }
  },

  async getContestById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const data = await contestService.getContestDetail(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createContest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      if (viewer.role !== UserRole.PROVIDER) throw new AppError('Forbidden', 403, 'FORBIDDEN');
      const body = CreateContestSchema.parse(req.body);
      const data = await contestService.createContest(viewer, body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateContest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = UpdateContestSchema.parse(req.body);
      const data = await contestService.updateContest(req.params.contestId, viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async openContest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.changeContestStatus(
        req.params.contestId,
        viewer,
        ContestStatus.OPEN,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async closeContest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.changeContestStatus(
        req.params.contestId,
        viewer,
        ContestStatus.CLOSED,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async cancelContest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.changeContestStatus(
        req.params.contestId,
        viewer,
        ContestStatus.CANCELLED,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listCafeContests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = ContestListQuerySchema.parse({ ...req.query, cafe_id: req.params.cafeId });
      const viewer = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const result = await contestService.listContests({ ...query, viewer });
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: query.page, limit: query.limit },
      });
    } catch (error) {
      next(error);
    }
  },

  async createRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = CreateContestRegistrationSchema.parse(req.body);
      const data = await contestService.createContestRegistration(
        req.params.contestId,
        viewer,
        body,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listMyRegistrations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const query = MyContestRegistrationsQuerySchema.parse(req.query);
      const data = await contestService.listMyContestRegistrations(viewer, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listContestRegistrations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const query = ContestRegistrationsQuerySchema.parse(req.query);
      const data = await contestService.listContestRegistrations(
        req.params.contestId,
        viewer,
        query,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listContestBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.listContestBookings(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async markEntryFeePaid(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestMarkFeePaidSchema.parse(req.body);
      const data = await contestService.markEntryFeePaid(
        req.params.registrationId,
        viewer,
        body.note,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async waiveEntryFee(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestMarkFeePaidSchema.parse(req.body);
      const data = await contestService.waiveEntryFee(req.params.registrationId, viewer, body.note);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async approveRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestRegistrationActionSchema.parse(req.body);
      const data = await contestService.approveRegistration(
        req.params.registrationId,
        viewer,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async rejectRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestRejectRegistrationSchema.parse(req.body);
      const data = await contestService.rejectRegistration(
        req.params.registrationId,
        viewer,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async cancelRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestRegistrationActionSchema.parse(req.body);
      const data = await contestService.cancelRegistration(
        req.params.registrationId,
        viewer,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateByocDeclaration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = UpdateByocDeclarationSchema.parse(req.body);
      const data = await contestService.updateByocDeclaration(
        req.params.registrationId,
        viewer,
        body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async lookupRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const code = String(req.query.check_in_code ?? '').trim();
      if (!code) throw new AppError('Thiếu check_in_code', 400, 'CHECK_IN_CODE_REQUIRED');
      const data = await contestService.lookupRegistrationByCode(
        req.params.contestId,
        code,
        viewer,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async checkInRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestCheckInSchema.parse(req.body);
      const data = await contestService.checkInRegistration(
        req.params.registrationId,
        body.checked_in_cafe_id,
        viewer,
        body.rental_vehicle_id ?? null,
        body.byoc_confirmed,
        body.byoc_inspection,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listHandoverUnits(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.listRegistrationHandoverUnits(
        req.params.registrationId,
        viewer,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listMatches(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
      const query = ContestMatchesQuerySchema.parse(req.query);
      const data = await contestRuntimeService.listContestMatches(
        req.params.contestId,
        viewer,
        query,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async generateMatches(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestGenerateMatchesSchema.parse(req.body);
      const data = await contestRuntimeService.generateContestMatches(
        req.params.contestId,
        viewer,
        body,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async updateMatchParticipants(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestMatchParticipantsUpdateSchema.parse(req.body);
      const data = await contestRuntimeService.updateMatchParticipants(
        req.params.matchId,
        viewer,
        body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async submitMatchResults(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestSubmitResultsSchema.parse(req.body);
      const data = await contestRuntimeService.submitMatchResults(req.params.matchId, viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async correctMatchResults(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestCorrectResultsSchema.parse(req.body);
      const data = await contestRuntimeService.correctMatchResults(
        req.params.matchId,
        viewer,
        body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contest-matches/:matchId/walkover  [auth]
  async recordMatchWalkover(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestMatchWalkoverSchema.parse(req.body);
      const data = await contestRuntimeService.recordMatchWalkover(
        req.params.matchId,
        viewer,
        body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async advanceMatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestRuntimeService.advanceMatch(req.params.matchId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async generateFinalBracket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestRuntimeService.generateContestFinalBracket(
        req.params.contestId,
        viewer,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async publishLeaderboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestRuntimeService.publishContestLeaderboard(
        req.params.contestId,
        viewer,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listAuditLogs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const query = ContestAuditLogsQuerySchema.parse(req.query);
      const result = await contestRuntimeService.listContestAuditLogs(
        req.params.contestId,
        viewer,
        query,
      );
      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  },

  async getMetrics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestRuntimeService.getContestMetrics(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/sync-race-records  [auth]
  async syncRaceRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await racingNetworkService.syncContestRaceRecords(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listStaffAssignments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.listContestStaffAssignments(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async assignStaff(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestAssignStaffSchema.parse(req.body);
      const data = await contestService.assignContestStaff(
        req.params.contestId,
        body.staff_id,
        viewer,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async unassignStaff(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.unassignContestStaff(
        req.params.contestId,
        req.params.staffId,
        viewer,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createEntryFeePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestEntryPaymentCreateSchema.parse(req.body ?? {});
      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddr =
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0].trim()
          : req.ip || req.socket.remoteAddress || '127.0.0.1';
      const data = await contestService.createContestEntryPaymentUrl(
        req.params.registrationId,
        viewer,
        ipAddr,
        body.return_url,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async listBans(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestService.listContestBans(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async createBan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestBanCreateSchema.parse(req.body);
      const data = await contestService.createContestBan(req.params.contestId, viewer, body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async liftBan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestBanLiftSchema.parse(req.body ?? {});
      const data = await contestService.liftContestBan(
        req.params.contestId,
        req.params.banId,
        viewer,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async disqualifyRegistration(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestRegistrationActionSchema.parse(req.body ?? {});
      const data = await contestService.disqualifyRegistration(
        req.params.registrationId,
        viewer,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getRentalOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      requireViewer(req);
      const data = await contestRentalService.getContestRentalOptions(req.params.contestId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async getAvailableRentalVehicles(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      requireViewer(req);
      // Chỉ cần chi nhánh: khung giờ do lịch thi đấu quyết định nên không còn
      // tham số slot, và khách chọn dòng xe chứ không chọn từng chiếc.
      const cafeId = String(req.query.cafe_id ?? '').trim();
      if (!cafeId) throw new AppError('Thiếu cafe_id', 400, 'CAFE_ID_REQUIRED');
      const data = await contestRentalService.getContestAvailableRentalVehicles(
        req.params.contestId,
        cafeId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async uploadBanner(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const file = req.file;
      if (!file) throw new AppError('File là bắt buộc.', 400, 'FILE_REQUIRED');
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
      if (!allowed.has(file.mimetype)) {
        throw new AppError('Chỉ hỗ trợ ảnh JPG, PNG, WEBP.', 422, 'UNSUPPORTED_FORMAT');
      }
      const data = await contestService.uploadContestBanner(req.params.contestId, viewer, {
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
