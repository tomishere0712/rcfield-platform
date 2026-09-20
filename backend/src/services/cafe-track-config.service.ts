import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { CafeTrackConfig } from '../models/cafe-track-config.entity';
import { Cafe } from '../models/cafe.entity';
import { TrackType } from '../models/track-type.entity';
import { Booking } from '../models/booking.entity';
import { AppError, BookingStatus, UserRole } from '../types';
import { getManagedCafeOrThrow } from './cafe.service';
import { uploadImage } from './cloudinary.service';

interface Viewer {
  userId: string;
  role: UserRole;
}

export interface CreateTrackConfigBody {
  track_type_id: string;
  max_concurrent: number;
  byoc_capacity: number;
  description?: string;
  sort_order?: number;
}

export interface UpdateTrackConfigBody {
  max_concurrent?: number;
  byoc_capacity?: number;
  description?: string | null;
  images?: string[];
  sort_order?: number;
  is_active?: boolean;
}

function formatConfig(config: CafeTrackConfig, trackType?: TrackType) {
  return {
    id: config.id,
    cafe_id: config.cafeId,
    track_type_id: config.trackTypeId,
    track_type: trackType
      ? {
          id: trackType.id,
          code: trackType.code,
          name: trackType.name,
          description: trackType.description,
        }
      : undefined,
    max_concurrent: config.maxConcurrent,
    byoc_capacity: config.byocCapacity,
    images: config.images,
    description: config.description,
    sort_order: config.sortOrder,
    is_active: config.isActive,
    created_at: config.createdAt,
    updated_at: config.updatedAt,
  };
}

async function listFallbackTrackConfigs(
  cafeId: string,
): Promise<ReturnType<typeof formatConfig>[]> {
  const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
  if (!cafe || cafe.deletedAt) {
    throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  }

  const trackTypes = cafe.trackTypes.length
    ? await AppDataSource.getRepository(TrackType).findBy({ id: In(cafe.trackTypes) })
    : [];
  const trackTypeMap = new Map(trackTypes.map((trackType) => [trackType.id, trackType]));

  return cafe.trackTypes
    .map((trackTypeId) => trackTypeMap.get(trackTypeId))
    .filter((trackType): trackType is TrackType => Boolean(trackType?.isActive))
    .map((trackType, index) => ({
      id: trackType.id,
      cafe_id: cafe.id,
      track_type_id: trackType.id,
      track_type: {
        id: trackType.id,
        code: trackType.code,
        name: trackType.name,
        description: trackType.description,
      },
      max_concurrent: cafe.maxConcurrentBookings,
      byoc_capacity: cafe.byocCapacity,
      images: [],
      description: trackType.description,
      sort_order: trackType.sortOrder ?? index,
      is_active: trackType.isActive,
      created_at: cafe.createdAt,
      updated_at: cafe.updatedAt,
    }));
}

