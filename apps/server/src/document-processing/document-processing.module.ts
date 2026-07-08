import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentProcessingProducer } from './document-processing.producer';
import { DocumentProcessingConsumer } from './document-processing.consumer';
import { VectorService } from './vector.service';
import { DOCUMENT_PROCESSING_QUEUE } from './document-processing.types';
import { ParserModule } from '@/document-parser/document-parser.module';
import { DocumentStorageModule } from '@/document-storage/document-storage.module';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: DOCUMENT_PROCESSING_QUEUE }),
    ParserModule,
    DocumentStorageModule,
    PrismaModule,
  ],
  providers: [
    DocumentProcessingProducer,
    DocumentProcessingConsumer,
    VectorService,
  ],
  exports: [DocumentProcessingProducer],
})
export class DocumentProcessingModule {}
