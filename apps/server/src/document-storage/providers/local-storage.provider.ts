import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import {
  StorageProvider,
  UploadTarget,
} from '@/document-storage/document-storage.types';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir: string;
  private readonly serverUrl: string;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.serverUrl =
      config.get<string>('SERVER_URL') ?? 'http://localhost:8081';

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async generateUploadTarget(fileName: string): Promise<UploadTarget> {
    const uuid = randomUUID();
    const ext = path.extname(fileName);
    const storageKey = `${uuid}${ext}`;

    return {
      uploadUrl: `${this.serverUrl}/contracts/upload/local`,
      storageKey,
      strategy: 'local',
    };
  }

  async saveLocal(file: Express.Multer.File): Promise<string> {
    const uuid = randomUUID();
    const ext = path.extname(file.originalname);
    const storageKey = `${uuid}${ext}`;
    const destPath = path.join(this.uploadDir, storageKey);

    if (file.path) {
      fs.renameSync(file.path, destPath);
    } else if (file.buffer) {
      fs.writeFileSync(destPath, file.buffer);
    }

    this.logger.log(`Saved file to ${destPath} (storageKey: ${storageKey})`);
    return storageKey;
  }

  getFilePath(storageKey: string): string {
    return path.join(this.uploadDir, storageKey);
  }
}
