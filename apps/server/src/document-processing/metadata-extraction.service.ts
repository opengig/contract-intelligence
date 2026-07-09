import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';

const metadataSchema = z.object({
  carrierName: z
    .string()
    .nullable()
    .describe(
      'The carrier/transport provider name (e.g. "FedEx Freight", "Dugan Truck Line")',
    ),
  carrierScac: z
    .string()
    .nullable()
    .describe('Standard Carrier Alpha Code if mentioned (e.g. "FXFE", "DGTL")'),
  mode: z
    .enum(['air', 'LTL', 'TL', 'rail', 'ocean', 'parcel', 'intermodal'])
    .nullable()
    .describe('Transport mode'),
  shipper: z
    .string()
    .nullable()
    .describe('The shipper/customer name (e.g. "Ecolab", "Boeing")'),
  startDate: z
    .string()
    .nullable()
    .describe('Contract effective start date in ISO format (YYYY-MM-DD)'),
  expirationDate: z
    .string()
    .nullable()
    .describe('Contract expiration/end date in ISO format (YYYY-MM-DD)'),
  currency: z
    .string()
    .nullable()
    .describe('Primary currency (e.g. "USD", "EUR")'),
  divisions: z
    .array(z.string())
    .nullable()
    .describe('Business divisions or segments mentioned'),
  originRegions: z
    .array(z.string())
    .nullable()
    .describe('Origin states/countries (e.g. ["TX", "IL"] or ["France"])'),
  destRegions: z
    .array(z.string())
    .nullable()
    .describe('Destination states/countries'),
  rateType: z
    .enum(['per_kg', 'per_mile', 'flat', 'tariff_discount', 'percentage'])
    .nullable()
    .describe('How rates are structured'),
  laneCount: z
    .number()
    .int()
    .nullable()
    .describe('Approximate number of lanes/routes in rate tables'),
  keyTerms: z
    .array(z.string())
    .nullable()
    .describe(
      'Key contract features like "detention", "fuel surcharge", "temperature controlled", "hazmat"',
    ),
  contractType: z
    .enum(['rate_sheet', 'amendment', 'surcharge', 'other'])
    .describe('The type of this contract document'),
  vendorMatch: z
    .string()
    .nullable()
    .describe(
      'The EXACT name from the provided existing vendors list that best matches the carrier in this document. null if no match.',
    ),
  clientMatch: z
    .string()
    .nullable()
    .describe(
      'The EXACT name from the provided existing clients list that best matches the shipper/customer in this document. null if no match.',
    ),
  summary: z
    .string()
    .describe(
      '2-3 sentence summary of the contract covering: carrier, mode, geography, rate structure, dates',
    ),
});

@Injectable()
export class MetadataExtractionService {
  private readonly logger = new Logger(MetadataExtractionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async extractAndStore(contractId: string): Promise<void> {
    const contract = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      select: {
        id: true,
        name: true,
        extractedText: true,
        tables: {
          select: {
            name: true,
            summary: true,
            headers: true,
            rows: true,
            rowCount: true,
          },
          take: 10,
        },
        vendor: { select: { name: true } },
      },
    });

    const textSnippet = (contract.extractedText ?? '').slice(0, 8000);

    const tableContext = contract.tables
      .map((t) => {
        const headers = t.headers as string[];
        const sampleRows = (t.rows as string[][]).slice(0, 3);
        return (
          `Table: "${t.name}" (${t.rowCount} rows)\n` +
          `  Summary: ${t.summary}\n` +
          `  Columns: ${headers.join(', ')}\n` +
          `  Sample: ${sampleRows.map((r) => r.join(' | ')).join('\n          ')}`
        );
      })
      .join('\n\n');

    // Fetch existing vendors and clients for fuzzy matching
    const [vendors, clients] = await Promise.all([
      this.prisma.vendor.findMany({ select: { id: true, name: true } }),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
    ]);

    const vendorNames = vendors.map((v) => v.name);
    const clientNames = clients.map((c) => c.name);

    const prompt =
      `Extract structured metadata from this logistics contract.\n\n` +
      `Contract name: ${contract.name}\n` +
      (contract.vendor?.name ? `Vendor: ${contract.vendor.name}\n` : '') +
      `\n--- EXISTING VENDORS ---\n${vendorNames.length > 0 ? vendorNames.join(', ') : '(none yet)'}\n` +
      `\n--- EXISTING CLIENTS ---\n${clientNames.length > 0 ? clientNames.join(', ') : '(none yet)'}\n` +
      `\n--- PROSE TEXT (first 8000 chars) ---\n${textSnippet}\n\n` +
      `--- TABLES ---\n${tableContext}`;

