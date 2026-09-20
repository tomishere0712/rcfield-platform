import { AppDataSource } from '../config/database';
import { User } from '../models/user.entity';
import { Cafe } from '../models/cafe.entity';
import { AppError, CafeStatus } from '../types';

export async function listFavorites(userId: string): Promise<string[]> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOne({
    where: { id: userId },
    select: ['favorite_cafe_ids'],
  });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return user.favorite_cafe_ids || [];
}

export async function addFavorite(userId: string, cafeId: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const cafeRepo = AppDataSource.getRepository(Cafe);

  // 1. Validate cafe exists, is ACTIVE, and is not deleted
  const cafe = await cafeRepo.findOne({
    where: {
      id: cafeId,
      status: CafeStatus.ACTIVE,
    },
  });
  if (!cafe) {
    throw new AppError('Cafe not found or inactive', 404, 'NOT_FOUND');
  }

  // 2. Ensure user exists
  const userExists = await userRepo.count({ where: { id: userId } });
  if (!userExists) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // 3. Add favorite atomically (idempotent, avoids race conditions)
  await userRepo.query(
    `UPDATE "users"
     SET "favorite_cafe_ids" = array_append("favorite_cafe_ids", $1)
     WHERE "id" = $2 AND NOT ($1 = ANY("favorite_cafe_ids"))`,
    [cafeId, userId],
  );
}

export async function removeFavorite(userId: string, cafeId: string): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);

  // 1. Ensure user exists
  const userExists = await userRepo.count({ where: { id: userId } });
  if (!userExists) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // 2. Remove favorite atomically (idempotent, avoids race conditions)
  await userRepo.query(
    `UPDATE "users"
     SET "favorite_cafe_ids" = array_remove("favorite_cafe_ids", $1)
     WHERE "id" = $2`,
    [cafeId, userId],
  );
}

export async function syncFavorites(userId: string, cafeIds: string[]): Promise<string[]> {
  // Sync using pessimistic write lock (SELECT FOR UPDATE) to avoid concurrent sync conflicts
  return await AppDataSource.transaction(async (entityManager) => {
    const user = await entityManager.findOne(User, {
      where: { id: userId },
      select: ['id', 'favorite_cafe_ids'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    const currentFavorites = user.favorite_cafe_ids || [];

    if (!cafeIds || cafeIds.length === 0) {
      return currentFavorites;
    }

    // Validate and fetch only valid ACTIVE and not-deleted cafes from the incoming list
    const validCafes = await entityManager
      .createQueryBuilder(Cafe, 'cafe')
      .select('cafe.id')
      .where('cafe.id IN (:...ids)', { ids: cafeIds })
      .andWhere('cafe.status = :status', { status: CafeStatus.ACTIVE })
      .getMany();

    const validIncomingIds = validCafes.map((c) => c.id);

    // Merge (union) the valid incoming IDs with current favorites, removing duplicates
    const mergedSet = new Set([...currentFavorites, ...validIncomingIds]);
    const finalFavorites = Array.from(mergedSet);

    user.favorite_cafe_ids = finalFavorites;
    await entityManager.save(User, user);

    return finalFavorites;
  });
}
