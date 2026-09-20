import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import { UserRole } from '../../types';

// ── Users ────────────────────────────────────────────────────────────────────

export const DEFAULT_PASSWORD = 'Test@123456';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

interface CreateUserOptions {
  email?: string;
  role?: UserRole;
  full_name?: string;
  password?: string;
  is_active?: boolean;
  auth_provider?: 'LOCAL' | 'GOOGLE';
}

export async function createTestUser(options: CreateUserOptions = {}) {
  const {
    email,
    role = UserRole.CUSTOMER,
    full_name = 'Test User',
    password = DEFAULT_PASSWORD,
    is_active = true,
    auth_provider = 'LOCAL',
  } = options;
  const uniqueEmail = email ?? `test_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
  const password_hash = await bcrypt.hash(password, 10);

  const [user] = await AppDataSource.query(
    `INSERT INTO users (email, full_name, password_hash, role, is_active, auth_provider)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [uniqueEmail, full_name, password_hash, role, is_active, auth_provider],
  );
  return user;
}

export function generateToken(user: { id: string; email: string; role: UserRole }) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, env.jwt.secret, {
    expiresIn: '1h',
  });
}

// ── Cafes ────────────────────────────────────────────────────────────────────

interface CreateCafeOptions {
  provider_id?: string;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  track_types?: string[];
  byoc_capacity?: number;
  slot_fee_rate?: number;
  latitude?: number;
  longitude?: number;
  amenity_ids?: string[];
}

export async function createTestCafe(options: CreateCafeOptions = {}) {
  const {
    status = 'ACTIVE',
    track_types = ['DRIFT', 'OBSTACLE'],
    byoc_capacity = 5,
    slot_fee_rate = 150000,
    latitude = 10.7403,
    longitude = 106.712,
    amenity_ids = [],
  } = options;

  const provider_id = options.provider_id ?? (await createTestUser({ role: UserRole.PROVIDER })).id;

  const slug = `test-cafe-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const dbTrackTypes = await AppDataSource.query(`SELECT id, code FROM track_types`);
  const trackTypeMap = new Map<string, string>(
    dbTrackTypes.map((t: { id: string; code: string }) => [t.code, t.id]),
  );
  const mappedTrackIds = track_types
    .map((codeOrUuid) => {
      if (trackTypeMap.has(codeOrUuid)) {
        return trackTypeMap.get(codeOrUuid)!;
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(codeOrUuid)) {
        return codeOrUuid;
      }
      return trackTypeMap.get('DRIFT') || dbTrackTypes[0]?.id;
    })
    .filter(Boolean);

  const [cafe] = await AppDataSource.query(
    `INSERT INTO cafes
       (provider_id, name, slug, address, district, city,
        slot_fee_rate, status, track_types, byoc_capacity,
        operating_hours, latitude, longitude, amenity_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      provider_id,
      'Test Cafe',
      slug,
      '123 Test Street',
      'Quận 7',
      'Hồ Chí Minh',
      slot_fee_rate,
      status,
      mappedTrackIds,
      byoc_capacity,
      JSON.stringify(
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].reduce<Record<string, unknown>>(
          (hours, day) => {
            hours[day] = { open: '00:00', close: '24:00', is_closed: false };
            return hours;
          },
          {},
        ),
      ),
      latitude,
      longitude,
      amenity_ids,
    ],
  );
  return cafe;
}

interface CreateAmenityOptions {
  title?: string;
  description?: string | null;
  icon?: string;
  sort_order?: number;
}

export async function createTestAmenity(options: CreateAmenityOptions = {}) {
  const {
    title = 'Serious Inspection',
    description = 'Khu kiểm tra xe',
    icon = 'shield',
    sort_order = 0,
  } = options;

  const [amenity] = await AppDataSource.query(
    `INSERT INTO amenity_catalog (title, description, icon, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, description, icon, sort_order],
  );
  return amenity;
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

interface CreateVehicleOptions {
  cafe_id: string;
  tier?: 'STANDARD' | 'PREMIUM' | 'RESTRICTED';
  status?: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'RETIRED';
  compatible_track_types?: string[];
}

export async function createTestVehicle(options: CreateVehicleOptions) {
  const { cafe_id, tier = 'STANDARD', status = 'AVAILABLE', compatible_track_types = [] } = options;

  const dbTrackTypes = await AppDataSource.query(`SELECT id, code FROM track_types`);
  const trackTypeMap = new Map<string, string>(
    dbTrackTypes.map((t: { id: string; code: string }) => [t.code, t.id]),
  );
  const mappedCompatTrackIds = compatible_track_types
    .map((codeOrUuid) => {
      if (trackTypeMap.has(codeOrUuid)) {
        return trackTypeMap.get(codeOrUuid)!;
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(codeOrUuid)) {
        return codeOrUuid;
      }
      return trackTypeMap.get('DRIFT') || dbTrackTypes[0]?.id;
    })
    .filter(Boolean);

  // Insert catalog first
  const [catalog] = await AppDataSource.query(
    `INSERT INTO vehicle_catalogs
       (cafe_id, name, tier, hourly_rate, security_deposit, compatible_track_types)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [cafe_id, 'Traxxas Slash 4x4', tier, 50000, 500000, mappedCompatTrackIds],
  );

  // Insert vehicle pointing to catalog
  const [vehicle] = await AppDataSource.query(
    `INSERT INTO vehicles
       (cafe_id, catalog_id, status)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [cafe_id, catalog.id, status],
  );

  return {
    ...vehicle,
    id: vehicle.id,
    catalog_id: catalog.id,
    name: catalog.name,
    tier: catalog.tier,
    hourly_rate: catalog.hourly_rate,
    security_deposit: catalog.security_deposit,
    compatible_track_types: catalog.compatible_track_types,
  };
}
