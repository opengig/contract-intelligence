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
    .describe(
      'Standard Carrier Alpha Code (2-4 letter code). Look in: ' +
        'table columns named "SCAC", prose text, agreement headers, and signature blocks. ' +
        'Examples: "FXFE" (FedEx), "DGTL" (Dugan), "RBRL" (C.H. Robinson).',
    ),
  mode: z
    .enum(['air', 'LTL', 'TL', 'rail', 'ocean', 'parcel', 'intermodal'])
    .nullable()
    .describe('Transport mode'),
  shipper: z
    .string()
    .nullable()
    .describe(
      'The shipper/customer/buyer/client name — the company that is purchasing transport services. ' +
        'In RFP documents, this is the company issuing the RFP (e.g. "Boeing", "Ecolab"). ' +
        'Look for: company issuing the bid, email domains (@boeing.com), signature blocks, ' +
        '"SHIPPER", "CUSTOMER", "CLIENT", "BUYER", or the company evaluating proposals.',
    ),
  startDate: z
    .string()
    .nullable()
    .describe(
      'Contract/amendment effective start date in ISO format (YYYY-MM-DD). ' +
        'PRIORITY ORDER: (1) explicit "Effective Date" or "Amendment Effective Date" text, ' +
        '(2) date in the document/contract name (e.g. "02 01 2024 Pricing Agreement" → 2024-02-01), ' +
        '(3) "Term" start date. ' +
        'Do NOT use the signing/execution date from signature blocks — that is when parties signed, not when the contract takes effect.',
    ),
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
    .enum([
      'rate_sheet',
      'amendment',
      'surcharge',
      'master_agreement',
      'correspondence',
      'other',
    ])
    .describe(
      'Document type. Use "correspondence" for emails, internal memos, retraction notices, ' +
        'cover letters, or any non-binding communication. Use "rate_sheet" only for documents ' +
        'containing actual pricing/rate data. Use "other" only as a last resort.',
    ),
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

// Returns true if a and b share at least one meaningful word (≥4 chars)
function nameOverlaps(a: string, b: string): boolean {
  const words = (s: string) => s.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const bWords = new Set(words(b));
  return words(a).some((w) => bWords.has(w));
}

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
    this.logger.debug(
      `Text snippet (first 500 chars): ${textSnippet.slice(0, 500)}`,
    );

    try {
      const { object } = await generateObject({
        model: openai('gpt-5.2'),
        system:
          'You extract structured metadata from logistics/freight contracts and RFPs. ' +
          'Be precise — only fill fields you can confirm from the text. ' +
          'For dates, use ISO format (YYYY-MM-DD). ' +
          'For SCAC codes, only include if explicitly mentioned. ' +
          'The summary should be useful for search — mention carrier, mode, geography, and date range.\n\n' +
          'DATE EXTRACTION — CRITICAL:\n' +
          'The startDate is the EFFECTIVE DATE, NOT the signing/execution date.\n' +
          '- "Agreement Effective Date: February 1, 2024" → startDate = 2024-02-01\n' +
          '- Contract name "02 01 2024 Pricing Agreement" → startDate = 2024-02-01\n' +
          '- Dates next to "Date" labels in signature blocks are SIGNING dates — do NOT use them as startDate.\n' +
          '- If the document says "executed as of the Amendment Effective Date" but has a separate signing date, the effective date takes priority.\n\n' +
          'SHIPPER IDENTIFICATION — CRITICAL:\n' +
          'The "shipper" field = the company BUYING transport services (the client/customer).\n' +
          'This is NOT the carrier/forwarder providing the service.\n' +
          'In RFP/bid documents, the shipper is the company ISSUING the RFP.\n' +
          'Extraction signals (use ANY of these):\n' +
          '  - Email domains in contact info: @boeing.com → shipper is "Boeing"\n' +
          '  - "X will evaluate proposals" → X is the shipper\n' +
          '  - "Pricing Instructions" sheets belong to the shipper\n' +
          '  - Labels: SHIPPER, CUSTOMER, CLIENT, BUYER in agreement text\n' +
          '  - The company whose employees are listed as contacts for the RFP\n' +
          'You MUST set shipper if ANY of these signals are present. Do NOT leave it null when a company name is identifiable.\n\n' +
          'For vendorMatch: if the carrier in this document matches one of the existing vendors (even with slightly different spelling/casing), return that EXACT name from the list. Otherwise null. ' +
          'For clientMatch: if the shipper/customer matches one of the existing clients (even with slightly different spelling/casing), return that EXACT name from the list. Otherwise null.',
        prompt,
        schema: metadataSchema,
      });

      this.logger.log(
        `Metadata extraction result for ${contractId}: ` +
          `shipper=${object.shipper}, carrier=${object.carrierName}, ` +
          `mode=${object.mode}, type=${object.contractType}`,
      );

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

      // Resolve vendor — validate LLM match has real name overlap before trusting it
      let resolvedVendorId: string | null = null;
      if (object.vendorMatch && object.carrierName) {
        const match = vendors.find((v) => v.name === object.vendorMatch);
        if (match && nameOverlaps(object.carrierName, match.name)) {
          resolvedVendorId = match.id;
        }
      }
      if (!resolvedVendorId && object.carrierName) {
        const newVendor = await this.prisma.vendor.create({
          data: { name: object.carrierName },
        });
        resolvedVendorId = newVendor.id;
      }

      // Resolve client — same validation
      let resolvedClientId: string | null = null;
      if (object.clientMatch && object.shipper) {
        const match = clients.find((c) => c.name === object.clientMatch);
        if (match && nameOverlaps(object.shipper, match.name)) {
          resolvedClientId = match.id;
        }
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
          ...(resolvedVendorId && !contract.vendor
            ? { vendorId: resolvedVendorId }
            : {}),
          ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
          type: object.contractType,
          ...(object.startDate
            ? { effectiveFrom: new Date(object.startDate) }
            : {}),
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
