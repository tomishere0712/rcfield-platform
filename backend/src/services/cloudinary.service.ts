import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { env } from '../config/env';
import { AppError } from '../types';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new AppError('Cloudinary chưa được cấu hình', 500, 'CLOUDINARY_NOT_CONFIGURED');
  }

  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  configured = true;
}

export async function uploadImage(options: {
  buffer: Buffer;
  folder: string;
  publicIdPrefix: string;
}): Promise<{ publicId: string; url: string }> {
  ensureConfigured();

  const publicId = `${options.publicIdPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: publicId,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result.public_id) {
          return reject(new Error('Cloudinary upload failed'));
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );

    Readable.from(options.buffer).pipe(stream);
  });
}

export async function uploadFile(options: {
  buffer: Buffer;
  folder: string;
  publicIdPrefix: string;
}): Promise<{ publicId: string; url: string }> {
  ensureConfigured();

  const publicId = `${options.publicIdPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: publicId,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result.public_id) {
          return reject(new Error('Cloudinary upload failed'));
        }
        resolve({ publicId: result.public_id, url: result.secure_url });
      },
    );

    Readable.from(options.buffer).pipe(stream);
  });
}

export async function deleteFile(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

export function extractPublicIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = '/upload/';
    const uploadIndex = parsed.pathname.indexOf(marker);
    if (uploadIndex < 0) return null;

    let publicPath = parsed.pathname.slice(uploadIndex + marker.length);
    publicPath = publicPath.replace(/^v\d+\//, '');
    publicPath = publicPath.replace(/\.[^.]+$/, '');
    return publicPath || null;
  } catch {
    return null;
  }
}
