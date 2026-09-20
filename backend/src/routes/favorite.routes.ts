import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as favoriteController from '../controllers/favorite.controller';

export const favoriteRouter = Router();

// All favorite routes require authentication
favoriteRouter.use(authenticate);

favoriteRouter.get('/', favoriteController.getFavorites);
favoriteRouter.post('/sync', favoriteController.syncFavorites);
favoriteRouter.post('/:cafeId', favoriteController.addFavorite);
favoriteRouter.delete('/:cafeId', favoriteController.removeFavorite);
