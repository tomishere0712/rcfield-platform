import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { VehicleCatalog } from '../models/vehicle-catalog.entity';
import { VehicleCatalogImage } from '../models/vehicle-catalog-image.entity';
import { Vehicle } from '../models/vehicle.entity';
import { getManagedCafeOrThrow, Viewer } from './cafe.service';
import { TrackType } from '../models/track-type.entity';
import { AppError, UserRole, VehicleStatus, AssetTier } from '../types';

interface CatalogImageInput {
  url: string;
  sort_order?: number;
}

export interface CreateVehicleCatalogInput {
  name: string;
  description?: string | null;
  tier: AssetTier;
  hourly_rate: number;
  security_deposit: number;
  compatible_track_types: string[];
  cover_image_url?: string | null;
  images?: CatalogImageInput[];
}

export interface UpdateVehicleCatalogInput {
  name?: string;
  description?: string | null;
  tier?: AssetTier;
  hourly_rate?: number;
  security_deposit?: number;
  compatible_track_types?: string[];
  cover_image_url?: string | null;
  images?: CatalogImageInput[];
}

export async function listVehicleCatalogs(cafeId: string): Promise<Record<string, unknown>[]> {
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const imageRepo = AppDataSource.getRepository(VehicleCatalogImage);
  const vehicleRepo = AppDataSource.getRepository(Vehicle);

  const catalogs = await catalogRepo.find({
    where: { cafeId, deletedAt: IsNull() },
    order: { createdAt: 'DESC' },
  });

  if (catalogs.length === 0) return [];

  const catalogIds = catalogs.map((c) => c.id);

  // Load images
  const images = await imageRepo.find({
    where: { catalogId: In(catalogIds) },
    order: { sortOrder: 'ASC' },
  });

  // Group images by catalogId
  const imagesMap: Record<string, string[]> = {};
  for (const img of images) {
    if (!imagesMap[img.catalogId]) {
      imagesMap[img.catalogId] = [];
    }
    imagesMap[img.catalogId].push(img.url);
  }

  // Get physical vehicle counts grouped by catalogId
  const counts = await vehicleRepo
    .createQueryBuilder('v')
    .select('v.catalog_id', 'catalogId')
    .addSelect('COUNT(v.id)', 'total')
    .addSelect("SUM(CASE WHEN v.status = 'AVAILABLE' THEN 1 ELSE 0 END)", 'available')
    .addSelect("SUM(CASE WHEN v.status = 'MAINTENANCE' THEN 1 ELSE 0 END)", 'maintenance')
    .where('v.cafe_id = :cafeId AND v.deleted_at IS NULL', { cafeId })
    .groupBy('v.catalog_id')
    .getRawMany();

  const countsMap: Record<string, { total: number; available: number; maintenance: number }> = {};
  for (const count of counts) {
    countsMap[count.catalogId] = {
      total: parseInt(count.total, 10) || 0,
      available: parseInt(count.available, 10) || 0,
      maintenance: parseInt(count.maintenance, 10) || 0,
    };
  }

  // Batch load all referenced track types to avoid N+1 queries
  const allTrackTypeIds = Array.from(
    new Set(catalogs.flatMap((c) => c.compatibleTrackTypes || [])),
  );
  const trackTypes =
    allTrackTypeIds.length > 0
      ? await AppDataSource.getRepository(TrackType).findBy({ id: In(allTrackTypeIds) })
      : [];
  const trackTypeMap = new Map(trackTypes.map((t) => [t.id, t]));

  return catalogs.map((c) => {
    const stats = countsMap[c.id] || { total: 0, available: 0, maintenance: 0 };
    const mappedTracks = (c.compatibleTrackTypes || [])
      .map((id) => trackTypeMap.get(id))
      .filter((t): t is TrackType => !!t)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      id: c.id,
      cafeId: c.cafeId,
      name: c.name,
      description: c.description,
      tier: c.tier,
      hourlyRate: c.hourlyRate,
      securityDeposit: c.securityDeposit,
      compatibleTrackTypes: mappedTracks,
      coverImageUrl: c.coverImageUrl,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      images: imagesMap[c.id] || [],
      total_units: stats.total,
      available_units: stats.available,
      maintenance_units: stats.maintenance,
    };
  });
}

