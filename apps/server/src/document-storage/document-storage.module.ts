import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentStorageService } from './document-storage.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { AzureBlobProvider } from './providers/azure-blob.provider';
import { STORAGE_PROVIDER_TOKEN } from './document-storage.types';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('STORAGE_PROVIDER') ?? 'local';
        if (provider === 'azure') {
          return new AzureBlobProvider();
        }
        return new LocalStorageProvider(config);
      },
      inject: [ConfigService],
    },
    DocumentStorageService,
  ],
  exports: [DocumentStorageService],
})
export class DocumentStorageModule {}
