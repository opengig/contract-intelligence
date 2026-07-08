import { Module } from '@nestjs/common';
import { ContractsController } from './controllers/contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractsRepository } from './repository/contracts.repository';
import { DocumentStorageModule } from '@/document-storage/document-storage.module';
import { DocumentProcessingModule } from '@/document-processing/document-processing.module';
import { FilesModule } from '@/files/files.module';

@Module({
  imports: [DocumentStorageModule, DocumentProcessingModule, FilesModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsRepository],
  exports: [ContractsService],
})
export class ContractsModule {}
