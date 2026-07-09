import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { ExtractedTable } from '@repo/types';

/** A single table from Azure DI's analyzeResult.tables, converted to grid */
interface AdiTable {
  /** Pipe-delimited text rendering of the table */
  text: string;
  headers: string[];
  rows: string[][];
  pageNumbers: number[];
}

export interface OcrResult {
  rawText: string;
  pages?: number;
  /** Structured tables from Azure DI analyzeResult.tables */
  rawTables: AdiTable[];
}

export interface ParseResult {
  text: string;
  tables?: ExtractedTable[];
  pages?: number;
  confidence?: number;
  isTableDocument?: boolean;
}

const AZURE_EXTS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tiff',
  '.webp',
  '.bmp',
]);
const TEXT_EXTS = new Set(['.csv', '.txt']);
const EXCEL_EXTS = new Set(['.xlsx', '.xls']);
const DOCX_EXTS = new Set(['.docx', '.doc']);

const CHUNK_CHAR_LIMIT = 50_000;
const LLM_CONCURRENCY = 5;
const MAX_CHUNKS = 100;

const TABLE_GROUP_SIZE = 4;
const TABLE_GROUP_OVERLAP = 1;

const tableGroupSchema = z.object({
  tables: z.array(
    z.object({
      originalIndices: z
        .array(z.number())
        .describe(
          'Which input table indices (0-based within this group) make up this merged table. ' +
            'Use [0] if standalone, [0,1] if tables 0 and 1 should be merged, etc.',
        ),
      name: z
        .string()
        .describe('Descriptive table name inferred from content and context'),
      summary: z
        .string()
        .describe(
          '1-2 sentences: what data does this table contain? Mention key columns, routes, or metrics.',
        ),
    }),
  ),
});

const proseCleanupSchema = z.object({
  textContent: z
    .string()
    .describe(
      'The ORIGINAL document text verbatim — only structural fixes applied. Never summarize or paraphrase.',
    ),
});

