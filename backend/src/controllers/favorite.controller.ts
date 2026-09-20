import type { Response, NextFunction } from 'express';
import { AuthRequest, AppError } from '../types';
import * as favoriteService from '../services/favorite.service';

export async function getFavorites(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const data = await favoriteService.listFavorites(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addFavorite(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const { cafeId } = req.params;
    if (!cafeId) throw new AppError('cafeId parameter is required', 400, 'BAD_REQUEST');
    await favoriteService.addFavorite(req.user.userId, cafeId);
    res.status(201).json({ success: true, message: 'Added to favorites' });
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const { cafeId } = req.params;
    if (!cafeId) throw new AppError('cafeId parameter is required', 400, 'BAD_REQUEST');
    await favoriteService.removeFavorite(req.user.userId, cafeId);
    res.json({ success: true, message: 'Removed from favorites' });
  } catch (err) {
    next(err);
  }
}

export async function syncFavorites(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const { cafeIds } = req.body;
    if (!Array.isArray(cafeIds)) {
      throw new AppError('cafeIds must be an array of strings', 400, 'BAD_REQUEST');
    }
    const data = await favoriteService.syncFavorites(req.user.userId, cafeIds);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
