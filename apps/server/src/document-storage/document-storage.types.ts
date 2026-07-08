export interface UploadTarget {
  uploadUrl: string;
  storageKey: string;
  strategy: 'local' | 'azure';
}

export interface StorageProvider {
  generateUploadTarget(fileName: string): Promise<UploadTarget>;
  saveLocal(file: Express.Multer.File): Promise<string>;
  getFilePath(storageKey: string): string;
}

export const STORAGE_PROVIDER_TOKEN = 'STORAGE_PROVIDER';
