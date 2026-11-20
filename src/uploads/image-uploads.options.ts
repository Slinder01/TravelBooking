import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';

// GEN-08: JPG/PNG only, max 5 MB each
export const UPLOADS_ROOT = join(process.cwd(), 'uploads');
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

// Usage: FileInterceptor('image', imageUploadOptions('posts'))
export const imageUploadOptions = (subfolder: string) => ({
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(UPLOADS_ROOT, subfolder);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, randomUUID() + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 }, // oversize -> 413 automatically
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) =>
    ALLOWED[file.mimetype]
      ? cb(null, true)
      : cb(new BadRequestException('Only JPG and PNG images are allowed'), false),
});