import { IsNull, In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { VehicleCatalog } from '../models/vehicle-catalog.entity';
import { Vehicle } from '../models/vehicle.entity';
import { TrackType } from '../models/track-type.entity';
import { getManagedCafeOrThrow, Viewer } from './cafe.service';
import { AppError, UserRole, VehicleStatus } from '../types';

/** Phiên chơi chưa đóng — xe gán vào đây vẫn còn nghĩa vụ đối soát khi trả. */
const OPEN_SESSION_STATUSES = ['CHECKED_IN', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT'];

/**
 * Chặn thao tác làm biến mất một chiếc xe đang chạy dở.
 *
 * Biên bản trả xe, dòng hư hỏng và khoản tiền đền bù đều bám vào `session_vehicles`.
 * Xoá xe hoặc cho nghỉ hưu giữa ca thì nhân viên không còn chốt được biên bản, mà
 * tiền đền bù thì đã hứa với khách.
 */
async function assertVehicleNotInOpenSession(vehicleId: string): Promise<void> {
  const [row] = await AppDataSource.query<{ session_id: string }[]>(
    `SELECT sv.session_id
       FROM session_vehicles sv
       JOIN sessions s ON s.id = sv.session_id
      WHERE sv.vehicle_id = $1
        AND s.status = ANY($2::session_status_enum[])
      LIMIT 1`,
    [vehicleId, OPEN_SESSION_STATUSES],
  );
  if (row) {
    throw new AppError(
      'Xe đang được sử dụng trong một phiên chơi chưa kết thúc',
      409,
      'VEHICLE_IN_ACTIVE_SESSION',
      { session_id: row.session_id },
    );
  }
}

export async function createVehicleUnit(
  cafeId: string,
  catalogId: string,
  providerId: string,
  body: {
    status?: VehicleStatus;
    identifier?: string | null;
    color?: string | null;
    distinctive_image_url?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown>> {
  // 1. Verify cafe ownership
  const cafe = await getManagedCafeOrThrow(cafeId, { userId: providerId, role: UserRole.PROVIDER });

  // 2. Verify catalog exists under this cafe
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id: catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // 3. Create unit
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const vehicle = new Vehicle();
  vehicle.cafeId = cafe.id;
  vehicle.catalogId = catalog.id;
  vehicle.status = body.status ?? VehicleStatus.AVAILABLE;
  vehicle.identifier = body.identifier ?? null;
  vehicle.color = body.color ?? null;
  vehicle.distinctiveImageUrl = body.distinctive_image_url ?? null;
  vehicle.notes = body.notes ?? null;
  vehicle.metadata = body.metadata ?? null;
  await vehicleRepo.save(vehicle);

  return {
    id: vehicle.id,
    status: vehicle.status,
    last_maintenance_at: vehicle.lastMaintenanceAt,
    identifier: vehicle.identifier,
    color: vehicle.color,
    distinctive_image_url: vehicle.distinctiveImageUrl,
    notes: vehicle.notes,
    metadata: vehicle.metadata,
  };
}

export async function updateVehicleUnit(
  cafeId: string,
  catalogId: string,
  unitId: string,
  viewer: Viewer,
  body: {
    status?: VehicleStatus;
    last_maintenance_at?: Date | null;
    identifier?: string | null;
    color?: string | null;
    distinctive_image_url?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown>> {
  // 1. Verify cafe ownership/staff assignment
  await getManagedCafeOrThrow(cafeId, viewer);

  // 2. Verify catalog exists under this cafe
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id: catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // 3. Find physical unit
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const vehicle = await vehicleRepo.findOne({
    where: { id: unitId, catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!vehicle) {
    throw new AppError('Xe vật lý không tồn tại', 404, 'VEHICLE_NOT_FOUND');
  }

  // 4. RETIRED là quyết định một chiều: xe đã loại khỏi đội thì không quay lại
  // khai thác. Cho đảo ngược thì trạng thái này chỉ còn là một cái nhãn, và lịch
  // sử "xe đã ngừng dùng từ lúc nào" không còn tin được.
  if (
    vehicle.status === VehicleStatus.RETIRED &&
    body.status !== undefined &&
    body.status !== VehicleStatus.RETIRED
  ) {
    throw new AppError(
      'Xe đã ngừng khai thác, không thể chuyển về trạng thái khác',
      409,
      'VEHICLE_RETIRED',
    );
  }
  if (body.status === VehicleStatus.RETIRED && vehicle.status !== VehicleStatus.RETIRED) {
    await assertVehicleNotInOpenSession(unitId);
  }

  // 5. Update fields
  if (body.status !== undefined) vehicle.status = body.status;
  if (body.last_maintenance_at !== undefined) vehicle.lastMaintenanceAt = body.last_maintenance_at;
  if (body.identifier !== undefined) vehicle.identifier = body.identifier;
  if (body.color !== undefined) vehicle.color = body.color;
  if (body.distinctive_image_url !== undefined)
    vehicle.distinctiveImageUrl = body.distinctive_image_url;
  if (body.notes !== undefined) vehicle.notes = body.notes;
  if (body.metadata !== undefined) vehicle.metadata = body.metadata;

  await vehicleRepo.save(vehicle);

  return {
    id: vehicle.id,
    status: vehicle.status,
    last_maintenance_at: vehicle.lastMaintenanceAt,
    identifier: vehicle.identifier,
    color: vehicle.color,
    distinctive_image_url: vehicle.distinctiveImageUrl,
    notes: vehicle.notes,
    metadata: vehicle.metadata,
  };
}

export async function deleteVehicleUnit(
  cafeId: string,
  catalogId: string,
  unitId: string,
  providerId: string,
): Promise<void> {
  // 1. Verify cafe ownership
  await getManagedCafeOrThrow(cafeId, { userId: providerId, role: UserRole.PROVIDER });

  // 2. Verify catalog exists under this cafe
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id: catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // 3. Find physical unit
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const vehicle = await vehicleRepo.findOne({
    where: { id: unitId, catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!vehicle) {
    throw new AppError('Xe vật lý không tồn tại', 404, 'VEHICLE_NOT_FOUND');
  }

  // 4. Không xoá xe đang chạy dở
  await assertVehicleNotInOpenSession(unitId);

  // 5. Soft delete
  vehicle.deletedAt = new Date();
  await vehicleRepo.save(vehicle);
}

export async function getVehicleUnitDetail(
  cafeId: string,
  catalogId: string,
  unitId: string,
  viewer?: Viewer,
): Promise<Record<string, unknown>> {
  // Determine if viewer is cafe operator/owner
  let isOperator = false;
  if (viewer && [UserRole.PROVIDER, UserRole.STAFF].includes(viewer.role as UserRole)) {
    try {
      await getManagedCafeOrThrow(cafeId, viewer);
      isOperator = true;
    } catch {
      isOperator = false;
    }
  }

  // 2. Verify catalog exists under this cafe
  const catalogRepo = AppDataSource.getRepository(VehicleCatalog);
  const catalog = await catalogRepo.findOne({
    where: { id: catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!catalog) {
    throw new AppError('Catalog xe không tồn tại', 404, 'CATALOG_NOT_FOUND');
  }

  // 3. Find physical unit
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const vehicle = await vehicleRepo.findOne({
    where: { id: unitId, catalogId, cafeId, deletedAt: IsNull() },
  });
  if (!vehicle) {
    throw new AppError('Xe vật lý không tồn tại', 404, 'VEHICLE_NOT_FOUND');
  }

  if (!isOperator && vehicle.status === VehicleStatus.RETIRED) {
    throw new AppError('Xe vật lý không tồn tại', 404, 'VEHICLE_NOT_FOUND');
  }

  const base: Record<string, unknown> = {
    id: vehicle.id,
    catalogId: vehicle.catalogId,
    status: vehicle.status,
    identifier: vehicle.identifier,
    color: vehicle.color,
    distinctive_image_url: vehicle.distinctiveImageUrl,
    notes: vehicle.notes,
    metadata: vehicle.metadata as Record<string, unknown> | null,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };

  if (isOperator) {
    base.last_maintenance_at = vehicle.lastMaintenanceAt;
  }

  return base;
}

export async function listVehicleUnits(
  cafeId: string,
  viewer: Viewer | undefined,
  filters: {
    status?: VehicleStatus;
    catalog_id?: string;
    search?: string;
    excludeRetired?: boolean;
  },
): Promise<Record<string, unknown>[]> {
  // Determine if viewer is cafe operator/owner
  let isOperator = false;
  if (viewer && [UserRole.PROVIDER, UserRole.STAFF].includes(viewer.role as UserRole)) {
    try {
      await getManagedCafeOrThrow(cafeId, viewer);
      isOperator = true;
    } catch {
      isOperator = false;
    }
  }

  // 2. Query vehicles
  const vehicleRepo = AppDataSource.getRepository(Vehicle);
  const qb = vehicleRepo
    .createQueryBuilder('v')
    .innerJoinAndSelect('v.catalog', 'c')
    .where('v.cafeId = :cafeId', { cafeId })
    .andWhere('v.deletedAt IS NULL')
    .andWhere('c.deletedAt IS NULL');

  if (filters.status) {
    if (!isOperator && filters.status === VehicleStatus.RETIRED) {
      // Customers cannot query retired units
      qb.andWhere('1 = 0');
    } else {
      qb.andWhere('v.status = :status', { status: filters.status });
    }
  }

  // Always filter RETIRED for non-operators.
  // For operators: also filter if excludeRetired=true (e.g. booking flow — RETIRED cannot be booked anyway)
  if (!isOperator || filters.excludeRetired) {
    qb.andWhere('v.status != :retiredStatus', { retiredStatus: VehicleStatus.RETIRED });
  }

  if (filters.catalog_id) {
    qb.andWhere('v.catalogId = :catalogId', { catalogId: filters.catalog_id });
  }

  if (filters.search) {
    qb.andWhere(
      '(v.identifier ILIKE :search OR v.color ILIKE :search OR v.notes ILIKE :search OR c.name ILIKE :search)',
      { search: `%${filters.search}%` },
    );
  }

  qb.orderBy('v.createdAt', 'DESC');

  const vehicles = await qb.getMany();

  // Load track types referenced by catalogs of retrieved vehicles
  const allTrackTypeIds = Array.from(
    new Set(vehicles.flatMap((v) => v.catalog.compatibleTrackTypes || [])),
  );
  const trackTypes =
    allTrackTypeIds.length > 0
      ? await AppDataSource.getRepository(TrackType).findBy({ id: In(allTrackTypeIds) })
      : [];
  const trackTypeMap = new Map(trackTypes.map((t) => [t.id, t]));

  return vehicles.map((v) => {
    const mappedTracks = (v.catalog.compatibleTrackTypes || [])
      .map((id) => trackTypeMap.get(id))
      .filter((t): t is TrackType => !!t)
      .map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        sortOrder: t.sortOrder,
        isActive: t.isActive,
        description: t.description,
      }));

    const base: Record<string, unknown> = {
      id: v.id,
      catalogId: v.catalogId,
      status: v.status,
      identifier: v.identifier,
      color: v.color,
      distinctive_image_url: v.distinctiveImageUrl,
      notes: v.notes,
      metadata: v.metadata as Record<string, unknown> | null,
      catalog: {
        id: v.catalog.id,
        name: v.catalog.name,
        tier: v.catalog.tier,
        cover_image_url: v.catalog.coverImageUrl,
        hourlyRate: Number(v.catalog.hourlyRate),
        compatibleTrackTypes: mappedTracks,
      },
      createdAt: v.createdAt,
    };

    if (isOperator) {
      base.last_maintenance_at = v.lastMaintenanceAt;
    }

    return base;
  });
}
