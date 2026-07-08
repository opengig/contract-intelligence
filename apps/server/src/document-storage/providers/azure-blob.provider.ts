import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  StorageProvider,
  UploadTarget,
} from '@/document-storage/document-storage.types';

/**
 * Azure Blob Storage provider using the Valet Key pattern.
 * Generates short-lived SAS URLs so the client uploads directly to Azure —
 * the API never proxies the file bytes.
 *
 * TODO: implement once AZURE_STORAGE_CONNECTION_STRING is configured.
 * Real implementation will use @azure/storage-blob:
 *   BlobServiceClient → ContainerClient → BlobClient → generateSasUrl()
 */
@Injectable()
export class AzureBlobProvider implements StorageProvider {
  async generateUploadTarget(_fileName: string): Promise<UploadTarget> {
    console.log('generateUploadTarget', _fileName);
    throw new NotImplementedException(
      'Azure Blob Storage is not yet configured. Set STORAGE_PROVIDER=local for local development.',
    );
  }

  async saveLocal(_file: Express.Multer.File): Promise<string> {
    console.log('saveLocal', _file);
    throw new NotImplementedException(
      'Azure provider does not support local save.',
    );
  }

  getFilePath(_storageKey: string): string {
    console.log('getFilePath', _storageKey);
    throw new NotImplementedException(
      'Azure provider streams files directly — use the SAS download URL instead.',
    );
  }
}
