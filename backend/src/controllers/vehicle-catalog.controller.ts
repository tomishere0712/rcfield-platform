import type { Response, NextFunction } from 'express';
import {
  CafeIdParamsSchema,
  VehicleCatalogIdParamsSchema,
  CreateVehicleCatalogSchema,
  UpdateVehicleCatalogSchema,
} from '../validate';
import { AuthRequest } from '../types';
import * as vehicleCatalogService from '../services/vehicle-catalog.service';

export const vehicleCatalogController = {
  // GET /api/v1/cafes/:cafeId/vehicle-catalogs
  async listCatalogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const result = await vehicleCatalogService.listVehicleCatalogs(cafeId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId
  async getCatalogDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const result = await vehicleCatalogService.getVehicleCatalogDetail(catalogId, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/vehicle-catalogs
  async createCatalog(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const body = CreateVehicleCatalogSchema.parse(req.body);
      const result = await vehicleCatalogService.createVehicleCatalog(
        cafeId,
        req.user!.userId,
        body,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId
  async updateCatalog(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const body = UpdateVehicleCatalogSchema.parse(req.body);
      const result = await vehicleCatalogService.updateVehicleCatalog(
        catalogId,
        cafeId,
        req.user!.userId,
        body,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId
  async deleteCatalog(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      await vehicleCatalogService.deleteVehicleCatalog(catalogId, cafeId, req.user!.userId);
      res.json({ success: true, message: 'Đã xóa catalog xe thành công' });
    } catch (err) {
      next(err);
    }
  },
};
