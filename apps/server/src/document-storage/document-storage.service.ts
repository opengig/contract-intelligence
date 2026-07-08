import { Inject, Injectable } from '@nestjs/common';
import {
  StorageProvider,
  STORAGE_PROVIDER_TOKEN,
  UploadTarget,
} from '@/document-storage/document-storage.types';

@Injectable()
export class DocumentStorageService {
  constructor(
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly provider: StorageProvider,
  ) {}

  generateUploadTarget(fileName: string): Promise<UploadTarget> {
    return this.provider.generateUploadTarget(fileName);
  }

  saveLocal(file: Express.Multer.File): Promise<string> {
    return this.provider.saveLocal(file);
  }

  getFilePath(storageKey: string): string {
    return this.provider.getFilePath(storageKey);
  }
}
