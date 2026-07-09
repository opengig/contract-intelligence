import { Injectable, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

export interface UploadedFileInfo {
  originalName: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FilesService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  getFileInfo(file: Express.Multer.File): UploadedFileInfo {
    return {
      originalName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  validateFileType(file: Express.Multer.File): void {
    const ALLOWED_MIMES = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'image/webp',
      'image/bmp',
      'text/csv',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ]);

    const ALLOWED_EXTS = new Set([
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.tiff',
      '.webp',
      '.bmp',
      '.csv',
      '.txt',
      '.xlsx',
      '.xls',
      '.docx',
      '.doc',
    ]);

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMES.has(file.mimetype) && !ALLOWED_EXTS.has(ext)) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: PDF, PNG, JPG, TIFF, WEBP, BMP, CSV, TXT, XLSX, DOCX.',
      );
    }
  }

  getUploadDir(): string {
    return this.uploadDir;
  }
}
