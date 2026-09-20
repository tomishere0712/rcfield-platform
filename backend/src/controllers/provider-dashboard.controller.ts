import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import * as providerDashboardService from '../services/provider-dashboard.service';

export const providerDashboardController = {
  // GET /api/v1/provider/dashboard/kpi
  async getKpi(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to, cafeId } = req.query;

      const kpi = await providerDashboardService.getProviderKpi(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: kpi });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/revenue-trend
  async getRevenueTrend(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { period, from, to, cafeId } = req.query;

      const trend = await providerDashboardService.getProviderRevenueTrend(
        providerId,
        (period as 'daily' | 'weekly' | 'monthly') || 'daily',
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: trend });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/revenue-breakdown
  async getRevenueBreakdown(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to, cafeId } = req.query;

      const breakdown = await providerDashboardService.getProviderRevenueBreakdown(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: breakdown });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/booking-channels
  async getBookingChannels(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to, cafeId } = req.query;

      const channels = await providerDashboardService.getProviderBookingChannels(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: channels });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/branch-performance
  async getBranchPerformance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to } = req.query;

      const performance = await providerDashboardService.getProviderBranchPerformance(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
      );

      res.json({ success: true, data: performance });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/branch-operations
  async getBranchOperations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to } = req.query;

      const operations = await providerDashboardService.getProviderBranchOperations(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
      );

      res.json({ success: true, data: operations });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/recent-bookings
  async getRecentBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { limit, from, to, cafeId } = req.query;

      const bookings = await providerDashboardService.getProviderRecentBookings(
        providerId,
        limit ? Number(limit) : undefined,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: bookings });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/top-stats
  async getTopStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const { from, to, cafeId } = req.query;

      const topStats = await providerDashboardService.getProviderTopStats(
        providerId,
        from ? String(from) : undefined,
        to ? String(to) : undefined,
        cafeId ? String(cafeId) : undefined,
      );

      res.json({ success: true, data: topStats });
    } catch (err) {
      next(err);
    }
  },
};
