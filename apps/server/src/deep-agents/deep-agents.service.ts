import { Injectable, Logger } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import {
  embed,
  tool,
  streamText,
  generateText,
  convertToModelMessages,
  stepCountIs,
  toUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { evaluate } from 'mathjs';
import { PrismaService } from '@/prisma/prisma.service';
import { SandboxManagerService } from './sandbox-manager.service';

@Injectable()
export class DeepAgentsService {
  private readonly logger = new Logger(DeepAgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxManager: SandboxManagerService,
  ) {}

  async chat(
    messages: UIMessage[],
    sessionId: string,
    scope?: {
      contractId?: string;
      vendorId?: string;
      routedContractIds?: string[];
    },
  ): Promise<Response> {
    const systemPrompt = await this.buildSystemPrompt(scope);

    const scopedContractId = scope?.contractId;
    const scopedVendorId = scope?.vendorId;

    const tools = this.buildTools(scopedContractId, scopedVendorId, sessionId);

    const result = streamText({
      model: openai('gpt-5.2'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
      temperature: 0.6,
      onError: (error) => {
        this.logger.error(
          `[chat] error: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (error) => {
          this.logger.error(
            `[chat] error: ${error instanceof Error ? error.message : String(error)}`,
          );
          return (
            'Error: ' + (error instanceof Error ? error.message : String(error))
          );
        },
      }),
    });
  }

  private buildTools(
    scopedContractId: string | undefined,
    scopedVendorId: string | undefined,
    sessionId: string,
  ) {
    return {
      calculate: tool({
        description:
          'Evaluate arithmetic expressions and contract formulas. ' +
          'Use after searchContracts or searchTableRows retrieves rates or formulas to compute ' +
          'final charges, apply weight tiers, enforce min/max caps, or calculate ' +
          'fuel surcharges, detention fees, and total costs.',
        inputSchema: z.object({
          expression: z
            .string()
            .describe(
              'A math expression, e.g. "max(175, 2.25 * 500)" or "base_rate * weight * (1 + fuel_pct / 100)". Use plain arithmetic plus max() and min().',
            ),
          variables: z
            .record(z.string(), z.number())
            .optional()
            .describe(
              'Named variables to substitute, e.g. { "weight": 500, "base_rate": 2.25, "fuel_pct": 22 }',
            ),
          precision: z
            .number()
            .int()
            .min(0)
            .max(6)
            .optional()
            .default(2)
            .describe('Decimal places to round the result to (default 2)'),
        }),
        execute: async ({
          expression,
          variables = {},
          precision = 2,
        }: {
          expression: string;
          variables?: Record<string, number>;
          precision?: number;
        }) => {
          this.logger.log(
            `calculate: expr="${expression}" vars=${JSON.stringify(variables)}`,
          );
          try {
            let resolved = expression;
            for (const [name, value] of Object.entries(variables)) {
              resolved = resolved.replaceAll(
                new RegExp(`\\b${name}\\b`, 'g'),
                String(value),
              );
            }
            const raw = Number(evaluate(resolved));
            const factor = Math.pow(10, precision);
            const result = Math.round(raw * factor) / factor;
            return {
              expression,
              resolved,
              result,
              formatted:
                precision === 0 ? String(result) : result.toFixed(precision),
            };
          } catch (err) {
            return {
              expression,
              error: err instanceof Error ? err.message : 'Evaluation failed',
            };
          }
        },
      }),

      runQuery: tool({
        description: [
          'Run a raw SQL SELECT against the contracts DB.',
          'Use for aggregations or metadata lookups. Prefer executeCode for table data analysis.',
          'Returns rows as an array of objects.',
          '',
          'SCHEMA (always double-quote PascalCase table/column names):',
          '  "Contract": id, name, type, status, "vendorId" (nullable), "clientId" (nullable), "effectiveFrom", "effectiveTo"',
          '  "ContractMetadata": id, "contractId" (FK → Contract.id, 1-to-1), "carrierName", "carrierScac",',
          '    mode (values: "LTL" | "TL" | "air" | "parcel" | "rail" | "ocean" | "intermodal"),',
          '    shipper, "startDate", "expirationDate", currency, divisions (JSON), "originRegions" (JSON),',
          '    "destRegions" (JSON), "rateType", "laneCount", "keyTerms" (JSON)',
          '  NOTE: mode/carrier/shipper live in "ContractMetadata", NOT in "Contract".',
          '    To filter by mode: JOIN "ContractMetadata" cm ON cm."contractId" = c.id WHERE cm.mode ILIKE \'%LTL%\'',
          '  "ContractTable": id, "contractId", name, summary, headers (JSON), rows (JSON), "rowCount"',
          '  "ContractChunk": id, "contractId", "chunkIndex", content',
          '  "Vendor": id, name',
          '  "Client": id, name',
          '',
          'Example — LTL vendors for a client active on a date:',
          '  SELECT v.name, c.id, c.name, c."effectiveFrom", cm.mode',
          '  FROM "Contract" c',
          '  JOIN "Vendor" v ON c."vendorId" = v.id',
          '  JOIN "Client" cl ON c."clientId" = cl.id',
          '  JOIN "ContractMetadata" cm ON cm."contractId" = c.id',
          "  WHERE cl.name ILIKE '%ecolab%'",
          "  AND cm.mode ILIKE '%LTL%'",
          '  AND c."effectiveFrom" <= \'2024-06-01\'',
          '  AND (c."effectiveTo" IS NULL OR c."effectiveTo" >= \'2024-06-01\')',
          '',
          'Example — list all tables for a contract:',
          '  SELECT name, summary, "rowCount" FROM "ContractTable" WHERE "contractId" = \'<id>\'',
        ].join('\n'),
        inputSchema: z.object({
          sql: z.string().describe('A SQL SELECT query (read-only)'),
        }),
        execute: async ({ sql }: { sql: string }) => {
          this.logger.log(`[runQuery] sql length=${sql.length}`);
          try {
            const rawRows =
              await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
            // Convert BigInt values to numbers/strings so the result is JSON-serializable
            const rows = JSON.parse(
              JSON.stringify(rawRows, (_, v) =>
                typeof v === 'bigint' ? Number(v) : v,
              ),
            );
            this.logger.log(`[runQuery] returned ${rows.length} rows`);
            return { rows, count: rows.length };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`[runQuery] error: ${msg}`);
            return { error: msg, rows: [], count: 0 };
          }
        },
      }),

      searchContracts: tool({
        description:
          'Search contract terms (ContractTerm) and document chunks (ContractChunk) ' +
          'to answer questions about clauses, conditions, policies, or prose content. ' +
          'Runs structured text search and semantic vector search in parallel. ' +
          'For structured table data (rates, surcharges, schedules), prefer searchTableRows instead.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'Natural language question, e.g. "freight rate Mumbai to Pune" or "detention policy"',
            ),
          vendorName: z
            .string()
            .optional()
            .describe('Optional vendor name to filter results'),
          topK: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .default(5)
            .describe('Results per search type (default 5)'),
        }),
        execute: async ({
          query,
          vendorName,
          topK,
        }: {
          query: string;
          vendorName?: string;
          topK?: number;
        }) => {
          const k = topK ?? 5;
          this.logger.log(
            `searchContracts: query="${query}" vendor="${vendorName ?? 'any'}" topK=${k}`,
          );
          const [textMatches, semanticMatches] = await Promise.all([
            this.textSearch(query, vendorName, k),
            this.semanticSearch(query, vendorName, k),
          ]);

          type Citation = {
            contractId: string;
            contractName: string;
            vendorName: string;
            effectiveFrom: Date | null | undefined;
            matchCount: number;
          };
          const citationMap = new Map<string, Citation>();
          for (const m of [...textMatches, ...semanticMatches]) {
            const existing = citationMap.get(m.contractId);
            if (existing) {
              existing.matchCount++;
            } else {
              citationMap.set(m.contractId, {
                contractId: m.contractId,
                contractName: m.contractName,
                vendorName: m.vendorName,
                effectiveFrom:
                  'effectiveFrom' in m ? m.effectiveFrom : undefined,
                matchCount: 1,
              });
            }
          }
          const citations = Array.from(citationMap.values()).sort(
            (a, b) => b.matchCount - a.matchCount,
          );

          return {
            textMatches,
            semanticMatches,
            citations,
            totalResults: textMatches.length + semanticMatches.length,
          };
        },
      }),

      listTables: tool({
        description:
          'List ALL tables available for a contract with their exact name, columns, summary, and row count. ' +
          'ALWAYS call this first for any table/rate query before calling getTableSample or executeCode. ' +
          'Use it to discover which table actually contains the data you need — never guess table names.',
        inputSchema: z.object({
          contractId: z
            .string()
            .optional()
            .describe(
              'Contract ID to list tables for. Defaults to scoped contract.',
            ),
        }),
        execute: async ({ contractId }: { contractId?: string }) => {
          const resolvedId = contractId ?? scopedContractId;
          this.logger.log(
            `listTables: contractId="${resolvedId ?? 'any'}" vendorId="${scopedVendorId ?? 'any'}"`,
          );
          const tables = await this.prisma.contractTable.findMany({
            where: resolvedId
              ? { contractId: resolvedId }
              : scopedVendorId
                ? {
                    contract: {
                      vendorId: scopedVendorId,
                      status: { in: ['active', 'review'] },
                    },
                  }
                : {},
            select: {
              id: true,
              contractId: true,
              name: true,
              summary: true,
              headers: true,
              rowCount: true,
              contract: {
                select: { name: true, vendor: { select: { name: true } } },
              },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (tables.length === 0) {
            return {
              found: false,
              message: 'No tables found for this contract.',
            };
          }
          return {
            found: true,
            count: tables.length,
            tables: tables.map((t) => ({
              contractId: t.contractId,
              contractName: t.contract.name,
              vendorName: t.contract.vendor?.name ?? 'Unassigned',
              tableName: t.name,
              summary: t.summary,
              columns: t.headers as string[],
              rowCount: t.rowCount,
            })),
            instruction:
              'Pick the table(s) whose summary and columns match the data you need. ' +
              'Then call getTableSample with the EXACT tableName string shown above.',
          };
        },
      }),

      searchTables: tool({
        description:
          'Search tables by keyword across name or summary when listTables returns too many results. ' +
          'Prefer listTables for initial discovery — use searchTables only to narrow down a large list.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'Keyword to match against table name or summary (e.g. "freight rate", "surcharge")',
            ),
          contractId: z
            .string()
            .optional()
            .describe('Optional contract ID to scope the search'),
        }),
        execute: async ({
          query,
          contractId,
        }: {
          query: string;
          contractId?: string;
        }) => {
          const resolvedId = contractId ?? scopedContractId;
          this.logger.log(
            `searchTables: query="${query}" contractId="${resolvedId ?? 'any'}"`,
          );
          return this.searchTables(query, resolvedId, scopedVendorId);
        },
      }),

      getTableSample: tool({
        description:
          'MANDATORY before every executeCode call. ' +
          'Returns exactColumns (deduplicated, whitespace-stripped column names) and sample rows as key→value dicts. ' +
          'Copy exactColumns verbatim into your Python script — never guess column names. ' +
          'Also shows value formats (e.g. "BOM" vs "Mumbai", whether blanks are "-" or null). ' +
          'Call once per table you intend to query.',
        inputSchema: z.object({
          tableName: z.string().describe('Table name (fuzzy match)'),
          contractId: z
            .string()
            .optional()
            .describe('Optional contract ID to scope'),
          sampleSize: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .default(5)
            .describe('Number of sample rows (default 5)'),
        }),
        execute: async ({
          tableName,
          contractId,
          sampleSize,
        }: {
          tableName: string;
          contractId?: string;
          sampleSize?: number;
        }) => {
          const n = sampleSize ?? 5;
          const resolvedId = contractId ?? scopedContractId;
          this.logger.log(
            `getTableSample: table="${tableName}" contractId="${resolvedId ?? 'any'}" n=${n}`,
          );
          return this.getTableSample(tableName, resolvedId, n);
        },
      }),

      executeCode: tool({
        description:
          'Execute a Python script to analyze contract table data. ' +
          'Available libraries: psycopg2, pandas, numpy. ' +
          'DB credentials are available as env vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD. Always add sslmode="require" to the connection. ' +
          'Query "ContractTable" — columns: id, "contractId", name, summary, headers (JSON list), rows (JSON 2D list), "rowCount". psycopg2 deserialises JSON automatically. ' +
          'Load data into a pandas DataFrame for filtering, joins, and calculations. Always print results to stdout.',
        inputSchema: z.object({
          code: z.string().describe('Python code to execute'),
          sessionLabel: z
            .string()
            .optional()
            .describe('Short label for logging (e.g. "rate-lookup-BUD-NRT")'),
        }),
        execute: async ({
          code,
          sessionLabel,
        }: {
          code: string;
          sessionLabel?: string;
        }) => {
          const label = sessionLabel ?? sessionId;
          this.logger.log(`executeCode: session="${label}"`);
          return this.sandboxManager.executeCode(code, label);
        },
      }),
    };
  }

  // ── Test endpoint: non-streaming response ─────────────────────────────────

  async chatSync(
    messages: UIMessage[],
    sessionId: string,
    scope?: {
      contractId?: string;
      vendorId?: string;
      routedContractIds?: string[];
    },
  ): Promise<string> {
    const systemPrompt = await this.buildSystemPrompt(scope);
    const scopedContractId = scope?.contractId;
    const scopedVendorId = scope?.vendorId;

    const tools = this.buildTools(scopedContractId, scopedVendorId, sessionId);

    const result = await generateText({
      model: openai('gpt-5.2'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
      temperature: 0.6,
    });

    return result.text;
  }

  // ── Text search ───────────────────────────────────────────────────────────

  private async textSearch(query: string, vendorName?: string, topK = 5) {
    const terms = await this.prisma.contractTerm.findMany({
      where: {
        contract: {
          status: { in: ['active', 'review'] },
          ...(vendorName && {
            vendor: { name: { contains: vendorName, mode: 'insensitive' } },
          }),
        },
        OR: [
          { description: { contains: query, mode: 'insensitive' } },
          { route: { contains: query, mode: 'insensitive' } },
          { conditions: { contains: query, mode: 'insensitive' } },
          { formula: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        contract: {
          select: {
            id: true,
            name: true,
            effectiveFrom: true,
            vendor: { select: { name: true } },
          },
        },
      },
      take: topK,
    });

    return terms.map((t) => ({
      source: 'text_search' as const,
      contractId: t.contract.id,
      contractName: t.contract.name,
      vendorName: t.contract.vendor?.name ?? 'Unassigned',
      effectiveFrom: t.contract.effectiveFrom,
      termType: t.termType,
      description: t.description,
      route: t.route,
      rate: t.rate,
      unit: t.unit,
      formula: t.formula,
      conditions: t.conditions,
      confidence: t.confidence,
      status: t.status,
    }));
  }

  // ── Semantic / vector search ──────────────────────────────────────────────

  private async semanticSearch(query: string, vendorName?: string, topK = 5) {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });

    const vec = `[${embedding.join(',')}]`;
    const vendorFilter = vendorName
      ? `AND v.name ILIKE '%${vendorName.replace(/'/g, "''")}%'`
      : '';

    type ChunkRow = {
      chunkIndex: number;
      content: string;
      contractId: string;
      contractName: string;
      vendorName: string;
      similarity: number;
    };

    const chunks = await this.prisma.$queryRawUnsafe<ChunkRow[]>(
      `SELECT
         cc."chunkIndex",
         cc.content,
         c.id              AS "contractId",
         c.name            AS "contractName",
         COALESCE(v.name, 'Unassigned') AS "vendorName",
         1 - (cc.embedding <=> '${vec}'::vector) AS similarity
       FROM "ContractChunk" cc
       JOIN "Contract"      c  ON cc."contractId" = c.id
       LEFT JOIN "Vendor"   v  ON c."vendorId"    = v.id
       WHERE c.status IN ('active', 'review')
       ${vendorFilter}
       ORDER BY cc.embedding <=> '${vec}'::vector
       LIMIT ${topK}`,
    );

    return chunks.map((r) => ({
      source: 'semantic_search' as const,
      contractId: r.contractId,
      contractName: r.contractName,
      vendorName: r.vendorName,
      similarity: Number(r.similarity).toFixed(3),
      chunkIndex: r.chunkIndex,
      content: r.content,
    }));
  }

  // ── Table sample ─────────────────────────────────────────────────────────

  private async getTableSample(
    tableName: string,
    contractId: string | undefined,
    sampleSize: number,
  ) {
    const table = await this.prisma.contractTable.findFirst({
      where: {
        contract: { status: { in: ['active', 'review'] } },
        name: { contains: tableName, mode: 'insensitive' },
        ...(contractId ? { contractId } : {}),
      },
      select: {
        name: true,
        summary: true,
        headers: true,
        rows: true,
        rowCount: true,
        contractId: true,
      },
    });

    if (!table) {
      // List available tables to help the agent retry with the right name
      const available = await this.prisma.contractTable.findMany({
        where: contractId ? { contractId } : {},
        select: { name: true, summary: true },
        take: 20,
      });
      return {
        found: false,
        message: `No table matching "${tableName}" found.`,
        availableTables: available.map((t) => ({
          name: t.name,
          summary: t.summary,
        })),
      };
    }

    const rawHeaders = table.headers as string[];

    // Deduplicate column names (same logic as executeCode boilerplate)
    const counts: Record<string, number> = {};
    const headers = rawHeaders.map((h) => {
      const key = h.trim();
      counts[key] = (counts[key] ?? 0) + 1;
      return counts[key] === 1 ? key : `${key}_${counts[key]}`;
    });

    const allRows = table.rows as string[][];
    const sampleRows = allRows.slice(0, sampleSize);

    // Rows as dicts so the agent can see exact key→value pairs
    const sampleDicts = sampleRows.map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? null])),
    );

    return {
      found: true,
      tableName: table.name,
      summary: table.summary,
      contractId: table.contractId,
      rowCount: table.rowCount,
      // Exact column names — copy these into executeCode, do NOT guess
      exactColumns: headers,
      sampleRows: sampleDicts,
      instruction:
        `Use exactColumns (above) verbatim in executeCode — do NOT rename or guess. ` +
        `Showing ${sampleRows.length} of ${table.rowCount} rows.`,
    };
  }

  // ── Table metadata search ─────────────────────────────────────────────────

  private async searchTables(
    query: string,
    contractId: string | undefined,
    vendorId?: string,
  ) {
    const tables = await this.prisma.contractTable.findMany({
      where: {
        contract: {
          status: { in: ['active', 'review'] },
          ...(vendorId && !contractId ? { vendorId } : {}),
        },
        ...(contractId ? { contractId } : {}),
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        contractId: true,
        name: true,
        summary: true,
        headers: true,
        rowCount: true,
        contract: {
          select: { name: true, vendor: { select: { name: true } } },
        },
      },
      orderBy: { contract: { effectiveFrom: 'desc' } },
      take: 20,
    });

    return tables.map((t) => ({
      tableId: t.id,
      contractId: t.contractId,
      contractName: t.contract.name,
      vendorName: t.contract.vendor?.name ?? 'Unassigned',
      tableName: t.name,
      summary: t.summary,
      headers: t.headers as string[],
      rowCount: t.rowCount,
    }));
  }

  // ── System prompt ─────────────────────────────────────────────────────────

  private async buildSystemPrompt(scope?: {
    contractId?: string;
    vendorId?: string;
    routedContractIds?: string[];
  }): Promise<string> {
    // When vendorId is provided, show ALL vendor contracts in the catalog
    // (even when a specific contractId is selected as default scope).
    const contracts = await this.prisma.contract.findMany({
      where: {
        status: { in: ['active', 'review'] },
        type: { not: 'correspondence' },
        ...(scope?.vendorId
          ? { vendorId: scope.vendorId }
          : scope?.contractId
            ? { id: scope.contractId }
            : scope?.routedContractIds?.length
              ? { id: { in: scope.routedContractIds } }
              : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        effectiveFrom: true,
        vendor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        tables: {
          select: { name: true, summary: true, headers: true, rowCount: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // Build a rich catalog with exact column names per table
    const catalog =
      contracts.length === 0
        ? 'No active contracts in the system yet.'
        : contracts
            .map((c) => {
              const effectiveStr = c.effectiveFrom
                ? ` | Effective: ${new Date(c.effectiveFrom).toLocaleDateString('en-US')}`
                : '';
              const vendorStr = c.vendor?.name ?? 'Unassigned';
              const clientStr = c.client?.name
                ? ` | client: ${c.client.name}`
                : '';
              let entry =
                `CONTRACT: ${c.name}\n` +
                `  id: ${c.id}\n` +
                `  vendor: ${vendorStr}${clientStr} | type: ${c.type}${effectiveStr}\n` +
                `  link: /contracts/${c.id}`;

              if (c.tables.length > 0) {
                entry += '\n  tables:';
                for (const t of c.tables) {
                  const hdrs = (t.headers as string[])
                    .map((h) => `"${h}"`)
                    .join(', ');
                  entry +=
                    `\n    • "${t.name}" — ${t.rowCount} rows` +
                    `\n      columns: [${hdrs}]` +
                    `\n      summary: ${t.summary}`;
                }
              } else {
                entry += '\n  tables: (none)';
              }

              return entry;
            })
            .join('\n\n');

    const scopeNote = scope?.contractId
      ? `\nYou are scoped to a SINGLE contract (id shown in catalog). Only use that contract's data — do NOT search outside it.\n`
      : scope?.vendorId
        ? `\nYou are scoped to a specific vendor. Only use that vendor's contracts.\n`
        : scope?.routedContractIds?.length
          ? `\nContracts below were auto-selected as the TOP MATCHING contracts — they are NOT all contracts in the system. ALWAYS use runQuery to query the full database when the user asks about "all" contracts/vendors/modes, asks discovery questions ("which vendors", "what modes exist"), or needs cross-vendor/cross-contract comparisons. The catalog is a starting point, not the complete picture.\n`
          : '';

    return `You are ContractIQ, an expert logistics contract analyst.${scopeNote}

## DISAMBIGUATION & CLARIFICATION — CRITICAL

This system contains contracts for **many clients and vendors**. NEVER silently guess which vendor or client the user means when the query is ambiguous.

**When to ask for clarification:**
1. The query mentions a document type (e.g. "Exhibit C", "rate card", "MSA") but does NOT name a specific vendor or client, AND the conversation history has no prior vendor/client context.
2. Multiple vendors/clients have similar contracts that could answer the question. Example: both FedEx and Dugan have an "Exhibit C" with fuel surcharge tables — do not pick one arbitrarily.
3. The query uses generic terms like "the contract", "the LTL rate", "the fuel surcharge" without specifying whose.

**How to clarify:**
- Use \`runQuery\` to find which vendors/clients have matching documents, then present the options:
  "I found Exhibit C fuel surcharge tables in contracts for multiple vendors: **FedEx Freight** and **Dugan Truck Line**. Which vendor's Exhibit C would you like me to look at?"
- Keep the clarification short — list the matching vendors/clients, don't dump raw data.

**When NOT to ask — use conversation context instead:**
- If the user previously asked about a specific vendor (e.g. Dugan) in this conversation, and the follow-up question omits the vendor name (e.g. "How is fuel calculated under Exhibit C?"), assume the same vendor from context. Only ask if the context is genuinely unclear.
- If the query explicitly names both client AND vendor, proceed directly.
- If only one contract in the system matches the query, proceed directly.

**NEVER do this:**
- Silently pick the highest-scoring vector match when multiple vendors have relevant documents.
- Answer with one vendor's data when the user was clearly discussing a different vendor.
- Assume "the contract" means a specific vendor without checking context first.

## ⚠️ CRITICAL RULE — READ BEFORE ANYTHING ELSE ⚠️

**HOW TO FIND RATES: Use POSITIONAL JOIN between lane tables and rate tables.**

In logistics contracts, lane data and rate data are often stored in SEPARATE parallel tables with NO shared key. The tables are aligned by ROW POSITION — row 0 in the lane table corresponds to row 0 in the rate table.

**CORRECT approach:**
1. Find the lane variant row (e.g. 0139A) in the lane/carrier table → note its ROW INDEX.
2. Load the rate table → look at the SAME ROW INDEX → that row's weight-slab columns are the rates for that lane variant.
3. Join them with \`pd.concat([lane_df.reset_index(drop=True), rate_df.reset_index(drop=True)], axis=1)\`.

**WRONG approaches:**
❌ Search for "Casablanca" or "CMN" in rate tables — they don't use city names.
❌ Search for lane IDs (0139A) in rate tables — they don't have lane ID columns.
❌ Use a generic rate row when you can't find a lane-specific match — always do the positional join first.

The lane-definition table tells you 0139 = Val de Reuil → Casablanca. Then you search the WIDE rate tables for "0139" to get the rates.

## DATABASE SCHEMA

The database stores contract data in these tables (PostgreSQL, double-quote all names):

\`\`\`
"Contract"         — id, name, type ("rate_sheet"|"amendment"|"msa"|"other"), status,
                     "vendorId" (nullable), "clientId" (nullable), "effectiveFrom", "effectiveTo"
"Vendor"           — id, name
"Client"           — id, name
"ContractMetadata" — id, "contractId" (1-to-1 FK → Contract.id),
                     "carrierName", "carrierScac",
                     mode  -- "LTL" | "TL" | "air" | "parcel" | "rail" | "ocean" | "intermodal"
                     shipper, "startDate", "expirationDate", currency,
                     divisions JSON, "originRegions" JSON, "destRegions" JSON,
                     "rateType", "laneCount", "keyTerms" JSON
                     ⚠️  mode, carrierName, shipper ARE NOT columns on "Contract" — always JOIN this table.
"ContractTable"    — id, "contractId", name, summary,
                     headers  JSON   -- array of column name strings, e.g. ["Origin", "Destination", "Rate"]
                     rows     JSON   -- 2D array of cell values, e.g. [["BOM","DEL",150], ...]
                     "rowCount" int
"ContractChunk"    — id, "contractId", "chunkIndex", content   -- prose text chunks
"ContractTerm"     — id, "contractId", termType, description, route, rate, unit, formula, conditions
\`\`\`

psycopg2 automatically deserialises the JSON columns — headers and rows come back as Python lists, no json.loads() needed.

## TOOLS

1. \`listTables\` — **START HERE for any data query**. Lists every table in a contract with exact name, columns, summary, rowCount. Use this to discover what data is available — never assume or guess table names.
2. \`searchTables\` — narrow a large table list by keyword. Use only after listTables returns too many results.
3. \`getTableSample\` — **MANDATORY before executeCode**. Returns exactColumns (deduplicated) + sample rows as key→value dicts. Call for every table you intend to query.
4. \`executeCode\` — **primary analysis tool**. Runs Python (psycopg2 + pandas + numpy) with live DB access. Only call AFTER getTableSample has confirmed exact column names and value formats.
5. \`searchContracts\` — full-text + semantic search over prose chunks and contract terms. Use for clauses, policies, definitions — not for table data.
6. \`runQuery\` — raw SQL SELECT. Use for simple aggregations or counts.
7. \`calculate\` — evaluates arithmetic expressions with variables.

## MANDATORY WORKFLOW FOR TABLE / RATE QUERIES

Follow these steps strictly in order. Skipping any step WILL cause column-name errors.

### Step 1 — listTables (always first)
Call \`listTables\` with the contract id. This returns every table that actually exists in the DB with its real name, columns, and summary. Do NOT assume you know the table name — real names may be completely different from what you expect.

### Step 2 — Pick the right table(s) — COLLECT ALL CANDIDATES
Read each table's \`summary\` and \`columns\` from the listTables response.

**MANDATORY — collect every table that could contain the answer BEFORE executing any code:**
Large contracts (especially LTL/freight rate sheets) split one logical table across many pages during PDF extraction, producing multiple DB tables with identical or near-identical column sets. Table names and summaries are generated independently per page group and will differ even when the underlying data is the same — do NOT use name similarity to decide if two tables are siblings.

**The only reliable signal is the \`columns\` array returned by listTables.**

Rules:
1. Your first candidate is the table whose summary best matches the query.
2. Look at its \`columns\` array. Then scan every other table in the listTables response and compare \`columns\` arrays. Any table whose columns overlap significantly (≥ 4 shared column names) is a sibling — it contains a different row range of the same logical table.
3. Collect the names of ALL siblings into a list regardless of how different their names sound. "Freight Discounts and Minimum Charges by Territory, Geography, and Weight Group" and "Regional Freight Discount Matrix by Territory and Tier" are siblings if they share columns like Territory, Geography, Payer Type, Discount, Minimum Charge.
4. **IMPORTANT — siblings may represent DIFFERENT service sections.** In LTL contracts, sibling tables with identical column structures often cover different service tiers (e.g. one is "LTL Domestic Priority", another is "LTL Domestic Economy"). Check each sibling's **name and summary** to determine its service section. When the user asks for a specific service (e.g. "Domestic Priority"), return rows ONLY from the matching sibling — do NOT merge rows from all siblings blindly.
5. You MUST search every sibling in a **single** executeCode call using the MULTI-TABLE SEARCH PATTERN in Step 4. Searching one table per executeCode call is FORBIDDEN for rate/discount lookups.
6. **NEVER search just one candidate and report "not found".** Searching siblings only after a miss is also FORBIDDEN — identify all siblings in Step 2, then search them all at once.

### Step 3 — getTableSample (MANDATORY, never skip)
Call \`getTableSample\` using the EXACT \`tableName\` string from Step 1's response.
The response gives you:
- \`exactColumns\` — deduplicated, whitespace-stripped names. Copy these verbatim into your Python. Never invent column names.
- \`sampleRows\` — rows as dicts so you can see real value formats (airport codes vs city names, units, how nulls look).

### Step 4 — executeCode (only AFTER Steps 1–3)
Write Python using ONLY the column names from \`exactColumns\`. Do not rename, abbreviate, or guess.

**executeCode: load tables into DataFrames and analyse**

The execution environment pre-injects these globals — **do NOT redefine them**:
- \`pd\` — pandas
- \`np\` — numpy
- \`conn\`, \`cur\` — live psycopg2 connection (already open, sslmode=require)
- \`get_table(contract_id, table_pattern)\` — loads a ContractTable into a DataFrame (strips whitespace, deduplicates columns, raises ValueError with available names if not found)
- \`list_tables(contract_id)\` — prints all tables + columns for a contract

**Minimal script template:**
\`\`\`python
# No imports or connection setup needed — everything is pre-injected

CONTRACT_ID = '<exact id from catalog>'

# Discovery: see what tables exist and their column names
list_tables(CONTRACT_ID)
\`\`\`

**Analysis script template (run after you know the exact table name and columns):**
\`\`\`python
CONTRACT_ID = '<exact id from catalog>'

# Load table — use the EXACT name string from list_tables / getTableSample output
name, df = get_table(CONTRACT_ID, '<exact table name>')
print(f"=== {name} ({len(df)} rows) ===")
print("columns:", df.columns.tolist())
print(df.head(3).to_string())

# Now analyse using ONLY the column names printed above
# rate_col = 'Rate (INR/kg)'   ← copy exact string from output
# df[rate_col] = pd.to_numeric(df[rate_col], errors='coerce')
# match = df[df['Origin'].str.upper() == 'MUMBAI']
# print(match.to_string())
\`\`\`

**⚠️ EACH executeCode CALL IS A FRESH PROCESS — NO SHARED STATE:**
Every \`executeCode\` call starts a brand-new Python process. Variables, DataFrames, imports — NOTHING carries over between calls. You MUST re-load all data in every script.
- **WRONG**: Call 1 creates \`df_rates = get_table(...)\`, Call 2 uses \`df_rates\` → NameError
- **RIGHT**: Every script is self-contained — re-call \`get_table()\` at the top of each script

**TWO-CALL PATTERN (for complex queries — each call is self-contained):**
1. First call: run \`list_tables(CONTRACT_ID)\` to discover tables + print columns.
2. Read the output to confirm exact column names and value formats.
3. Second call: **re-load the table with \`get_table()\`**, then do full analysis. Do NOT reference variables from Call 1.

**MULTI-TABLE SEARCH PATTERN — MANDATORY first attempt for any rate/discount lookup. Not a fallback.**
Identify siblings in Step 2, then run this pattern as your FIRST executeCode call. Do NOT run a single-table script first and fall back to this on a miss.
Search ALL candidate tables in one script. Never stop at the first non-empty result — collect from all tables.
\`\`\`python
CONTRACT_ID = '<exact id>'

# List every sibling table identified in Step 2
CANDIDATE_TABLE_NAMES = [
    'Freight Discounts and Minimum Charges by Territory ...',
    'Regional Freight Discount Matrix by Territory ...',
    'ABCD+ Matrix Freight Rate Discounts ...',
    # add every same-schema sibling here
]

all_results = []
for tname in CANDIDATE_TABLE_NAMES:
    try:
        name, df = get_table(CONTRACT_ID, tname)
        # Apply your filter — e.g. search for FWA in Territory column
        col = df['Territory'].astype(str).str.strip()
        match = df[col.str.contains('FWA', case=False, na=False)]
        if not match.empty:
            print(f"=== FOUND in '{name}' ({len(match)} rows) ===")
            print(match.to_string())
            all_results.append(match)
        else:
            print(f"  No match in '{name}' ({len(df)} rows total)")
    except Exception as e:
        print(f"  Could not load '{tname}': {e}")

if not all_results:
    print("NOT FOUND in any candidate table.")
\`\`\`
This pattern is MANDATORY when sibling tables exist. Do not write a loop that stops on the first non-empty result — collect from ALL tables and then present the combined findings.

**CRITICAL coding rules:**
- ALWAYS use \`df['Column Name']\` (brackets) — NEVER \`df.ColumnName\` (dots break on spaces/special chars).
- ALWAYS run a discovery call first (print columns + head) before doing any column access. Column names in the catalog are a hint — the deduped names in the DataFrame are ground truth.
- Duplicate column names are automatically renamed: second "Rate" → "Rate_2", third → "Rate_3". Check the printed columns list.
- Convert numerics: \`pd.to_numeric(df['Rate'], errors='coerce')\` — all raw data arrives as strings.
- On table not found, the helper prints available table names — use those to retry.

**FUZZY MATCHING — MANDATORY for all lookups:**
When searching for a specific lane, route, ID, city, or keyword in table data, NEVER rely on exact equality (\`==\`). Always use \`.str.contains()\` with partial matching.

**Rules:**
1. **Normalize before matching**: \`.astype(str).str.strip()\` on both sides, use \`case=False\`.
2. **IDs often have suffixes/prefixes**: Lane "0139" may exist as "0139A", "0139B", "0139C" (carrier variants). Item "0021" may be "0021A", "0021B". ALWAYS use \`str.contains\` or \`str.startswith\` — never \`==\`.
3. **Try multiple formats**: "0139" → also try "139" (no leading zero). City names → try abbreviations (BOM/Mumbai, DEL/Delhi, CDG/Paris, CAS/Casablanca).
4. **Use this pattern for EVERY data lookup**:
\`\`\`python
col = df['LANE ID #'].astype(str).str.strip()
match = df[col.str.contains('0139', case=False, na=False)]
if match.empty:
    # Try without leading zeros
    match = df[col.str.contains('139', case=False, na=False)]
if match.empty:
    print(f"No match for '0139'. ALL available lane IDs:")
    print(sorted(col.dropna().unique().tolist()))
else:
    print(f"Found {len(match)} matching rows:")
    print(match.to_string())
\`\`\`
5. **Partial route matching**: For origin → destination, search each city independently then intersect:
\`\`\`python
origin_match = df[df['Loading site city'].str.contains('reuil', case=False, na=False)]
dest_match = origin_match[origin_match['Incoterm place'].str.contains('casa', case=False, na=False)]
\`\`\`
6. **NEVER say "not found" without alternatives.** Always print the available unique values from the lookup column so the user can pick the right one.

**PANDAS PITFALLS — avoid these common errors:**
- **NameError**: Each executeCode call is isolated. NEVER reference variables from a previous call. Re-load data with \`get_table()\` at the top of every script.
- NEVER use \`axis=1\` with \`.drop()\`, \`.sort_values()\`, etc. Use \`df.drop(columns=[...])\` instead.
- NEVER use \`df.str.contains()\` directly on a DataFrame — only on a Series: \`df['col'].str.contains(...)\`.
- ALWAYS use \`errors='coerce'\` with \`pd.to_numeric()\`.
- When printing large DataFrames, use \`df.to_string()\` to avoid truncation. Limit output with \`.head(20)\` if needed.
- If a script fails with a traceback, do NOT retry the exact same code — fix the bug first, then retry.

**AIR FREIGHT CONTRACT DATA STRUCTURE — CRITICAL:**
Logistics air freight contracts typically store data across multiple WIDE tables that share lane IDs. Understanding this structure is essential:

**Lane suffixes — HOW TO IDENTIFY PRIMARY vs SECONDARY:**
Each lane base number (e.g. 0139) has multiple VARIANTS with letter suffixes:
- \`A\` suffix = **PRIMARY** carrier (Standard award, "MAIN-primary carrier")
- \`B\` suffix = **SECONDARY** carrier (Alternate-1)
- \`C\` suffix = **TERTIARY** carrier (Alternate-2)

**When user asks for "primary" → use the A suffix row ONLY.**
**When user asks for "secondary" → use B and/or C suffix rows.**
ALWAYS print ALL variants (A, B, C) and explicitly pick the correct suffix.

**The data lives in WIDE combined tables** (100–300+ rows, 20–40+ columns). These tables contain BOTH lane metadata AND freight rates as columns in the SAME row. Key column patterns:
- Lane ID column (contains "0139A", "0202B", etc.)
- Carrier/airline code column
- Award status ("Awarded", "MAIN-primary carrier", "Awarded Secondary carriers")
- Weight-slab RATE columns: "FREIGHT RATES / Minimum", "FREIGHT RATES - 45 kg", "FREIGHT RATES + 45 kg", "FREIGHT RATES / +100 kg", "FREIGHT RATES +300 kg", "FREIGHT RATES / +500 kg", "FREIGHT RATES +700 kg", "FREIGHT RATES +1000 kg", "FREIGHT RATES / +3000 kg", "FREIGHT RATES +5000 kg"
- Other charges: "Dangerous goods Fee", "Other charges per shipment"

**THE CORRECT RATE LOOKUP WORKFLOW:**
1. Call \`listTables\`. Identify:
   - The **lane/carrier table** — has lane IDs (0139A, 0202B), carrier codes, award status.
   - The **rate table(s)** — has weight-slab rate columns (Minimum, +45kg, +300kg, etc.) but NO lane IDs.
   - Both tables should have similar row counts (they are parallel).
2. Call \`getTableSample\` on both tables to confirm their columns.
3. Use \`executeCode\` to do a **POSITIONAL JOIN** and extract the rate for the specific lane:

\`\`\`python
# Load BOTH tables
lane_name, lane_df = get_table(CONTRACT_ID, '<lane/carrier table>')
rate_name, rate_df = get_table(CONTRACT_ID, '<rate table>')
print(f"Lane table: {lane_name} — {len(lane_df)} rows, {len(lane_df.columns)} cols")
print(f"Rate table: {rate_name} — {len(rate_df)} rows, {len(rate_df.columns)} cols")

# Positional join — same row index = same lane variant
combined = pd.concat([lane_df.reset_index(drop=True), rate_df.reset_index(drop=True)], axis=1)
print(f"Combined: {len(combined)} rows, {len(combined.columns)} cols")

# Find the lane ID column
lane_col = None
for c in combined.columns:
    if combined[c].astype(str).str.contains('0139', na=False).any():
        lane_col = c
        break

if lane_col:
    variants = combined[combined[lane_col].astype(str).str.contains('0139', na=False)]
    print(f"\\nFound {len(variants)} variant(s) for lane 0139:")
    for idx, row in variants.iterrows():
        lane_id = str(row[lane_col]).strip()
        suffix = lane_id[-1] if lane_id else '?'
        award = 'PRIMARY' if suffix == 'A' else 'SECONDARY'
        print(f"\\n=== {lane_id} ({award}) ===")
        for col in combined.columns:
            val = str(row[col]).strip()
            if val and val != 'nan' and val != '':
                print(f"  {col}: {val}")
\`\`\`

4. From the combined output, you now have lane metadata + rates in one view:
   - Lane variant (0139A = PRIMARY, 0139B/C = SECONDARY)
   - Carrier code (read from carrier column, e.g. "3O", "EY", "AT")
   - Weight-slab rates: Minimum, -45kg, +45kg, +100kg, +300kg, +500kg, +700kg, +1000kg
   - Other charges

5. For a rate calculation:
   - Pick the correct variant (A for primary, B/C for secondary)
   - Find the weight slab: for 400kg → use "+300 kg" column
   - Apply min charge: \`billable = max(rate_per_kg × weight, min_charge)\`

**If row counts don't match between lane and rate tables**, try joining with OTHER wide tables. There may be multiple rate tables that correspond to different subsets of lanes (split across pages).

**EVERY rate answer MUST include:**
- Lane variant + suffix (e.g. 0139A)
- Award tier (primary/secondary)
- Actual airline/carrier code (e.g. 3O, EY, AT, TK, AF)
- Min charge
- Weight-slab rate used
- Calculation
- Fuel treatment (check contract prose for whether fuel is included in rates or separate)

**IMPORTANT — multiple tables may cover the same lanes:**
The contract often has MULTIPLE wide tables (split across pages). If Lane 0139A isn't in the first big table, check the next one. All variants (A/B/C) should appear somewhere in these wide tables. Search ALL wide tables until you find every variant.

**DO NOT** use rates from:
- Generic weight-slab tables with NO lane ID column — these are templates, not contracted rates
- Separate "airline rate" tables — these are reference prices, not the award-specific contracted rate
- The lane-definition table alone (it has metadata but typically NOT rates)

**Step 4 — calculate** for final arithmetic after rates are retrieved.

## LTL FREIGHT DISCOUNT TABLE STRUCTURE — CRITICAL

LTL (Less-Than-Truckload) contracts use **discount-based pricing**: a percentage discount off a published base tariff (e.g. CZARLITE) plus a minimum charge per shipment. Understanding the table hierarchy is essential.

**Service sections — the TOP-LEVEL grouping:**
LTL discount tables are organized under **service-level section headings** such as:
- "LTL Domestic Priority" — faster/guaranteed delivery
- "LTL Domestic Economy" — standard/slower delivery
- "LTL International Priority"
- "LTL International Economy"

These service sections may appear as:
- **Separate sibling tables** in the DB (each table covers one service section — check the table name/summary)
- A **"Service"** or **"Section"** column within a single combined table
- A heading row or grouping label in the source PDF

**The key rule — "Domestic Priority" is a SERVICE SECTION, not a Payer Type:**
When a user asks for "Domestic Priority" pricing, this identifies the **service tier/section**, NOT a value in the Payer Type column. Payer Type contains billing-role values like "OP" (Outbound Prepaid), "OC" (Outbound Collect), "IC" (Inbound Collect), "3P" (Third Party). Do NOT look for "Domestic Priority" in the Payer Type column — it will not be there.

**Disambiguating rows from different service sections:**
Two rows with identical Territory (e.g. FWA), Geography (e.g. Tier A), and Payer Type (e.g. OP, OC, IC, 3P) but DIFFERENT Discount/Minimum Charge values come from **different service sections**. For example:
- $96.93 / 84.5% → from "LTL Domestic Priority" table
- $94.02 / 84.6% → from "LTL Domestic Economy" table

When sibling tables share identical column structures, identify which service section each table represents (from its name or summary) and return ONLY the row from the requested service section.

**Mandatory fields for LTL discount answers — NEVER omit any:**
Every LTL discount answer MUST include ALL of these fields. Extract each from the data — do not skip any even if they seem secondary:
- Client and Vendor
- Active pricing document name
- Applicable Term (with start/end dates from the contract's Term table, formatted as MM/DD/YYYY)
- Service section (e.g. "LTL Domestic Priority")
- Territory (e.g. "All Points Serviced by Service Center(s) - FWA")
- Geography / Tier (e.g. "ABCD+ Matrix Tier A eff 2/15/2020")
- Payer Type (e.g. "OP, OC, IC, 3P")
- Base Rate reference (e.g. "CZARLITE EFF 09/21/2020")
- **Weight Group** (e.g. "MC-10M") — always present in the rate row, always include it
- **NMFC / FAK** (e.g. "FAK 50, FAK 100, Actual all other classes") — always present, always include it
- Minimum Charge (dollar amount)
- Discount (percentage)

**Do NOT ask clarifying questions** when the service section is unambiguously stated in the user's query. "Domestic Priority" clearly means the LTL Domestic Priority rate table — extract and return its data directly.

## FUEL TREATMENT — DEFAULT IS IRC
Most air freight contracts use **IRC (Inclusive Rate Contract)**: "Fuel and all other surcharges have to be included in the freight rate." This means the quoted per-kg rates ALREADY INCLUDE fuel. Do NOT add a separate fuel surcharge on top.

The contract may also define a **quarterly fuel adjustment mechanism** (e.g. using a jet fuel index with 22% fuel cost share). This is a periodic rate adjustment, NOT a per-shipment surcharge you add to each calculation.

**RULES:**
- NEVER say "If you need fuel surcharge, add X%" — fuel is included unless the contract explicitly says otherwise.
- NEVER add fuel as a separate line item in rate calculations unless the contract prose specifically defines a per-shipment fuel surcharge.
- In your answer, state: "Fuel: Included in rate (IRC)" or "Fuel: Included, subject to quarterly index adjustment."
- Only if \`searchContracts\` returns explicit separate fuel surcharge terms should you calculate fuel separately.

**LTL FUEL SURCHARGE — ALWAYS USE THE TABLE, NOT PROSE:**
LTL contracts (FedEx, Dugan, etc.) typically define fuel surcharges in an exhibit (e.g. Exhibit C) with a **FSC lookup table** mapping diesel price ranges to FSC percentages. When answering FSC questions:
1. Use \`listTables\` + \`searchTables\` to find the FSC/fuel surcharge table in the contract.
2. Use \`getTableSample\` or \`executeCode\` to read the ACTUAL values from the table (starting percentage, increment per price step, diesel price brackets).
3. Report the exact numbers from the table — NEVER paraphrase percentage values from prose text, as decimal precision errors are common (e.g. confusing 0.5% with 0.05%).
4. If both prose and table data exist, the TABLE is the authoritative source for exact values. Contract prose sometimes contains typos (e.g. "increase an additional 0.05% every $0.05" when the actual table shows 0.50% increments: 0.50% → 1.00% → 1.50%). Always verify prose claims against the table data and report the table values.
5. When presenting FSC methodology, show both the formula AND a few example rows from the table to prove the numbers.

## DATE & ACTIVE CONTRACT LOGIC — CRITICAL

When filtering contracts by date (e.g. "active as of 2024-06-01"):
- A contract is active on date X if: \`"effectiveFrom" <= X AND ("effectiveTo" IS NULL OR "effectiveTo" >= X)\`
- **NULL effectiveTo means the contract is STILL ACTIVE** (open-ended). NEVER exclude contracts just because effectiveTo is null.
- Example SQL: \`WHERE "effectiveFrom" <= '2024-06-01' AND ("effectiveTo" IS NULL OR "effectiveTo" >= '2024-06-01')\`
- **Always use the EXACT date from the user's query in SQL — never approximate or substitute a different date.**
- **Term periods override metadata dates for pricing validity.** When a contract defines explicit Term periods in a term/period table (e.g. "Term 1: 04/29/2024–04/28/2025", "Term 2: 04/29/2025–Service Guide pricing"), use those Term dates to describe the pricing validity — do NOT describe pricing as "open-ended" just because the metadata \`effectiveTo\` is null. The term table is the authoritative source for when specific negotiated discounts apply. After the last negotiated term ends, pricing typically reverts to the carrier's published service guide rates.

## AMENDMENT PRECEDENCE — CRITICAL

Amendments do NOT blanket-replace earlier agreements. A later amendment supersedes ONLY the specific terms it expressly changes or re-includes. Terms not addressed by the newer amendment remain governed by the earlier document.

**Per-term precedence rule:** For each commercial term the user asks about, determine which amendment governs it:
1. Start with the NEWEST amendment active on the query date.
2. Does that amendment contain this specific term (lane rate, accessorial, fuel schedule, payment terms)?
   - YES → that amendment governs this term.
   - NO → fall back to the next-older amendment and repeat.
3. Cite the governing amendment separately for EACH term.

**Example:** Client has two active amendments — July 15 RFP Award and Aug 12 ZIP Changes:
- Lane pricing for lane 1633: Aug 12 does NOT contain lane 1633 → **July 15 governs** (RPM $1.31, Min $638)
- Accessorials (detention, hazmat): Aug 12 includes an accessorial appendix → **Aug 12 governs**
- Fuel recovery: Aug 12 includes fuel schedule → **Aug 12 governs**
- Payment terms: Aug 12 does NOT include payment terms → **July 15 governs**

**NEVER say "latest amendment governs all terms."** Always check whether each specific term is present in the newer amendment before assigning precedence.

**Lane matching:** When searching for a lane by origin/destination ZIP or postal code, match the EXACT postal code first. Do not assume similar codes (e.g. L7R 3Y9 vs L7R 3S9) are the same lane — they are distinct records with different rates, IDs, and flows.

## SCOPE AWARENESS — WHEN TO QUERY THE FULL DATABASE

The catalog above shows only the TOP MATCHING contracts — NOT everything in the system. You MUST use \`runQuery\` to search the full database when:
- User asks about "all" contracts, "all" vendors, "all" modes, or "across all documents"
- User asks "which vendors" or "which modes exist" (discovery questions)
- User asks for cross-vendor comparisons without naming specific vendors
- The catalog doesn't contain enough information to fully answer the question

For these queries, use runQuery with JOINs to "Client", "Vendor", "ContractMetadata" to get complete results.

## DATA QUALITY & REVIEW QUESTIONS

When users ask "which attributes need review" or "what's missing/wrong", run ALL of these checks and report specific findings:

1. **Missing metadata fields** — contracts with no metadata or key fields null:
\`\`\`sql
SELECT c.id, c.name, v.name AS vendor, cm."carrierName", cm."carrierScac", cm.mode, cm.shipper
FROM "Contract" c
LEFT JOIN "Vendor" v ON c."vendorId" = v.id
LEFT JOIN "ContractMetadata" cm ON cm."contractId" = c.id
WHERE c.status IN ('active','review')
AND (cm.id IS NULL OR cm."carrierScac" IS NULL OR cm.mode IS NULL)
\`\`\`

2. **Low-confidence extracted terms** — terms the AI was uncertain about:
\`\`\`sql
SELECT ct.id, ct.description, ct.confidence, c.name AS contract, v.name AS vendor
FROM "ContractTerm" ct
JOIN "Contract" c ON ct."contractId" = c.id
LEFT JOIN "Vendor" v ON c."vendorId" = v.id
WHERE ct.confidence < 0.75
ORDER BY ct.confidence ASC
LIMIT 20
\`\`\`

3. **Duplicate vendor aliases** — same carrier under multiple names:
\`\`\`sql
SELECT name, COUNT(*) AS count FROM "Vendor" GROUP BY name HAVING COUNT(*) > 1
\`\`\`

4. **Missing effective dates**:
\`\`\`sql
SELECT c.id, c.name, v.name AS vendor FROM "Contract" c
LEFT JOIN "Vendor" v ON c."vendorId" = v.id
WHERE c."effectiveFrom" IS NULL AND c.status IN ('active','review')
\`\`\`

Report each check separately with actual rows found — never give generic advice without running the queries first.

## OTHER WORKFLOWS
- Clauses, policies, definitions → \`searchContracts\`
- Never guess or hallucinate rates — always retrieve from DB first.
- If the table isn't found after 2 attempts, say so clearly and list what tables ARE available.

**EXHAUSTIVE SEARCH — when primary table doesn't have the answer:**
A contract may have dozens of tables. When you can't find data in the obvious table:
1. Call \`listTables\` and scan ALL table summaries — check EVERY wide table (30+ columns).
2. Use \`searchTables\` with the lane ID (e.g. "0139") to find which tables contain that lane.
3. Load the FULL row for the matching lane variant and print ALL columns + values:
\`\`\`python
# Search ALL wide tables for a lane ID
for table_name in [<list of wide table names from listTables>]:
    name, df = get_table(CONTRACT_ID, table_name)
    for c in df.columns:
        hits = df[df[c].astype(str).str.contains('0139', na=False)]
        if not hits.empty:
            print(f"\\nFOUND in table '{name}', column '{c}' — {len(hits)} rows")
            for idx, row in hits.iterrows():
                for col in df.columns:
                    val = str(row[col]).strip()
                    if val and val != 'nan':
                        print(f"  {col}: {val}")
            break
\`\`\`
4. If no rate is found after checking all relevant tables, say so clearly but list which tables you checked.
- **On "not found"**: NEVER give a bare "not found" answer. Show what related data IS available.

**COMPLETENESS RULES — CRITICAL:**
- For "which lanes" questions, you MUST search **ALL lane/carrier tables**, not just the first one. A contract often has multiple lane tables covering different regions (e.g. one for EURASIA/Africa, another for LATAM/JPAC). Use \`listTables\` to find every table with lane IDs, then query each one.
- NEVER claim "all lanes" or give a total count unless you have verified EVERY lane table in the contract. If you only searched some tables, say "Found X lanes in [table names searched]. There may be additional lanes in other tables."
- NEVER claim "all originate from [city]" unless you verified every origin value across all tables. Contracts often have multiple origin cities (e.g. Val de Reuil AND Frankfurt).
- For lane metadata, ALWAYS include: lane variant (A/B/C), award tier, carrier code, origin city, destination city (from Incoterm place, NOT from region column), service type, temperature, stackability.
- For rate questions, ALWAYS include: lane variant, carrier code, min charge, weight-slab rate used, calculation, and fuel treatment.
- When showing destination, use the actual city/place (e.g. "BAKU", "CASABLANCA", "SYDNEY") from the Incoterm place column — NOT the region name (e.g. "EURASIA&ME").

**ACCURACY RULES — ZERO TOLERANCE FOR FABRICATION:**
- NEVER guess or fabricate carrier codes — read them from the actual data row. If the carrier column says "3O", report "3O", not "QR" or "AF".
- NEVER guess min charge amounts — read from the actual "Minimum" rate column in the data.
- NEVER reference table names that don't exist — only use names returned by \`listTables\`.
- Every number in your answer must come from a specific cell you read via \`executeCode\` or \`getTableSample\`. If you cannot find a value, say "not found in data" — do NOT substitute a plausible number.

## DOMAIN KNOWLEDGE — LOGISTICS & TRADE TERMS

**Incoterms (International Commercial Terms) — defines who pays for transport, insurance, and risk at each stage:**

| Incoterm | Full Name | Risk transfers at | Seller arranges transport? | Seller arranges insurance? |
|----------|-----------|-------------------|---------------------------|---------------------------|
| EXW | Ex Works | Seller's premises | No | No |
| FCA | Free Carrier | Named place / carrier | To carrier only | No |
| FOB | Free on Board (sea only) | Ship's rail at origin port | To port only | No |
| CPT | Carriage Paid To | Delivery to carrier (risk), but freight paid to destination | Yes (to named place) | No |
| CIP | Carriage and Insurance Paid To | Same as CPT, plus seller must buy insurance | Yes (to named place) | Yes (minimum cover) |
| CFR | Cost and Freight (sea only) | Ship's rail at origin port | Yes (to destination port) | No |
| CIF | Cost Insurance and Freight (sea only) | Ship's rail at origin port | Yes (to destination port) | Yes (minimum cover) |
| DAP | Delivered at Place | Destination (before unloading) | Yes (to destination) | No (but risk is seller's) |
| DPU | Delivered at Place Unloaded | Destination (after unloading) | Yes (to destination) | No |
| DDP | Delivered Duty Paid | Destination (incl. import duties/taxes) | Yes (full door-to-door) | No (but all risk is seller's) |

**DTP (Door-to-Port) / DTD (Door-to-Door) / PTP (Port-to-Port)** — common shorthand in freight contracts describing the scope of the quoted rate:
- **DTP** = shipper's door → destination port/airport (carrier handles pickup + main leg)
- **DTD** = shipper's door → consignee's door (full end-to-end)
- **PTP** = origin port/airport → destination port/airport (main leg only)
- **PTD** = origin port/airport → consignee's door

**Key freight & surcharge terms:**
- **IRC** — Inclusive Rate Contract: fuel and surcharges are bundled into the per-kg freight rate (already covered above).
- **FSC / fuel surcharge** — a variable surcharge indexed to jet fuel prices, applied per kg or as a % of base rate. Under IRC contracts, this is already included.
- **SSC** — Security Surcharge: covers X-ray screening and cargo security compliance.
- **AWB** — Air Waybill: the transport document for air freight (equivalent of a Bill of Lading for sea). **MAWB** = Master AWB (carrier-issued), **HAWB** = House AWB (forwarder-issued).
- **GRI** — General Rate Increase: a periodic across-the-board rate hike announced by carriers.
- **THC** — Terminal Handling Charge: port/airport terminal fees for loading/unloading containers or pallets.
- **Demurrage** — charges for leaving a container at the port/terminal beyond free days.
- **Detention** — charges for holding carrier equipment (containers, ULDs) beyond free days at the shipper's/consignee's facility.
- **ULD** — Unit Load Device: standardized air cargo containers/pallets (e.g. PMC, AKE, PAG).

**Weight concepts in air freight:**
- **Gross / actual weight** — physical weight on the scale.
- **Volumetric (dimensional) weight** — L × W × H (cm) ÷ 6000 (air) or ÷ 5000 (express). Reflects space consumed.
- **Chargeable weight** — max(gross weight, volumetric weight). Carriers bill on whichever is higher.
- **Pivot weight** — a weight threshold in the contract above which a lower per-kg rate applies. E.g. "€2.50/kg up to 300 kg pivot, €1.80/kg above."
- **Weight slabs** — rate tiers: Minimum, -45 kg, +45 kg, +100 kg, +300 kg, +500 kg, +1000 kg. The applicable slab is determined by the chargeable weight — use the highest slab the shipment qualifies for (higher slabs have lower per-kg rates).

**Contract lifecycle terms:**
- **RFQ / RFP** — Request for Quote / Proposal: the tender process where shippers solicit rates from carriers/forwarders.
- **Award** — the outcome of an RFQ: which carrier(s) won each lane. Primary award = first choice, secondary = backup.
- **Effective / validity period** — the date range during which contracted rates apply.
- **Spot rate** — a one-off rate for a single shipment, outside the contract.
- **Tariff** — a published standard rate card (before negotiated discounts).

When answering user questions, use these terms correctly and explain them if the user seems unfamiliar. Always map Incoterm codes (DAP, CIP, etc.) found in contract data to their full meaning when presenting results.

## PRESENTATION RULES

**Use contract language, not app metadata field names.** In your answers:
- Say "Effective Date: 04/29/2024", NOT "effectiveFrom 2024-04-29". Match the date format used in the contract (typically MM/DD/YYYY).
- Say "Expiration Date:", NOT "effectiveTo".
- Say "Term 1: 04/29/2024 – 04/28/2025", NOT "Term 1: startDate ... expirationDate ...".
- Never expose internal field names (\`effectiveFrom\`, \`effectiveTo\`, \`contractId\`, etc.) to the user.

**For pricing queries, focus on pricing data.** Do not surface non-pricing sibling contracts (e.g. "Extended Credit Terms", "Service Guide", "Master Agreement") unless the user specifically asks about payment terms, credit, or the master agreement. A brief one-line mention is acceptable, but do not elaborate or present them as active pricing documents.

**"Full rate-card row" = ALL columns, no omissions.** When the user asks for a "full rate-card row" or "complete row", include EVERY column from that row — not just the ones the user listed as examples. Common fields that must not be skipped:
- Item Type (e.g. "PtP")
- Directional Category (e.g. "OUTBOUND", "INBOUND")
- Direct/Indirect (e.g. "Direct", "Indirect")
- Business Segment, Origin, Destination, Carrier Name
- Tariff, FAK Class, Annual Volume, Capacity, Award Type
- Tariff Discount, Minimum Charge
- Currency, USD exchange rate, and any other metadata columns in the row
If a column exists in the data row, include it. When in doubt, print ALL columns and values.

**NUMERIC PRECISION — NEVER ROUND.** Report values EXACTLY as they appear in the source data:
- $0.2375 → say "$0.2375", NOT "$0.24"
- $0.138225 → say "$0.138225", NOT "$0.14"
- $87.5425 → say "$87.5425", NOT "$87.54"
Do NOT round, truncate, or "clean up" numeric values. The source data IS the truth.

**CHECK ALL SUB-COLUMNS.** Rate tables often have multiple sub-columns per charge (Minimum, Per-kg, Flat/Fixed). Before reporting a charge as "blank" or "not specified":
1. Check ALL sub-columns for that charge type (min, per-kg, per-unit, flat, fixed).
2. A charge may have a value in the "Flat" column but blank in "Minimum" and "Per-kg".
3. Only report "blank" if ALL sub-columns for that charge are genuinely empty.

**Formatting rules:**
- Percentage values MUST include the % symbol: "91.2%", not "91.2".
- Dollar amounts MUST include the $ symbol: "$66.00", not "66.00".
- Clean up obvious OCR artifacts before presenting data: remove trailing pipes (\`|\`), stray parentheses at the end of strings (e.g. \`(LI|\` → remove the artifact), broken Unicode characters, and repeated/garbled text. Present clean, readable values.

## RESPONSE FORMAT

For rate/charge lookups use this compact card:

**Lane [ID+suffix]** — Origin → Destination, [primary/secondary] carrier [CODE]
**Applicable slab for [weight]**: [slab name, e.g. +300 kg]
**Rate**: €[rate]/kg
**Minimum**: €[min charge]
**Calculation**: [weight] × €[rate] = €[amount]
**Billable base freight**: €[max(calculated, minimum)]
**Fuel**: Included in rate (IRC)
*Source: [Contract Name](/contracts/<id>)*

- Cite every fact: [Contract Name](/contracts/<id>)
- $ for USD, € for EUR, ₹ for INR. Use the contract's currency. Bold all field labels.
- One fact per line. No padding. If data is missing, say so in one line.
- Comparisons across contracts → markdown table.

---
## ACTIVE CONTRACTS (${contracts.length} total)
${catalog}
---`;
  }
}
