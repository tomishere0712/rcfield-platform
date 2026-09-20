import { IsNull, Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Package } from '../models/package.entity';
import { AppError, PackageBillingPeriod, PackageStatus, UserRole } from '../types';
import { getManagedCafeOrThrow } from './cafe.service';

interface Viewer {
  userId: string;
  role: UserRole;
}

export interface PackageBody {
  code: string;
  name: string;
  description?: string | null;
  slot_count: number;
  billing_period: PackageBillingPeriod;
  price: number;
  benefits?: string[];
  applicable_play_modes?: string[];
  is_popular?: boolean;
  is_active?: boolean;
}

export type UpdatePackageBody = Partial<PackageBody>;

export interface PackageResponse {
  id: string;
  cafeId: string;
  code: string;
  name: string;
  description: string | null;
  slotCount: number;
  billingPeriod: PackageBillingPeriod;
  price: string;
  benefits: string[];
  applicablePlayModes: string[];
  isPopular: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function decimal(value: number): string {
  return value.toFixed(2);
}

async function assertUniqueCode(cafeId: string, code: string, exceptId?: string): Promise<void> {
  const existing = await AppDataSource.getRepository(Package).findOne({
    where: {
      cafeId,
      code,
      deletedAt: IsNull(),
      ...(exceptId ? { id: Not(exceptId) } : {}),
    },
  });

  if (existing) {
    throw new AppError('Mã gói đã tồn tại ở chi nhánh này', 409, 'PACKAGE_CODE_EXISTS');
  }
}

async function getOwnedPackageOrThrow(
  cafeId: string,
  packageId: string,
  viewer: Viewer,
): Promise<Package> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const item = await AppDataSource.getRepository(Package).findOne({
    where: { id: packageId, cafeId, deletedAt: IsNull() },
  });

  if (!item) {
    throw new AppError('Gói định kỳ không tồn tại', 404, 'PACKAGE_NOT_FOUND');
  }

  return item;
}

export interface PublicPackageResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  slot_count: number;
  price: number;
  valid_days: number;
  billing_period: PackageBillingPeriod;
  benefits: string[];
  applicable_play_modes: string[];
  is_popular: boolean;
}

/** Public listing — no auth required. Returns only ACTIVE packages, no cost_price. */
export async function getPublicPackages(cafeId: string): Promise<PublicPackageResponse[]> {
  const items = await AppDataSource.getRepository(Package).find({
    where: { cafeId, status: PackageStatus.ACTIVE, deletedAt: IsNull() },
    order: { createdAt: 'ASC' },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    slot_count: item.slotCount,
    price: Number(item.price),
    valid_days: item.validDays,
    billing_period: item.billingPeriod ?? validDaysToBillingPeriod(item.validDays),
    benefits: item.benefits ?? [],
    applicable_play_modes: item.applicablePlayModes ?? [],
    is_popular: item.isPopular,
  }));
}

export async function listPackages(cafeId: string, viewer: Viewer): Promise<PackageResponse[]> {
  await getManagedCafeOrThrow(cafeId, viewer);
  const items = await AppDataSource.getRepository(Package).find({
    where: { cafeId, deletedAt: IsNull() },
    order: { createdAt: 'DESC' },
  });
  return items.map(formatPackage);
}

export async function createPackage(
  cafeId: string,
  viewer: Viewer,
  body: PackageBody,
): Promise<PackageResponse> {
  await getManagedCafeOrThrow(cafeId, viewer);
  await assertUniqueCode(cafeId, body.code);

  const item = AppDataSource.getRepository(Package).create({
    cafeId,
    code: body.code,
    name: body.name,
    description: body.description ?? null,
    slotCount: body.slot_count,
    price: decimal(body.price),
    validDays: billingPeriodToValidDays(body.billing_period),
    billingPeriod: body.billing_period,
    benefits: body.benefits ?? [],
    applicablePlayModes: body.applicable_play_modes ?? ['RENTAL', 'BYOC'],
    isPopular: body.is_popular ?? false,
    status: body.is_active === false ? PackageStatus.INACTIVE : PackageStatus.ACTIVE,
  });

  const saved = await AppDataSource.getRepository(Package).save(item);
  return formatPackage(saved);
}

export async function updatePackage(
  cafeId: string,
  packageId: string,
  viewer: Viewer,
  body: UpdatePackageBody,
): Promise<PackageResponse> {
  const item = await getOwnedPackageOrThrow(cafeId, packageId, viewer);

  if (body.code !== undefined && body.code !== item.code) {
    await assertUniqueCode(cafeId, body.code, item.id);
  }

  if (body.code !== undefined) item.code = body.code;
  if (body.name !== undefined) item.name = body.name;
  if (body.description !== undefined) item.description = body.description;
  if (body.slot_count !== undefined) item.slotCount = body.slot_count;
  if (body.billing_period !== undefined) {
    item.validDays = billingPeriodToValidDays(body.billing_period);
    item.billingPeriod = body.billing_period;
  }
  if (body.price !== undefined) item.price = decimal(body.price);
  if (body.benefits !== undefined) item.benefits = body.benefits;
  if (body.applicable_play_modes !== undefined)
    item.applicablePlayModes = body.applicable_play_modes;
  if (body.is_popular !== undefined) item.isPopular = body.is_popular;
  if (body.is_active !== undefined) {
    item.status = body.is_active ? PackageStatus.ACTIVE : PackageStatus.INACTIVE;
  }

  const saved = await AppDataSource.getRepository(Package).save(item);
  return formatPackage(saved);
}

export async function deletePackage(
  cafeId: string,
  packageId: string,
  viewer: Viewer,
): Promise<void> {
  const item = await getOwnedPackageOrThrow(cafeId, packageId, viewer);
  await AppDataSource.getRepository(Package).softDelete(item.id);
}

function billingPeriodToValidDays(period: PackageBillingPeriod): number {
  return period === PackageBillingPeriod.WEEK ? 7 : 30;
}

function validDaysToBillingPeriod(validDays: number): PackageBillingPeriod {
  return validDays <= 7 ? PackageBillingPeriod.WEEK : PackageBillingPeriod.MONTH;
}

function formatPackage(item: Package): PackageResponse {
  return {
    id: item.id,
    cafeId: item.cafeId,
    code: item.code,
    name: item.name,
    description: item.description,
    slotCount: item.slotCount,
    billingPeriod: item.billingPeriod ?? validDaysToBillingPeriod(item.validDays),
    price: item.price,
    benefits: item.benefits ?? [],
    applicablePlayModes: item.applicablePlayModes ?? [],
    isPopular: item.isPopular,
    isActive: item.status === PackageStatus.ACTIVE,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
