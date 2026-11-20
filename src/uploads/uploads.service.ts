import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { UPLOADS_ROOT } from './image-uploads.options';

@Injectable()
export class UploadsService {
  // Verifies the real file content (magic bytes), not just the client's mimetype.
  // Deletes the file and throws if it is not a genuine JPG/PNG.
  async assertImageSignature(file: Express.Multer.File) {
    const handle = await fs.open(file.path, 'r');
    const buf = Buffer.alloc(8);
    try {
      await handle.read(buf, 0, 8, 0);
    } finally {
      await handle.close();
    }
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (!isJpg && !isPng) {
      await this.deleteFile(file.destination.split(/[\\/]/).pop()!, file.filename);
      throw new BadRequestException('File content is not a valid JPG or PNG image');
    }
  }

  async deleteFile(subfolder: string, filename: string) {
    try {
      await fs.unlink(join(UPLOADS_ROOT, subfolder, filename));
    } catch {
      /* already gone: ignore */
    }
  }
}