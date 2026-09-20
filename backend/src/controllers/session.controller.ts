import { Response, NextFunction } from 'express';
import { AppError, AuthRequest } from '../types';
import * as staffService from '../services/staff.service';

export const sessionController = {
  confirmInspection: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { sessionId, inspectionId } = req.params;
      const customerId = req.user!.userId;
      const { agreed, disagreementNote } = req.body;
      const targetInspectionId = inspectionId ?? req.body.inspectionId;

      if (typeof agreed !== 'boolean') {
        throw new AppError('Trường agreed (boolean) là bắt buộc', 400, 'INVALID_BODY');
      }
      if (typeof targetInspectionId !== 'string' || !targetInspectionId) {
        throw new AppError('Trường inspectionId là bắt buộc', 400, 'INVALID_BODY');
      }

      const result = await staffService.customerConfirmInspection(
        sessionId,
        targetInspectionId,
        customerId,
        agreed,
        disagreementNote,
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  respondExtension: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const customerId = req.user!.userId;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        throw new AppError('Trường approved (boolean) là bắt buộc', 400, 'INVALID_BODY');
      }

      const result = await staffService.customerRespondExtension(sessionId, customerId, approved);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  getSessionDetail: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const detail = await staffService.getCustomerSessionDetail(sessionId, req.user!.userId);
      res.json({ success: true, data: detail });
    } catch (err) {
      next(err);
    }
  },
};