const PROSE_CLEANUP_PROMPT = `You are a document structuring assistant. You receive prose text (no tables) extracted via OCR from a logistic contract PDF.

The text may have structural problems:
- Page headers and footers repeat throughout
- Paragraphs may be broken mid-sentence at page boundaries
- Section numbers may be duplicated from page breaks

Your job:
1. Remove repeated page headers/footers (running heads, page numbers, document titles)
2. Rejoin paragraphs broken at page boundaries
3. Preserve ALL original text verbatim — do NOT summarize, paraphrase, or rewrite
4. Keep all clause numbers, section headings, party names, dates, and legal language word-for-word`;

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  constructor(private readonly config: ConfigService) {}

  async parse(filePath: string): Promise<ParseResult> {
    const ext = path.extname(filePath).toLowerCase();

    if (AZURE_EXTS.has(ext)) {
      if (!this.isAzureConfigured()) {
        throw new BadRequestException(
          'Azure Document Intelligence credentials are required to parse PDF and image files. ' +
            'Set AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY in your environment.',
        );
      }
      const ocr = await this.extractWithOcr(filePath);
      return this.refine(ocr.rawText, ocr.rawTables, ocr.pages);
    }

    if (TEXT_EXTS.has(ext)) {
      return this.parsePlainText(filePath);
    }

    if (EXCEL_EXTS.has(ext)) {
      return this.extractFromXlsx(filePath);
    }

    if (DOCX_EXTS.has(ext)) {
      return this.parseDocx(filePath);
    }

    throw new BadRequestException(`Unsupported file type: ${ext}`);
  }

  async extractWithOcr(filePath: string): Promise<OcrResult> {
    if (!this.isAzureConfigured()) {
      throw new BadRequestException(
        'Azure Document Intelligence credentials are required. ' +
          'Set AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY.',
      );
    }

    const endpoint = this.config.get<string>(
      'AZURE_DOC_INTELLIGENCE_ENDPOINT',
    )!;
    const key = this.config.get<string>('AZURE_DOC_INTELLIGENCE_KEY')!;

    this.logger.log(`Parsing with Azure Document Intelligence: ${filePath}`);

    const {
      default: DocumentIntelligence,
      getLongRunningPoller,
      isUnexpected,
    } = await import('@azure-rest/ai-document-intelligence');

    const client = DocumentIntelligence(endpoint, { key });

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(
        `Document file not found at ${filePath}. ` +
          'It may have been lost during a server restart. Please re-upload the file.',
      );
    }

    const fileStream = fs.createReadStream(filePath);
    const streamError = new Promise<never>((_, reject) =>
      fileStream.once('error', reject),
    );

    const initialResponse = await Promise.race([
      (client as any)
        .path('/documentModels/{modelId}:analyze', 'prebuilt-layout')
        .post({
          contentType: 'application/octet-stream',
          body: fileStream,
          queryParameters: { outputContentFormat: 'markdown' },
        }),
      streamError,
    ]);

    if (isUnexpected(initialResponse)) {
      throw new Error(
        `Azure Document Intelligence error: ${JSON.stringify(initialResponse.body)}`,
      );
    }

    const poller = getLongRunningPoller(client, initialResponse);

    const AZURE_DI_TIMEOUT_MS = 5 * 60 * 1000;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Azure DI timed out after 5 min'));
      }, AZURE_DI_TIMEOUT_MS);
    });
    const result = await Promise.race([poller.pollUntilDone(), timeout]);

    if (isUnexpected(result)) {
      throw new Error(
        `Azure Document Intelligence polling error: ${JSON.stringify(result.body)}`,
      );
    }

    const analyzeResult = (result.body as any).analyzeResult;
    const pages: number | undefined = analyzeResult?.pages?.length;
    const rawText: string = analyzeResult?.content ?? '';

    const rawTables = this.convertAdiTables(
      analyzeResult?.tables ?? [],
      rawText,
    );

    this.logger.log(
      `Azure DI returned ${rawText.length} chars, ${pages ?? '?'} page(s), ${rawTables.length} structured table(s)`,
    );

    return { rawText, pages, rawTables };
  }

  /**
   * Step 2: Refine raw OCR output.
   *  - Process structured tables via LLM (merge splits, name, summarize)
   *  - Clean up prose via LLM
   */
  async refine(
    rawMarkdown: string,
    rawTables: AdiTable[],
    pages?: number,
  ): Promise<ParseResult> {
    // Phase 0: Rebuild text representation with deduplication for LLM context,
    // but keep the original rows UNTOUCHED for DB storage.
    for (const table of rawTables) {
      const textRows = table.rows.map((r) => [...r]);
      this.deduplicateDominantValues(textRows);
      const textLines: string[] = [table.headers.join(' | ')];
      for (const row of textRows) {
        const line = row.join(' | ').trim();
        if (line && line !== '|'.repeat(row.length - 1).trim()) {
          textLines.push(row.join(' | '));
        }
      }
      table.text = textLines.join('\n');
    }

    // Phase 1: Strip HTML table blocks from prose
    const prose = rawMarkdown
      .replace(/<table>[\s\S]*?<\/table>/gi, '\n\n')
      .replace(/\n{3,}/g, '\n\n');

    // Phase 2: Process tables via LLM in groups
    const tables =
      rawTables.length > 0 ? await this.processTableGroups(rawTables) : [];

    this.logger.log(
      `Table processing: ${rawTables.length} Azure DI table(s) → ${tables.length} merged/named table(s)`,
    );

    // Phase 3: Clean up prose via LLM
    const cleanedProse = await this.cleanProseWithLlm(prose);

    const isTableDocument = tables.length > 0;
    this.logger.log(
      `Refinement complete: ${tables.length} table(s), ${cleanedProse.length} chars prose`,
    );

    return {
      text: cleanedProse,
      tables,
      pages,
      isTableDocument,
    };
  }

  private isAzureConfigured(): boolean {
    const endpoint = this.config.get<string>('AZURE_DOC_INTELLIGENCE_ENDPOINT');
    const key = this.config.get<string>('AZURE_DOC_INTELLIGENCE_KEY');
    return !!(endpoint && key);
  }

  // ── Azure DI table conversion ──────────────────────────────────────────

  /**
   * Convert Azure DI's analyzeResult.tables into our AdiTable format.
   * Uses each table's spans.offset to capture the preceding markdown heading
   * as context (e.g. "Budapest → Tokyo Narita" above the rate table).
   */
  private convertAdiTables(adiTables: any[], rawText: string): AdiTable[] {
    return adiTables
      .map((table) => this.convertOneAdiTable(table, rawText))
      .filter((t): t is AdiTable => t !== null);
  }

  private convertOneAdiTable(table: any, rawText: string): AdiTable | null {
    const rowCount: number = table.rowCount ?? 0;
    const colCount: number = table.columnCount ?? 0;
    if (rowCount < 2 || colCount === 0) return null;

    const cells: any[] = table.cells ?? [];

    const grid: string[][] = Array.from({ length: rowCount }, () =>
      Array(colCount).fill(''),
    );
    const headerRowIndices = new Set<number>();

    for (const cell of cells) {
      const r: number = cell.rowIndex ?? 0;
      const c: number = cell.columnIndex ?? 0;
      const content: string = (cell.content ?? '').trim();
      const rSpan: number = cell.rowSpan ?? 1;
      const cSpan: number = cell.columnSpan ?? 1;
      const kind: string = cell.kind ?? 'content';

      if (kind === 'columnHeader') headerRowIndices.add(r);

      // Fill spanned cells — keep all values for DB storage.
      // Dedup for text display happens later in refine().
      for (let ri = r; ri < Math.min(r + rSpan, rowCount); ri++) {
        for (let ci = c; ci < Math.min(c + cSpan, colCount); ci++) {
          grid[ri][ci] = content;
        }
      }
    }

    // Determine header rows vs data rows
    let headerEndRow = 0;
    if (headerRowIndices.size > 0) {
      headerEndRow = Math.max(...headerRowIndices) + 1;
    } else {
      headerEndRow = 1;
    }

    const headers: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const parts: string[] = [];
      for (let r = 0; r < headerEndRow; r++) {
        const val = grid[r][c];
        if (val && !parts.includes(val)) parts.push(val);
      }
      headers.push(parts.join(' – '));
    }

    // Rows for DB storage — keep ALL values (including span-filled ones like "DTP")
    const rows = grid.slice(headerEndRow);
    if (rows.length === 0) return null;

    // Page numbers
    const pageNumbers: number[] = (table.boundingRegions ?? []).map(
      (br: any) => br.pageNumber as number,
    );

    // Use the span offset to capture the preceding markdown context (e.g. route heading).
    const spanOffset: number = table.spans?.[0]?.offset ?? -1;
    let contextBefore = '';
    if (spanOffset > 0 && rawText) {
      const contextStart = Math.max(0, spanOffset - 600);
      contextBefore = rawText
        .slice(contextStart, spanOffset)
        .replace(/<[^>]+>/g, '') // strip HTML tags
        .trim()
        .split('\n')
        .filter((l) => l.trim())
        .slice(-8) // last 8 non-empty lines before the table
        .join('\n');
    }

    // Build full text representation: context + headers + all rows
    const textParts: string[] = [];
    if (contextBefore) textParts.push(contextBefore);
    textParts.push(headers.join(' | '));
    for (const row of rows) {
      textParts.push(row.join(' | '));
    }
    const text = textParts.join('\n');

    return { text, headers, rows, pageNumbers };
  }

  // ── Phase 2: LLM table grouping (merge + name + summarize) ─────────

  /**
   * Send tables to LLM in overlapping groups of TABLE_GROUP_SIZE.
   * LLM merges split tables, names them, and writes summaries.
   */
  private async processTableGroups(
    rawTables: AdiTable[],
  ): Promise<ExtractedTable[]> {
    if (rawTables.length === 0) return [];

    try {
      // Build groups with overlap
      const groups: { tables: AdiTable[]; globalOffset: number }[] = [];
      for (
        let i = 0;
        i < rawTables.length;
        i += TABLE_GROUP_SIZE - TABLE_GROUP_OVERLAP
      ) {
        const slice = rawTables.slice(i, i + TABLE_GROUP_SIZE);
        groups.push({ tables: slice, globalOffset: i });
        if (i + TABLE_GROUP_SIZE >= rawTables.length) break;
      }

      this.logger.log(
        `Processing ${rawTables.length} table(s) in ${groups.length} group(s)`,
      );

      const allNamed: ExtractedTable[] = [];
      const mergedGlobalIndices = new Set<number>();

      for (let gi = 0; gi < groups.length; gi += LLM_CONCURRENCY) {
        const batch = groups.slice(gi, gi + LLM_CONCURRENCY);
        const results = await Promise.all(
          batch.map((g) => this.nameTableGroup(g.tables)),
        );

        for (let bi = 0; bi < results.length; bi++) {
          const group = batch[bi];
          const named = results[bi];

          for (const entry of named) {
            // Map local indices back to global
            const globalIndices = entry.localIndices.map(
              (li) => group.globalOffset + li,
            );

            // Skip if all indices were already merged in a previous group
            if (globalIndices.every((gi) => mergedGlobalIndices.has(gi))) {
              continue;
            }
            globalIndices.forEach((gi) => mergedGlobalIndices.add(gi));

            // Merge the referenced tables
            const sourceTables = globalIndices
              .filter((gi) => gi < rawTables.length)
              .map((gi) => rawTables[gi]);

            const mergedHeaders = sourceTables[0]?.headers ?? [];
            const mergedRows = sourceTables.flatMap((t) => t.rows);
            const mergedText = sourceTables.map((t) => t.text).join('\n');

            allNamed.push({
              name: entry.name,
              summary: entry.summary,
              headers: mergedHeaders,
              rows: mergedRows,
              textContent: mergedText,
            });
          }
        }
      }

      // Add any tables the LLM didn't cover
      for (let i = 0; i < rawTables.length; i++) {
        if (!mergedGlobalIndices.has(i)) {
          allNamed.push({
            name: `Table ${i + 1}`,
            summary: `Table on page(s) ${rawTables[i].pageNumbers.join(', ')} with ${rawTables[i].rows.length} rows`,
            headers: rawTables[i].headers,
            rows: rawTables[i].rows,
            textContent: rawTables[i].text,
          });
        }
      }

      this.logger.log(`Named ${allNamed.length} table(s) via LLM`);

      // Horizontal merge: Azure DI often splits wide tables into left/right halves.
      // If two tables share the same pages and have the same row count, merge columns.
      const horizontallyMerged = this.mergeHorizontalSplits(allNamed);
      this.logger.log(
        `After horizontal merge: ${horizontallyMerged.length} table(s) (was ${allNamed.length})`,
      );
      return horizontallyMerged;
    } catch (err) {
      this.logger.error(
        `Table grouping failed — using fallback names: ${(err as Error).message}`,
      );
      return rawTables.map((t, i) => ({
        name: `Table ${i + 1}`,
        summary: `Table with ${t.rows.length} rows. Headers: ${t.headers.join(', ')}`,
        headers: t.headers,
        rows: t.rows,
        textContent: t.text,
      }));
    }
  }

  /**
   * Merge tables that Azure DI split horizontally (left/right halves of one wide table).
   * Two tables are candidates if they have the same row count and overlapping page numbers.
   */
  private mergeHorizontalSplits(tables: ExtractedTable[]): ExtractedTable[] {
    const ROW_COUNT_TOLERANCE = 2;
    const merged = new Set<number>();
    const result: ExtractedTable[] = [];

    for (let i = 0; i < tables.length; i++) {
      if (merged.has(i)) continue;

      let current = tables[i];

      for (let j = i + 1; j < tables.length; j++) {
        if (merged.has(j)) continue;

        const candidate = tables[j];
        const rowDiff = Math.abs(current.rows.length - candidate.rows.length);

        if (rowDiff > ROW_COUNT_TOLERANCE) continue;

        // Check for overlapping content in text (same page context)
        const hasOverlap =
          current.textContent.slice(0, 200) ===
          candidate.textContent.slice(0, 200);

        // Check for complementary headers (left has lane IDs, right has rates)
        const currentHasLaneId = current.headers.some(
          (h) =>
            /lane.*id|item.*name|supplier|carrier/i.test(h) && h.length > 2,
        );
        const candidateHasRates = candidate.headers.some((h) =>
          /rate|freight|minimum|kg|currency|\+\d+/i.test(h),
        );
        const candidateHasLaneId = candidate.headers.some(
          (h) =>
            /lane.*id|item.*name|supplier|carrier/i.test(h) && h.length > 2,
        );
        const currentHasRates = current.headers.some((h) =>
          /rate|freight|minimum|kg|currency|\+\d+/i.test(h),
        );

        const isComplementary =
          (currentHasLaneId && candidateHasRates) ||
          (candidateHasLaneId && currentHasRates) ||
          hasOverlap;

        if (!isComplementary) continue;

        // Merge: take the shorter row count and concatenate columns
        const minRows = Math.min(current.rows.length, candidate.rows.length);
        const mergedRows = Array.from({ length: minRows }, (_, r) => [
          ...(current.rows[r] ?? []),
          ...(candidate.rows[r] ?? []),
        ]);

        const mergedHeaders = [...current.headers, ...candidate.headers];

        this.logger.log(
          `Horizontal merge: "${current.name}" (${current.headers.length} cols) + "${candidate.name}" (${candidate.headers.length} cols) → ${mergedHeaders.length} cols, ${minRows} rows`,
        );

        current = {
          name: `${current.name} + ${candidate.name}`,
          summary: `${current.summary} Combined with: ${candidate.summary}`,
          headers: mergedHeaders,
          rows: mergedRows,
          textContent: `${current.textContent}\n${candidate.textContent}`,
        };

        merged.add(j);
      }

      result.push(current);
    }

    return result;
  }

  private async nameTableGroup(
    tables: AdiTable[],
  ): Promise<{ localIndices: number[]; name: string; summary: string }[]> {
    const MAX_ROW_CHARS = 2000;
    const prompt = tables
      .map((t, i) => {
        // Always include ALL column headers — they're critical for naming
        const headerLine = `COLUMNS (${t.headers.length}): ${t.headers.map((h) => `"${h}"`).join(', ')}`;

        // Truncate row data only
        const rowText = t.rows
          .slice(0, 5)
          .map((r) => r.join(' | '))
          .join('\n');
        const truncatedRows =
          rowText.length > MAX_ROW_CHARS
            ? rowText.slice(0, MAX_ROW_CHARS) + '\n...'
            : rowText;

        return (
          `--- Table ${i} (page ${t.pageNumbers.join(',') || '?'}, ${t.rows.length} rows, ${t.headers.length} columns) ---\n` +
          `${headerLine}\n\nSAMPLE ROWS:\n${truncatedRows}`
        );
      })
      .join('\n\n');

    const { object } = await generateObject({
      model: openai('gpt-4.1'),
      system:
        'You receive a group of consecutive tables extracted from a logistic contract PDF.\n\n' +
        'Your job:\n' +
        '1. Determine if any adjacent tables should be MERGED (same column structure, split across pages).\n' +
        '2. Give each (possibly merged) table a descriptive name that reflects ALL the data it contains.\n' +
        '3. Write a 1-2 sentence summary mentioning the most important columns, especially:\n' +
        '   - Rate/price/tariff columns (e.g. freight rates per kg by weight slab)\n' +
        '   - Route/lane identifiers\n' +
        '   - Cost breakdowns (pre-carriage, handling, destination charges)\n' +
        '   - If the table has rate columns like "+300 kg", "+500 kg" etc., mention "includes freight rates by weight slab" in the summary.\n\n' +
        'IMPORTANT: Read ALL column names carefully. Tables often contain rate/pricing data hidden in later columns ' +
        '(e.g. "applicable rates – FREIGHT RATES +300 kg in currency"). The name and summary MUST reflect this.\n\n' +
        'For originalIndices: use the 0-based index within this group. If tables 0 and 1 should be merged, return [0,1].\n' +
        'If a table stands alone, return [<its index>].',
      prompt,
      schema: tableGroupSchema,
    });

    return object.tables.map((t) => ({
      localIndices: t.originalIndices,
      name: t.name,
      summary: t.summary,
    }));
  }

  /**
   * In-place: for each column, if a single value fills >80% of non-empty cells
   * (and appears >3 times), keep only the first occurrence and blank the rest.
   * Handles merged-cell repetition from Azure DI and dirty cached OCR.
   */
  private deduplicateDominantValues(rows: string[][]): void {
    if (rows.length < 4) return;
    const colCount = rows[0]?.length ?? 0;

    for (let c = 0; c < colCount; c++) {
      const freq = new Map<string, number>();
      let nonEmpty = 0;
      for (const row of rows) {
        const val = row[c];
        if (val) {
          nonEmpty++;
          freq.set(val, (freq.get(val) ?? 0) + 1);
        }
      }
      if (nonEmpty < 4) continue;
      for (const [val, count] of freq) {
        if (count / nonEmpty > 0.8 && count > 3) {
          let kept = false;
          for (const row of rows) {
            if (row[c] === val) {
              if (!kept) {
                kept = true;
              } else {
                row[c] = '';
              }
            }
          }
        }
      }
    }
  }

  // ── Phase 3: LLM prose cleanup ─────────────────────────────────────────

  private async cleanProseWithLlm(prose: string): Promise<string> {
    if (!prose.trim()) return '';

    try {
      const chunks = this.chunkText(prose);
      this.logger.log(
        `Cleaning ${prose.length} chars of prose in ${chunks.length} chunk(s)`,
      );

      const cleanedParts: string[] = [];

      for (let i = 0; i < chunks.length; i += LLM_CONCURRENCY) {
        const batch = chunks.slice(i, i + LLM_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (chunk) => {
            const { object } = await generateObject({
              model: openai('gpt-4.1'),
              system: PROSE_CLEANUP_PROMPT,
              prompt: chunk,
              schema: proseCleanupSchema,
            });
            return object.textContent;
          }),
        );
        cleanedParts.push(...results);
      }

      return cleanedParts
        .map((p) => p.trim())
        .filter(Boolean)
        .join('\n\n');
    } catch (err) {
      this.logger.error(
        `Prose cleanup failed — using raw prose: ${(err as Error).message}`,
      );
      return prose;
    }
  }

  private chunkText(text: string): string[] {
    if (text.length <= CHUNK_CHAR_LIMIT) return [text];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length && chunks.length < MAX_CHUNKS) {
      let end = Math.min(start + CHUNK_CHAR_LIMIT, text.length);

      if (end < text.length) {
        const searchFrom = start + Math.floor(CHUNK_CHAR_LIMIT * 0.8);
        const breakPoint = text.lastIndexOf('\n\n', end);
        if (breakPoint > searchFrom) {
          end = breakPoint;
        }
      }

      chunks.push(text.slice(start, end));
      start = end;
    }

    return chunks;
  }

  private async parseDocx(filePath: string): Promise<ParseResult> {
    this.logger.log(`Parsing DOCX: ${filePath}`);
    const mammoth = await import('mammoth');
    const buffer = fs.readFileSync(filePath);
    const { value: text } = await mammoth.extractRawText({ buffer });
    this.logger.log(`DOCX extracted: ${text.length} chars`);
    return { text };
  }

  private parsePlainText(filePath: string): ParseResult {
    this.logger.log(`Parsing as plain text: ${filePath}`);
    const text = fs.readFileSync(filePath, 'utf-8');
    return { text };
  }

  // ── XLSX / Excel parsing ───────────────────────────────────────────────────

  private static readonly SKIP_SHEET_PATTERNS = [
    /^cover$/i,
    /^instructions?$/i,
    /^index$/i,
    /^legend$/i,
    /^toc$/i,
    /^table\s*of\s*contents$/i,
    /^summary$/i,
    /^notes?$/i,
    /^readme$/i,
    /^changelog$/i,
  ];

  extractFromXlsx(filePath: string): ParseResult {
    this.logger.log(`Parsing XLSX: ${filePath}`);

    // cellDates: false — keep dates as numeric serials (no JS Date objects).
    // dateNF: 'yyyy-mm-dd' — override date format so SSF outputs ISO dates.
    // raw: false goes on sheet_to_json (not here) to trigger SSF formatting.
    const workbook = XLSX.readFile(filePath, {
      cellDates: false,
      dateNF: 'yyyy-mm-dd',
    });
    const tables: ExtractedTable[] = [];
    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const isNonData = DocumentParserService.SKIP_SHEET_PATTERNS.some((p) =>
        p.test(sheetName.trim()),
      );
      if (isNonData) {
        this.logger.log(`  Skipping non-data sheet: "${sheetName}"`);
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      // raw: false — SSF formats every cell including date serials.
      // With cellDates:false + dateNF:'yyyy-mm-dd', SSF uses pure arithmetic
      // (no JS Date) to convert serials → "2022-03-14". Zero timezone risk.
      const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false,
      });

      // Skip sheets with too few rows to contain meaningful data (header + at least 2 data rows)
      if (rows.length < 3) {
        this.logger.log(
          `  Skipping sparse sheet: "${sheetName}" (${rows.length} rows)`,
        );
        continue;
      }

      // Find first non-empty row to use as headers
      const headerRowIdx = rows.findIndex((r) =>
        r.some((cell) => cell !== null && cell !== undefined && cell !== ''),
      );
      if (headerRowIdx === -1) continue;

      const rawHeaders = rows[headerRowIdx].map((h) => String(h ?? '').trim());
      // Drop trailing empty headers
      const lastNonEmpty = rawHeaders.reduceRight(
        (acc, h, i) => (acc === -1 && h !== '' ? i : acc),
        -1,
      );
      const headers =
        lastNonEmpty >= 0 ? rawHeaders.slice(0, lastNonEmpty + 1) : rawHeaders;

      if (headers.length === 0) continue;

      const colCount = headers.length;

      // Data rows — skip rows that are entirely empty
      const dataRows = rows
        .slice(headerRowIdx + 1)
        .map((r) =>
          r.slice(0, colCount).map((c) => {
            // With cellDates:false + raw:false, xlsx's SSF formats date serials
            // using pure arithmetic (no JS Date), so this branch is never
            // reached. Kept as a safety net if cellDates:true is ever re-enabled.
            if (c instanceof Date) {
              const y = c.getFullYear();
              const m = String(c.getMonth() + 1).padStart(2, '0');
              const d = String(c.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            }
            return String(c ?? '').trim();
          }),
        )
        .filter((r) => r.some((c) => c !== ''));

      if (dataRows.length === 0) continue;

      // Dedup only for text representation, keep original rows for DB
      const textRows = dataRows.map((r) => [...r]);
      this.deduplicateDominantValues(textRows);

      const tableText = [
        `Sheet: ${sheetName}`,
        headers.join(' | '),
        ...textRows.map((r) => r.join(' | ')),
      ].join('\n');

      textParts.push(tableText);

      tables.push({
        name: sheetName,
        summary: `Sheet "${sheetName}" with ${dataRows.length} rows and columns: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '…' : ''}.`,
        headers,
        rows: dataRows,
        textContent: tableText,
      });

      this.logger.log(
        `  Sheet "${sheetName}": ${headers.length} cols, ${dataRows.length} rows`,
      );
    }

    const text = textParts.join('\n\n');
    this.logger.log(
      `XLSX parsed: ${tables.length} sheet(s), ${text.length} chars`,
    );

    return {
      text,
      tables,
      isTableDocument: tables.length > 0,
    };
  }
}
