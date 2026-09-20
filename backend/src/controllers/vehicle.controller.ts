import type { Response, NextFunction } from 'express';
import {
  CafeIdParamsSchema,
  VehicleCatalogIdParamsSchema,
  CreateVehicleUnitSchema,
  UpdateVehicleUnitSchema,
  VehicleUnitIdParamsSchema,
  ListVehicleUnitsQuerySchema,
} from '../validate';
import { AuthRequest } from '../types';
import * as vehicleService from '../services/vehicle.service';

export const vehicleController = {
  // POST /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units
  async createUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const body = CreateVehicleUnitSchema.parse(req.body);
      const result = await vehicleService.createVehicleUnit(
        cafeId,
        catalogId,
        req.user!.userId,
        body,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId
  async updateUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const { unitId } = VehicleUnitIdParamsSchema.parse(req.params);
      const body = UpdateVehicleUnitSchema.parse(req.body);

      let lastMaintenanceAt: Date | null | undefined = undefined;
      if (body.last_maintenance_at !== undefined) {
        lastMaintenanceAt = body.last_maintenance_at ? new Date(body.last_maintenance_at) : null;
      }

      const result = await vehicleService.updateVehicleUnit(
        cafeId,
        catalogId,
        unitId,
        { userId: req.user!.userId, role: req.user!.role },
        {
          status: body.status,
          last_maintenance_at: lastMaintenanceAt,
          identifier: body.identifier,
          color: body.color,
          distinctive_image_url: body.distinctive_image_url,
          notes: body.notes,
          metadata: body.metadata,
        },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId
  async deleteUnit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const { unitId } = VehicleUnitIdParamsSchema.parse(req.params);

      await vehicleService.deleteVehicleUnit(cafeId, catalogId, unitId, req.user!.userId);
      res.json({ success: true, message: 'Đã xóa xe vật lý thành công' });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/vehicles
  async listUnits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const query = ListVehicleUnitsQuerySchema.parse(req.query);

      const result = await vehicleService.listVehicleUnits(
        cafeId,
        req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
        {
          status: query.status,
          catalog_id: query.catalog_id,
          search: query.search,
          excludeRetired: query.exclude_retired,
        },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units
  async listUnitsForCatalog(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const query = ListVehicleUnitsQuerySchema.omit({ catalog_id: true }).parse(req.query);

      const result = await vehicleService.listVehicleUnits(
        cafeId,
        req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
        {
          status: query.status,
          search: query.search,
          excludeRetired: query.exclude_retired,
          catalog_id: catalogId,
        },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/vehicle-catalogs/:catalogId/units/:unitId
  async getUnitDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { catalogId } = VehicleCatalogIdParamsSchema.parse(req.params);
      const { unitId } = VehicleUnitIdParamsSchema.parse(req.params);

      const result = await vehicleService.getVehicleUnitDetail(
        cafeId,
        catalogId,
        unitId,
        req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
