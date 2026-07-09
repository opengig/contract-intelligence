import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '@/prisma/prisma.service';
import { DocumentParserService } from '@/document-parser/document-parser.service';
import { DocumentStorageService } from '@/document-storage/document-storage.service';
import { VectorService } from './vector.service';
import { MetadataExtractionService } from './metadata-extraction.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  DocumentProcessingJobData,
} from './document-processing.types';
import type { ExtractedTable } from '@repo/types';

@Processor(DOCUMENT_PROCESSING_QUEUE, {
  lockDuration: 300_000,
  lockRenewTime: 150_000,
})
export class DocumentProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: DocumentParserService,
    private readonly storage: DocumentStorageService,
    private readonly vector: VectorService,
    private readonly metadataExtraction: MetadataExtractionService,
  ) {
    super();
  }

  async process(job: Job<DocumentProcessingJobData>): Promise<void> {
    const { contractId, storageKey, fileName } = job.data;
    this.logger.log(`Processing contract ${contractId} (job ${job.id})`);

    try {
      // Step 1 — mark as parsing
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: 'parsing' },
      });

      // Step 2 — Parse: branch on file type
      const filePath = this.storage.getFilePath(storageKey);

      const ext = path.extname(fileName).toLowerCase();
      const isXlsx = ext === '.xlsx' || ext === '.xls';
      const isDocx = ext === '.docx' || ext === '.doc';

      let parseResult: Awaited<ReturnType<typeof this.parser.refine>>;

      if (isDocx) {
        if (!fs.existsSync(filePath)) {
          throw new Error(
            `File ${storageKey} not found — cannot process. Please re-upload.`,
          );
        }

        this.logger.log(`Parsing DOCX: ${filePath}`);
        parseResult = await this.parser.parse(filePath);
        this.logger.log(`DOCX parsed: ${parseResult.text.length} chars`);
      } else if (isXlsx) {
        if (!fs.existsSync(filePath)) {
          throw new Error(
            `File ${storageKey} not found — cannot process. Please re-upload.`,
          );
        }

        this.logger.log(`Parsing XLSX directly: ${filePath}`);
        parseResult = this.parser.extractFromXlsx(filePath);
        this.logger.log(
          `XLSX parsed: ${parseResult.text.length} chars, ${parseResult.tables?.length ?? 0} sheet(s)`,
        );
      } else {
        const ocrCachePath = `${filePath}.ocr.json`;

        let ocr: Awaited<ReturnType<typeof this.parser.extractWithOcr>>;

        if (fs.existsSync(ocrCachePath)) {
          this.logger.log(`Loading cached OCR from ${ocrCachePath}`);
          ocr = JSON.parse(fs.readFileSync(ocrCachePath, 'utf-8'));
        } else if (fs.existsSync(filePath)) {
          this.logger.log(`Running Azure DI OCR on ${filePath}`);
          ocr = await this.parser.extractWithOcr(filePath);

          fs.writeFileSync(ocrCachePath, JSON.stringify(ocr), 'utf-8');

          this.logger.log(
            `Cached OCR to ${ocrCachePath} (${ocr.rawText.length} chars, ${ocr.rawTables.length} tables)`,
          );
        } else {
          throw new Error(
            `File ${storageKey} not found and no OCR cache — cannot process. Please re-upload.`,
          );
        }

        parseResult = await this.parser.refine(
          ocr.rawText,
          ocr.rawTables,
          ocr.pages,
        );

        this.logger.log(
          `Refined ${fileName}: ${parseResult.text.length} chars, ${parseResult.pages ?? '?'} pages, ${parseResult.tables?.length ?? 0} table(s)`,
        );
      }

      // Step 4 — overwrite extractedText with refined prose
      await this.prisma.contract.update({
        where: { id: contractId },
        data: {
          extractedText: parseResult.text,
          status: 'parsed',
        },
      });

      // Step 5 — persist structured tables if any were extracted
      if (parseResult.tables && parseResult.tables.length > 0) {
        await this.persistTables(contractId, parseResult.tables);
      }

      // Step 6 — chunk prose text and store vector embeddings in ContractChunk
      await this.vector.createEmbeddings(contractId);

      // Step 7 — extract structured metadata + contract summary embedding
      await this.metadataExtraction.extractAndStore(contractId);

      // Step 8 — mark active
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: 'active' },
      });

      this.logger.log(`Contract ${contractId} processing complete`);
    } catch (err) {
      this.logger.error(
        `Contract ${contractId} processing failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: 'error' },
      });
      throw err; // let BullMQ handle retries
    }
  }

  /**
   * Persists each extracted table as a single ContractTable record containing
   * the complete structured data (name, summary, headers, all rows as JSON).
   */
  private async persistTables(
    contractId: string,
    tables: ExtractedTable[],
  ): Promise<void> {
    await this.prisma.contractTable.deleteMany({ where: { contractId } });

    for (const table of tables) {
      await this.prisma.contractTable.create({
        data: {
          id: randomUUID(),
          contractId,
          name: table.name,
          summary: table.summary,
          headers: table.headers,
          rows: table.rows,
          rowCount: table.rows.length,
        },
      });
    }

    this.logger.log(
      `Persisted ${tables.length} table(s) for contract ${contractId}`,
    );
  }
}
