import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';

const queryIntentSchema = z.object({
  carrierName: z
    .string()
    .nullable()
    .describe('Carrier/vendor name mentioned in query'),
  clientName: z
    .string()
    .nullable()
    .describe('Client/shipper/customer name mentioned in query'),
  mode: z
    .string()
    .nullable()
    .describe(
      'Transport mode if mentioned (air, LTL, TL, rail, ocean, parcel)',
    ),
  origin: z
    .string()
    .nullable()
    .describe('Origin city, state, country, or zip if mentioned'),
  destination: z
    .string()
    .nullable()
    .describe('Destination city, state, country, or zip if mentioned'),
  dateContext: z
    .string()
    .nullable()
    .describe('Any date/year context (e.g. "2023 contract", "current rates")'),
});

export interface RoutedContract {
  id: string;
  name: string;
  vendorName: string;
  summary: string | null;
  score: number;
}

@Injectable()
export class ContractRouterService {
  private readonly logger = new Logger(ContractRouterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async routeQuery(query: string, topK = 5): Promise<RoutedContract[]> {
    this.logger.log(`Routing query: "${query.slice(0, 100)}"`);

    // Step 1: Extract intent from query
    const intent = await this.extractIntent(query);
    this.logger.log(`Intent: ${JSON.stringify(intent)}`);

    // Step 2: Vector search on contract summaries
    const vectorResults = await this.vectorSearch(query, topK);

    // Step 3: Metadata filter (if intent has carrier/mode)
    const metadataResults = await this.metadataFilter(intent, topK);

    // Step 4: Merge and rank
    const merged = this.mergeResults(vectorResults, metadataResults, topK);
    this.logger.log(`Routed to ${merged.length} contracts`);

    return merged;
  }

  private async extractIntent(query: string) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4.1'),
        system:
          'Extract search intent from a logistics contract query. Only fill fields explicitly mentioned.',
        prompt: query,
        schema: queryIntentSchema,
      });
      return object;
    } catch {
      return {
        carrierName: null,
        mode: null,
        origin: null,
        destination: null,
        dateContext: null,
      };
    }
  }

  private async vectorSearch(
    query: string,
    topK: number,
  ): Promise<RoutedContract[]> {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });
    const vec = `[${embedding.join(',')}]`;

    type Row = {
      id: string;
      name: string;
      vendorName: string;
      summary: string | null;
      similarity: number;
    };

    const results = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         c.id,
         c.name,
         COALESCE(v.name, 'Unassigned') AS "vendorName",
         c.summary,
         1 - (c."summaryEmbedding" <=> '${vec}'::vector) AS similarity
       FROM "Contract" c
       LEFT JOIN "Vendor" v ON c."vendorId" = v.id
       WHERE c.status IN ('active', 'review')
         AND c."summaryEmbedding" IS NOT NULL
       ORDER BY c."summaryEmbedding" <=> '${vec}'::vector
       LIMIT ${topK}`,
    );

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      vendorName: r.vendorName,
      summary: r.summary,
      score: Number(r.similarity),
    }));
  }

  private async metadataFilter(
    intent: z.infer<typeof queryIntentSchema>,
    topK: number,
  ): Promise<RoutedContract[]> {
    const conditions: string[] = [`c.status IN ('active', 'review')`];

    if (intent.carrierName) {
      const escaped = intent.carrierName.replace(/'/g, "''");
      conditions.push(
        `(v.name ILIKE '%${escaped}%' OR cm."carrierName" ILIKE '%${escaped}%')`,
      );
    }
    if (intent.clientName) {
      const escaped = intent.clientName.replace(/'/g, "''");
      conditions.push(
        `(cl.name ILIKE '%${escaped}%' OR cm.shipper ILIKE '%${escaped}%')`,
      );
    }
    if (intent.mode) {
      const escaped = intent.mode.replace(/'/g, "''");
      conditions.push(`cm.mode = '${escaped}'`);
    }

    // Only run if we have meaningful filters beyond status
    if (conditions.length <= 1) return [];

    const where = conditions.join(' AND ');

    type Row = {
      id: string;
      name: string;
      vendorName: string;
      summary: string | null;
    };

    const results = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.id, c.name, COALESCE(v.name, 'Unassigned') AS "vendorName", c.summary
       FROM "Contract" c
       LEFT JOIN "Vendor" v ON c."vendorId" = v.id
       LEFT JOIN "Client" cl ON c."clientId" = cl.id
       LEFT JOIN "ContractMetadata" cm ON cm."contractId" = c.id
       WHERE ${where}
       ORDER BY c."effectiveFrom" DESC NULLS LAST
       LIMIT ${topK}`,
    );

    return results.map((r, i) => ({
      id: r.id,
      name: r.name,
      vendorName: r.vendorName,
      summary: r.summary,
      score: 0.8 - i * 0.05, // Decreasing score for ordering
    }));
  }

  private mergeResults(
    vectorResults: RoutedContract[],
    metadataResults: RoutedContract[],
    topK: number,
  ): RoutedContract[] {
    const seen = new Map<string, RoutedContract>();

    // Metadata matches get a boost
    for (const r of metadataResults) {
      seen.set(r.id, { ...r, score: r.score + 0.2 });
    }

    // Vector results
    for (const r of vectorResults) {
      const existing = seen.get(r.id);
      if (existing) {
        existing.score = Math.max(existing.score, r.score + 0.1);
      } else {
        seen.set(r.id, r);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