export async function listTrackConfigs(
  cafeId: string,
  viewer?: Viewer,
  options?: { includeInactive?: boolean },
): Promise<ReturnType<typeof formatConfig>[]> {
  const repo = AppDataSource.getRepository(CafeTrackConfig);
  const trackTypeRepo = AppDataSource.getRepository(TrackType);
  const cafeRepo = AppDataSource.getRepository(Cafe);

  const cafe = await cafeRepo.findOne({ where: { id: cafeId } });
  if (!cafe || cafe.deletedAt) {
    throw new AppError('Cafe not found', 404, 'CAFE_NOT_FOUND');
  }

  // Cấu hình đã tắt chỉ hiện khi màn hình CHỦ ĐỘNG xin, và người xin phải có
  // quyền. Trước đây chỉ cần là provider là thấy hết ở mọi màn — nên chủ quán
  // mở trang chi nhánh công khai của chính mình lại thấy cả sân đã tắt, tức
  // nhìn thấy thứ khách hàng không thấy ngay trên trang dành cho khách.
  const canSeeInactive = viewer?.role === UserRole.PROVIDER || viewer?.role === UserRole.ADMIN;
  const includeInactive = Boolean(options?.includeInactive) && canSeeInactive;

  const qb = repo
    .createQueryBuilder('ctc')
    .where('ctc.cafe_id = :cafeId', { cafeId })
    .andWhere('ctc.deleted_at IS NULL')
    .orderBy('ctc.sort_order', 'ASC')
    .addOrderBy('ctc.created_at', 'ASC');

  if (!includeInactive) {
    qb.andWhere('ctc.is_active = true');
  }

  let configs: CafeTrackConfig[];
  try {
    configs = await qb.getMany();
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') {
      return listFallbackTrackConfigs(cafeId);
    }
    throw error;
  }

  // If cafe has trackTypes that don't have records in cafe_track_configs, initialize them
  if (cafe.trackTypes && cafe.trackTypes.length > 0) {
    // Phải hỏi lại DB xem hàng nào ĐANG TỒN TẠI, không dùng `configs` ở trên.
    //
    // `configs` đã bị lọc thêm `is_active = true` khi người xem không phải
    // provider, trong khi unique index `idx_cafe_track_configs_unique_active`
    // chỉ tính `deleted_at IS NULL`. Một cấu hình bị tắt vẫn chiếm chỗ trong
    // index nhưng vắng mặt trong `configs`, nên code cũ tưởng là thiếu rồi
    // INSERT đè lên chính nó → 23505, và khách xem trang chi nhánh ăn 500.
    const existingRows = await repo
      .createQueryBuilder('ctc')
      .select('ctc.track_type_id', 'trackTypeId')
      .where('ctc.cafe_id = :cafeId', { cafeId })
      .andWhere('ctc.deleted_at IS NULL')
      .getRawMany<{ trackTypeId: string }>();

    const existingTrackTypeIds = new Set(existingRows.map((row) => row.trackTypeId));
    const missingTrackTypeIds = cafe.trackTypes.filter((id) => !existingTrackTypeIds.has(id));

    if (missingTrackTypeIds.length > 0) {
      const activeTrackTypes = await trackTypeRepo.findBy({ id: In(missingTrackTypeIds) });
      const newConfigs: CafeTrackConfig[] = [];
      for (const tt of activeTrackTypes) {
        if (!tt.isActive) continue;
        const newCfg = repo.create({
          cafeId,
          trackTypeId: tt.id,
          maxConcurrent: cafe.maxConcurrentBookings || 10,
          byocCapacity: cafe.byocCapacity || 0,
          images: [],
          description: tt.description,
          sortOrder: tt.sortOrder ?? 0,
          isActive: true,
        });
        newConfigs.push(newCfg);
      }
      if (newConfigs.length > 0) {
        // `orIgnore` thay cho `save`: đây là một endpoint GET, hai request cùng
        // lúc trên một chi nhánh chưa khởi tạo sẽ cùng thấy "thiếu" và cùng
        // chèn. Không có ON CONFLICT DO NOTHING thì một trong hai ăn 23505 —
        // chính là lỗi vừa gặp, chỉ khác đường dẫn tới.
        await repo
          .createQueryBuilder()
          .insert()
          .into(CafeTrackConfig)
          .values(newConfigs)
          .orIgnore()
          .execute();

        // Đọc lại thay vì push `newConfigs` vào bộ nhớ: khi va chạm xảy ra,
        // hàng thắng cuộc là của request kia, và `newConfigs` không mang id
        // thật của hàng đó.
        configs = await qb.getMany();
      }
    }
  }

  const trackTypeIds = [...new Set(configs.map((c) => c.trackTypeId))];
  const trackTypes = trackTypeIds.length ? await trackTypeRepo.findByIds(trackTypeIds) : [];
  const trackTypeMap = new Map(trackTypes.map((tt) => [tt.id, tt]));

  return configs.map((c) => formatConfig(c, trackTypeMap.get(c.trackTypeId)));
}

export async function createTrackConfig(
  cafeId: string,
  viewer: Viewer,
  body: CreateTrackConfigBody,
): Promise<ReturnType<typeof formatConfig>> {
  await getManagedCafeOrThrow(cafeId, viewer);

  const trackTypeRepo = AppDataSource.getRepository(TrackType);
  const trackType = await trackTypeRepo.findOne({ where: { id: body.track_type_id } });
  if (!trackType || !trackType.isActive) {
    throw new AppError('Track type not found or inactive', 400, 'TRACK_TYPE_NOT_FOUND');
  }

  const repo = AppDataSource.getRepository(CafeTrackConfig);
  const existing = await repo
    .createQueryBuilder('ctc')
    .where('ctc.cafe_id = :cafeId', { cafeId })
    .andWhere('ctc.track_type_id = :trackTypeId', { trackTypeId: body.track_type_id })
    .andWhere('ctc.deleted_at IS NULL')
    .getOne();

  if (existing) {
    throw new AppError(
      'Track config already exists for this track type',
      409,
      'TRACK_CONFIG_ALREADY_EXISTS',
    );
  }

  const config = repo.create({
    cafeId,
    trackTypeId: body.track_type_id,
    maxConcurrent: body.max_concurrent,
    byocCapacity: body.byoc_capacity,
    description: body.description ?? null,
    sortOrder: body.sort_order ?? 0,
    images: [],
    isActive: true,
  });

  await repo.save(config);
  return formatConfig(config, trackType);
}