    this.logger.log(`Extracting metadata for contract ${contractId}`);

    try {
      const { object } = await generateObject({
        model: openai('gpt-4.1-mini'),
        system:
          'You extract structured metadata from logistics/freight contracts. ' +
          'Be precise — only fill fields you can confirm from the text. ' +
          'For dates, use ISO format (YYYY-MM-DD). ' +
          'For SCAC codes, only include if explicitly mentioned. ' +
          'The summary should be useful for search — mention carrier, mode, geography, and date range. ' +
          'For vendorMatch: if the carrier in this document matches one of the existing vendors (even with slightly different spelling/casing), return that EXACT name from the list. Otherwise null. ' +
          'For clientMatch: if the shipper/customer matches one of the existing clients (even with slightly different spelling/casing), return that EXACT name from the list. Otherwise null.',
        prompt,
        schema: metadataSchema,
      });

      // Store metadata
      await this.prisma.$executeRaw`
        INSERT INTO "ContractMetadata" (id, "contractId", "carrierName", "carrierScac", mode, shipper, "startDate", "expirationDate", currency, divisions, "originRegions", "destRegions", "rateType", "laneCount", "keyTerms", "createdAt", "updatedAt")
        VALUES (
          ${randomUUID()},
          ${contractId},
          ${object.carrierName},
          ${object.carrierScac},
          ${object.mode},
          ${object.shipper},
          ${object.startDate ? new Date(object.startDate) : null}::timestamptz,
          ${object.expirationDate ? new Date(object.expirationDate) : null}::timestamptz,
          ${object.currency},
          ${object.divisions ? JSON.stringify(object.divisions) : null}::jsonb,
          ${object.originRegions ? JSON.stringify(object.originRegions) : null}::jsonb,
          ${object.destRegions ? JSON.stringify(object.destRegions) : null}::jsonb,
          ${object.rateType},
          ${object.laneCount},
          ${object.keyTerms ? JSON.stringify(object.keyTerms) : null}::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT ("contractId") DO UPDATE SET
          "carrierName" = EXCLUDED."carrierName",
          "carrierScac" = EXCLUDED."carrierScac",
          mode = EXCLUDED.mode,
          shipper = EXCLUDED.shipper,
          "startDate" = EXCLUDED."startDate",
          "expirationDate" = EXCLUDED."expirationDate",
          currency = EXCLUDED.currency,
          divisions = EXCLUDED.divisions,
          "originRegions" = EXCLUDED."originRegions",
          "destRegions" = EXCLUDED."destRegions",
          "rateType" = EXCLUDED."rateType",
          "laneCount" = EXCLUDED."laneCount",
          "keyTerms" = EXCLUDED."keyTerms",
          "updatedAt" = NOW()
      `;

      // Resolve vendor
      let resolvedVendorId: string | null = null;
      if (object.vendorMatch) {
        const match = vendors.find((v) => v.name === object.vendorMatch);
        if (match) resolvedVendorId = match.id;
      }
      if (!resolvedVendorId && object.carrierName) {
        const newVendor = await this.prisma.vendor.create({
          data: { name: object.carrierName },
        });
        resolvedVendorId = newVendor.id;
      }

      // Resolve client
      let resolvedClientId: string | null = null;
      if (object.clientMatch) {
        const match = clients.find((c) => c.name === object.clientMatch);
        if (match) resolvedClientId = match.id;
      }
      if (!resolvedClientId && object.shipper) {
        const newClient = await this.prisma.client.create({
          data: { name: object.shipper },
        });
        resolvedClientId = newClient.id;
      }

      // Update contract with resolved vendor, client, type, and dates
      await this.prisma.contract.update({
        where: { id: contractId },
        data: {
          ...(resolvedVendorId && !contract.vendor ? { vendorId: resolvedVendorId } : {}),
          ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
          type: object.contractType,
          ...(object.startDate ? { effectiveFrom: new Date(object.startDate) } : {}),
        },
      });

      // Store summary + summary embedding on the Contract itself
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: object.summary,
      });
      const vec = `[${embedding.join(',')}]`;

      await this.prisma.$executeRaw`
        UPDATE "Contract"
        SET summary = ${object.summary},
            "summaryEmbedding" = ${vec}::vector,
            "updatedAt" = NOW()
        WHERE id = ${contractId}
      `;

      this.logger.log(`Metadata + summary stored for contract ${contractId}`);
    } catch (err) {
      this.logger.error(
        `Metadata extraction failed for ${contractId}: ${(err as Error).message}`,
      );
    }
  }
}
