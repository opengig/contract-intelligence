import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DocumentProcessingJobData,
} from './document-processing.types';

@Injectable()
export class DocumentProcessingProducer {
  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<DocumentProcessingJobData>,
  ) {}

  async enqueue(data: DocumentProcessingJobData): Promise<string> {
    const job = await this.queue.add('process', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return String(job.id);
  }
}