export async function updateTrackConfig(
  cafeId: string,
  configId: string,
  viewer: Viewer,
  body: UpdateTrackConfigBody,
): Promise<ReturnType<typeof formatConfig>> {
  await getManagedCafeOrThrow(cafeId, viewer);

  const repo = AppDataSource.getRepository(CafeTrackConfig);
  let config = await repo.findOne({
    where: { id: configId, cafeId },
  });
  if (!config || config.deletedAt) {
    config = await repo.findOne({ where: { trackTypeId: configId, cafeId } });
  }
  if (!config || config.deletedAt) {
    const trackType = await AppDataSource.getRepository(TrackType).findOne({
      where: { id: configId },
    });
    if (trackType) {
      const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
      config = repo.create({
        cafeId,
        trackTypeId: trackType.id,
        maxConcurrent: cafe?.maxConcurrentBookings ?? 10,
        byocCapacity: cafe?.byocCapacity ?? 0,
        images: [],
        description: trackType.description,
        sortOrder: trackType.sortOrder ?? 0,
        isActive: true,
      });
      await repo.save(config);
    } else {
      throw new AppError('Track config not found', 404, 'TRACK_CONFIG_NOT_FOUND');
    }
  }

  // Deactivation guard: block if upcoming active bookings exist
  if (body.is_active === false && config.isActive) {
    const upcomingCount = await AppDataSource.getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.track_config_id = :configId', { configId: config.id })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
      })
      .andWhere('b.slot_start > NOW()')
      .getCount();

    if (upcomingCount > 0) {
      throw new AppError(
        'Cannot deactivate: upcoming bookings exist on this track',
        409,
        'TRACK_CONFIG_HAS_UPCOMING_BOOKINGS',
      );
    }
  }

  if (body.max_concurrent !== undefined) config.maxConcurrent = body.max_concurrent;
  if (body.byoc_capacity !== undefined) config.byocCapacity = body.byoc_capacity;
  if (body.description !== undefined) config.description = body.description;
  if (body.images !== undefined) config.images = body.images;
  if (body.sort_order !== undefined) config.sortOrder = body.sort_order;
  if (body.is_active !== undefined) config.isActive = body.is_active;

  await repo.save(config);

  const trackType = await AppDataSource.getRepository(TrackType).findOne({
    where: { id: config.trackTypeId },
  });
  return formatConfig(config, trackType ?? undefined);
}

export async function uploadTrackConfigImages(
  cafeId: string,
  configId: string,
  viewer: Viewer,
  files: Express.Multer.File[],
): Promise<string[]> {
  await getManagedCafeOrThrow(cafeId, viewer);

  const repo = AppDataSource.getRepository(CafeTrackConfig);
  let config = await repo.findOne({ where: { id: configId, cafeId } });
  if (!config || config.deletedAt) {
    config = await repo.findOne({ where: { trackTypeId: configId, cafeId } });
  }
  if (!config || config.deletedAt) {
    const trackType = await AppDataSource.getRepository(TrackType).findOne({
      where: { id: configId },
    });
    if (trackType) {
      const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: cafeId } });
      config = repo.create({
        cafeId,
        trackTypeId: trackType.id,
        maxConcurrent: cafe?.maxConcurrentBookings ?? 10,
        byocCapacity: cafe?.byocCapacity ?? 0,
        images: [],
        description: trackType.description,
        sortOrder: trackType.sortOrder ?? 0,
        isActive: true,
      });
      await repo.save(config);
    } else {
      throw new AppError('Track config not found', 404, 'TRACK_CONFIG_NOT_FOUND');
    }
  }

  if (config.images.length + files.length > 20) {
    throw new AppError('Too many images: max 20 per track config', 400, 'TOO_MANY_IMAGES');
  }

  const newUrls: string[] = [];
  for (const file of files) {
    const uploaded = await uploadImage({
      buffer: file.buffer,
      folder: `rcfield/tracks/${cafeId}/${config.id}`,
      publicIdPrefix: `track-${config.id}`,
    });
    newUrls.push(uploaded.url);
  }

  // Prepend newly uploaded images so the new image immediately becomes the cover (images[0])
  config.images = [...newUrls, ...config.images];
  await repo.save(config);
  return config.images;
}

export async function getTrackConfigOrThrow(
  cafeId: string,
  configId: string,
): Promise<CafeTrackConfig> {
  const config = await AppDataSource.getRepository(CafeTrackConfig).findOne({
    where: { id: configId, cafeId, isActive: true },
  });
  if (!config || config.deletedAt) {
    throw new AppError('Track config not found or inactive', 400, 'TRACK_CONFIG_NOT_FOUND');
  }
  return config;
}
