export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';

export interface DocumentProcessingJobData {
  contractId: string;
  storageKey: string;
  fileName: string;
}
