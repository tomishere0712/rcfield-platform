import { AppDataSource } from '../config/database';
import { CafeImage } from '../models/cafe-image.entity';
import { AppError, UserRole } from '../types';
import { getCafeDetail, getManagedCafeOrThrow } from './cafe.service';
import { deleteImage, extractPublicIdFromUrl, uploadImage } from './cloudinary.service';

interface Viewer {
  userId: string;
  role: UserRole;
}

export async function listCafeImages(cafeId: string, viewer?: Viewer): Promise<CafeImage[]> {
  await getCafeDetail(cafeId, viewer);
  return AppDataSource.getRepository(CafeImage).find({
    where: { cafeId },
    order: { sortOrder: 'ASC', createdAt: 'ASC' },
  });
}

export async function createCafeImages(options: {
  cafeId: string;
  viewer: Viewer;
  baseSortOrder: number;
  files: Express.Multer.File[];
}): Promise<CafeImage[]> {
  await getManagedCafeOrThrow(options.cafeId, options.viewer);

  const repo = AppDataSource.getRepository(CafeImage);
  const created: CafeImage[] = [];
  const uploadedPublicIds: string[] = [];

  try {
    for (let index = 0; index < options.files.length; index += 1) {
      const file = options.files[index];
      const uploadedImage = await uploadImage({
        buffer: file.buffer,
        folder: `rcfield/cafes/${options.cafeId}/images`,
        publicIdPrefix: `image-${options.cafeId}`,
      });
      uploadedPublicIds.push(uploadedImage.publicId);

      const image = repo.create({
        cafeId: options.cafeId,
        publicId: uploadedImage.publicId,
        url: uploadedImage.url,
        sortOrder: options.baseSortOrder + index,
      });
      created.push(await repo.save(image));
    }

    return created;
  } catch (error) {
    await Promise.all(created.map((image) => repo.delete({ id: image.id }).catch(() => undefined)));
    await Promise.all(
      uploadedPublicIds.map((publicId) => deleteImage(publicId).catch(() => undefined)),
    );
    throw error;
  }
}

export async function deleteCafeImage(options: { imageId: string; viewer: Viewer }): Promise<void> {
  const repo = AppDataSource.getRepository(CafeImage);
  const image = await repo.findOne({ where: { id: options.imageId } });
  if (!image) throw new AppError('Ảnh không tồn tại', 404, 'CAFE_IMAGE_NOT_FOUND');

  await getManagedCafeOrThrow(image.cafeId, options.viewer);
  const publicId = image.publicId ?? extractPublicIdFromUrl(image.url);
  if (!publicId) throw new AppError('Không thể xác định ảnh Cloudinary', 500, 'INVALID_IMAGE_URL');
  await deleteImage(publicId);
  await repo.delete({ id: image.id });
}
