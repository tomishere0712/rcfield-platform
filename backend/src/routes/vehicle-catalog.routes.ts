import { Router } from 'express';
import {
  authenticate,
  authorize,
  requireActiveProvider,
  optionalAuthenticate,
} from '../middlewares/auth.middleware';
import { vehicleCatalogController } from '../controllers/vehicle-catalog.controller';
import { vehicleController } from '../controllers/vehicle.controller';
import { UserRole } from '../types';

export const vehicleCatalogRouter = Router({ mergeParams: true });

vehicleCatalogRouter.get('/', optionalAuthenticate, vehicleCatalogController.listCatalogs);

vehicleCatalogRouter.get(
  '/:catalogId',
  optionalAuthenticate,
  vehicleCatalogController.getCatalogDetail,
);

vehicleCatalogRouter.post(
  '/',
  authenticate,
  authorize([UserRole.PROVIDER], 'Chỉ đối tác (Provider) mới có quyền thực hiện hành động này'),
  requireActiveProvider,
  vehicleCatalogController.createCatalog,
);

vehicleCatalogRouter.patch(
  '/:catalogId',
  authenticate,
  authorize([UserRole.PROVIDER], 'Chỉ đối tác (Provider) mới có quyền thực hiện hành động này'),
  requireActiveProvider,
  vehicleCatalogController.updateCatalog,
);

vehicleCatalogRouter.delete(
  '/:catalogId',
  authenticate,
  authorize([UserRole.PROVIDER], 'Chỉ đối tác (Provider) mới có quyền thực hiện hành động này'),
  requireActiveProvider,
  vehicleCatalogController.deleteCatalog,
);

// Physical units routes
vehicleCatalogRouter.post(
  '/:catalogId/units',
  authenticate,
  authorize([UserRole.PROVIDER], 'Chỉ đối tác (Provider) mới có quyền thực hiện hành động này'),
  requireActiveProvider,
  vehicleController.createUnit,
);

vehicleCatalogRouter.get(
  '/:catalogId/units',
  optionalAuthenticate,
  vehicleController.listUnitsForCatalog,
);

vehicleCatalogRouter.get(
  '/:catalogId/units/:unitId',
  optionalAuthenticate,
  vehicleController.getUnitDetail,
);

vehicleCatalogRouter.patch(
  '/:catalogId/units/:unitId',
  authenticate,
  authorize(
    [UserRole.PROVIDER, UserRole.STAFF],
    'Chỉ đối tác hoặc nhân viên chi nhánh mới có quyền thực hiện hành động này',
  ),
  requireActiveProvider,
  vehicleController.updateUnit,
);

vehicleCatalogRouter.delete(
  '/:catalogId/units/:unitId',
  authenticate,
  authorize([UserRole.PROVIDER], 'Chỉ đối tác (Provider) mới có quyền thực hiện hành động này'),
  requireActiveProvider,
  vehicleController.deleteUnit,
);