export async function getVehicleCatalogDetail(
  id: string,
  viewer?: Viewer,
): Promise<Record<string, unknown>> {
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const imageRepo = AppDataSource.getRepository(VehicleCatalogImage);
  const vehicleRepo = AppDataSource.getRepository(Vehicle);

  const catalog = await catalogRepo.findOne({
    where: { id, deletedAt: IsNull() },
  });

  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // Fetch images
  const images = await imageRepo.find({
    where: { catalogId: id },
    order: { sortOrder: 'ASC' },
  });

  // Fetch physical units
  const units = await vehicleRepo.find({
    where: { catalogId: id, deletedAt: IsNull() },
  });

  // Determine if viewer is cafe operator/owner
  let isOperator = false;
  if (viewer && [UserRole.PROVIDER, UserRole.STAFF].includes(viewer.role as UserRole)) {
    try {
      await getManagedCafeOrThrow(catalog.cafeId, viewer);
      isOperator = true;
    } catch {
      isOperator = false;
    }
  }

  // Load track type objects dynamically without filtering by isActive to preserve historical references
  const trackTypes =
    catalog.compatibleTrackTypes.length > 0
      ? await AppDataSource.getRepository(TrackType).findBy({
          id: In(catalog.compatibleTrackTypes),
        })
      : [];
  const trackTypesSorted = (catalog.compatibleTrackTypes || [])
    .map((uuid) => trackTypes.find((t) => t.id === uuid))
    .filter((t): t is TrackType => !!t)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const visibleUnits = isOperator ? units : units.filter((u) => u.status !== VehicleStatus.RETIRED);

  return {
    id: catalog.id,
    cafeId: catalog.cafeId,
    name: catalog.name,
    description: catalog.description,
    tier: catalog.tier,
    hourlyRate: catalog.hourlyRate,
    securityDeposit: catalog.securityDeposit,
    compatibleTrackTypes: trackTypesSorted,
    coverImageUrl: catalog.coverImageUrl,
    createdAt: catalog.createdAt,
    updatedAt: catalog.updatedAt,
    images: images.map((img) => ({ id: img.id, url: img.url, sort_order: img.sortOrder })),
    units: visibleUnits.map((u) => {
      const base: Record<string, unknown> = {
        id: u.id,
        status: u.status,
        identifier: u.identifier,
        color: u.color,
        distinctive_image_url: u.distinctiveImageUrl,
        notes: u.notes,
        metadata: u.metadata as Record<string, unknown> | null,
      };
      if (isOperator) {
        base.last_maintenance_at = u.lastMaintenanceAt;
      }
      return base;
    }),
  };
}

export async function createVehicleCatalog(
  cafeId: string,
  providerId: string,
  body: CreateVehicleCatalogInput,
): Promise<Record<string, unknown>> {
  // 1. Verify cafe ownership
  const cafe = await getManagedCafeOrThrow(cafeId, { userId: providerId, role: UserRole.PROVIDER });

  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = new VehicleCatalog();
  catalog.cafeId = cafe.id;
  catalog.name = body.name;
  catalog.description = body.description ?? null;
  catalog.tier = body.tier;
  catalog.hourlyRate = body.hourly_rate;
  catalog.securityDeposit = body.security_deposit;
  catalog.compatibleTrackTypes = body.compatible_track_types;
  catalog.coverImageUrl = body.cover_image_url ?? null;

  await catalogRepo.save(catalog);

  // 2. Save secondary images
  if (body.images && body.images.length > 0) {
    const imageRepo = AppDataSource.getRepository(VehicleCatalogImage);
    const entities = body.images.map((img: CatalogImageInput, idx: number) => {
      const vi = new VehicleCatalogImage();
      vi.catalogId = catalog.id;
      vi.url = img.url;
      vi.sortOrder = img.sort_order ?? idx;
      return vi;
    });
    await imageRepo.save(entities);
  }

  return getVehicleCatalogDetail(catalog.id);
}

export async function updateVehicleCatalog(
  id: string,
  cafeId: string,
  providerId: string,
  body: UpdateVehicleCatalogInput,
): Promise<Record<string, unknown>> {
  // 1. Verify cafe ownership
  await getManagedCafeOrThrow(cafeId, { userId: providerId, role: UserRole.PROVIDER });

  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id, cafeId, deletedAt: IsNull() },
  });

  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  if (body.name !== undefined) catalog.name = body.name;
  if (body.description !== undefined) catalog.description = body.description;
  if (body.tier !== undefined) catalog.tier = body.tier;
  if (body.hourly_rate !== undefined) catalog.hourlyRate = body.hourly_rate;
  if (body.security_deposit !== undefined) catalog.securityDeposit = body.security_deposit;
  if (body.compatible_track_types !== undefined)
    catalog.compatibleTrackTypes = body.compatible_track_types;
  if (body.cover_image_url !== undefined) catalog.coverImageUrl = body.cover_image_url;

  await catalogRepo.save(catalog);

  // 2. Update images if provided
  if (body.images !== undefined) {
    const imageRepo = AppDataSource.getRepository(VehicleCatalogImage);
    await imageRepo.delete({ catalogId: id });
    if (body.images.length > 0) {
      const entities = body.images.map((img: CatalogImageInput, idx: number) => {
        const vi = new VehicleCatalogImage();
        vi.catalogId = id;
        vi.url = img.url;
        vi.sortOrder = img.sort_order ?? idx;
        return vi;
      });
      await imageRepo.save(entities);
    }
  }

  return getVehicleCatalogDetail(id);
}

export async function deleteVehicleCatalog(
  id: string,
  cafeId: string,
  providerId: string,
): Promise<void> {
  // 1. Verify cafe ownership
  await getManagedCafeOrThrow(cafeId, { userId: providerId, role: UserRole.PROVIDER });

  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id, cafeId, deletedAt: IsNull() },
  });

  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // Soft delete catalog
  catalog.deletedAt = new Date();
  await catalogRepo.save(catalog);

  // Soft delete all physical units of this catalog
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  await vehicleRepo.update({ catalogId: id }, { deletedAt: new Date() });
}
