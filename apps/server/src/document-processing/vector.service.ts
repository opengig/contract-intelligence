import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';

const CHUNK_WORDS = 600;
const OVERLAP_WORDS = 100;
const EMBED_BATCH = 100;
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions

@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createEmbeddings(contractId: string): Promise<void> {
    const contract = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      select: { extractedText: true },
    });

    if (!contract.extractedText?.trim()) {
      this.logger.warn(
        `Contract ${contractId} has no extracted text — skipping vectors`,
      );
      return;
    }

    const chunks = this.chunkText(contract.extractedText);

    this.logger.log(
      `Generating ${chunks.length} prose embeddings for contract ${contractId}`,
    );

    await this.prisma.contractChunk.deleteMany({ where: { contractId } });

    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);

      const { embeddings } = await embedMany({
        model: openai.embedding(EMBEDDING_MODEL),
        values: batch,
      });

      // Prisma marks the vector column as Unsupported, so we use raw SQL
      for (let j = 0; j < batch.length; j++) {
        const id = randomUUID();
        const chunkIndex = i + j;
        const content = batch[j];
        // pgvector expects the literal format: '[0.1,0.2,...]'
        const vector = `[${embeddings[j].join(',')}]`;

        await this.prisma.$executeRaw`
          INSERT INTO "ContractChunk" (id, "contractId", "chunkIndex", content, embedding, "createdAt", "updatedAt")
          VALUES (
            ${id},
            ${contractId},
            ${chunkIndex},
            ${content},
            ${vector}::vector,
            NOW(),
            NOW()
          )
        `;
      }
    }

    this.logger.log(
      `Stored ${chunks.length} chunks for contract ${contractId}`,
    );
  }

  /** Split text into overlapping word-windows. */
  private chunkText(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];

    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + CHUNK_WORDS, words.length);
      chunks.push(words.slice(start, end).join(' '));
      if (end >= words.length) break;
      start = end - OVERLAP_WORDS;
    }

    return chunks;
  }
}
