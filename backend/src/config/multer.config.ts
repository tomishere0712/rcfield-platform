import multer from 'multer';
import { AppError } from '../types';

const KYC_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const KYC_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KYC_MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (KYC_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          'Định dạng file không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, PDF.',
          422,
          'UNSUPPORTED_FORMAT',
        ),
      );
    }
  },
});
