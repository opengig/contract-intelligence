'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  Sparkles,
  RotateCcw,
  Database,
  Search,
  FileText,
  ChevronDown,
  Calculator,
  Table2,
  Code2,
  ScanSearch,
  Rows3,
  CheckCircle2,
  Loader2,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { contractsApi } from '@/services/contracts/api';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

interface ContractOption {
  id: string;
  name: string;
  vendorId: string;
  vendor: { name: string };
}

const SUGGESTIONS = [
  'What is the lane ID for shipments from Val de Reuil to Casablanca?',
  'For Lane 0202, what are the origin, destination, Incoterm, service type, stackability, and temperature range?',
  'Which lanes are DTP from France to Israel?',
  'For Lane 0202 to Tel Aviv, show the primary and secondary carrier options?',
  'What is the primary rate for a 400 kg shipment on Lane 0139?',
  'Calculate the freight for a 20 kg shipment on Lane 0202B, including minimum charge logic.',
  'Which lanes require +2°C/+8°C temperature control?',
];

/* ---- tool metadata ---- */

interface ToolMeta {
  icon: LucideIcon;
  label: string;
  activeLabel: string;
  color: string;
  bgColor: string;
}

const TOOL_META: Record<string, ToolMeta> = {
  searchContracts: {
    icon: Search,
    label: 'Contract search complete',
    activeLabel: 'Searching contracts & clauses…',
    color: 'text-violet-600',
    bgColor: 'bg-violet-500/10',
  },
  listTables: {
    icon: Table2,
    label: 'Tables discovered',
    activeLabel: 'Discovering available tables…',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
  },
  searchTables: {
    icon: ScanSearch,
    label: 'Table search complete',
    activeLabel: 'Searching tables by keyword…',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-500/10',
  },
  getTableSample: {
    icon: Rows3,
    label: 'Sample data loaded',
    activeLabel: 'Loading table sample data…',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
  },
  executeCode: {
    icon: Code2,
    label: 'Code execution complete',
    activeLabel: 'Running Python analysis…',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
  },
  runQuery: {
    icon: Database,
    label: 'Query executed',
    activeLabel: 'Running SQL query…',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
  },
  calculate: {
    icon: Calculator,
    label: 'Calculation complete',
    activeLabel: 'Evaluating expression…',
    color: 'text-pink-600',
    bgColor: 'bg-pink-500/10',
  },
};

const DEFAULT_META: ToolMeta = {
  icon: Terminal,
  label: 'Tool complete',
  activeLabel: 'Running tool…',
  color: 'text-muted-foreground',
  bgColor: 'bg-muted/50',
};

/* ---- Tool result renderers ---- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SearchContractsResult({ result }: { result: Record<string, any> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textMatches: Record<string, any>[] | undefined = result?.textMatches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const semanticMatches: Record<string, any>[] | undefined = result?.semanticMatches;
  const total: number | undefined = result?.totalResults;

  if (!total && !textMatches?.length && !semanticMatches?.length) return null;

  return (
    <div className='space-y-3'>
      {total != null && (
        <p className='text-xs text-muted-foreground'>
          {total} result{total !== 1 ? 's' : ''} found
        </p>
      )}
      {textMatches && textMatches.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5'>
            <Database className='size-3 text-blue-500' />
            Text matches ({textMatches.length})
          </p>
          <div className='space-y-1 max-h-36 overflow-y-auto'>
            {textMatches.map((r, i: number) => (
              <div key={i} className='rounded-md bg-background border border-border/50 p-2 space-y-0.5 text-xs'>
                <p className='font-medium truncate'>{r.description}</p>
                <p className='text-muted-foreground'>
                  {r.contractName} · {r.vendorName}
                  {r.rate != null ? ` · ₹${r.rate}${r.unit ? `/${r.unit}` : ''}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {semanticMatches && semanticMatches.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5'>
            <Search className='size-3 text-violet-500' />
            Semantic matches ({semanticMatches.length})
          </p>
          <div className='space-y-1 max-h-36 overflow-y-auto'>
            {semanticMatches.map((r, i: number) => (
              <div key={i} className='rounded-md bg-background border border-border/50 p-2 space-y-0.5 text-xs'>
                <p className='font-medium truncate'>
                  {r.contractName} · {r.vendorName}
                </p>
                <p className='text-muted-foreground line-clamp-2'>{r.content}</p>
                <div className='flex items-center gap-1.5'>
                  <div className='h-1 w-16 rounded-full bg-muted overflow-hidden'>
                    <div
                      className='h-full rounded-full bg-violet-500'
                      style={{
                        width: `${Math.round(Number(r.similarity) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className='text-[10px] text-muted-foreground/60'>
                    {(Number(r.similarity) * 100).toFixed(0)}% match
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CalculateResult({ result }: { result: Record<string, any> }) {
  if (result?.error) {
    return <p className='text-xs text-destructive'>Error: {result.error}</p>;
  }
  return (
    <div className='flex items-center gap-3 rounded-md bg-background border border-border/50 p-3'>
      <div className='flex-1 min-w-0 space-y-1'>
        <p className='text-xs text-muted-foreground font-mono truncate'>{result?.resolved ?? result?.expression}</p>
        <p className='text-lg font-semibold tabular-nums'>{result?.formatted ?? result?.result}</p>
      </div>
      <div className='flex size-10 items-center justify-center rounded-full bg-pink-500/10 shrink-0'>
        <span className='text-pink-600 font-bold text-sm'>=</span>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RunQueryResult({ result, input }: { result: Record<string, any>; input?: Record<string, any> }) {
  const rows = result?.rows as Record<string, unknown>[] | undefined;
  const count = result?.count ?? rows?.length ?? 0;
  const sql = input?.sql as string | undefined;

  if (result?.error) {
    return (
      <div className='space-y-2'>
        {sql && (
          <pre className='text-xs font-mono bg-background border border-border/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap'>
            {sql}
          </pre>
        )}
        <p className='text-xs text-destructive'>Error: {result.error}</p>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      {sql && (
        <pre className='text-xs font-mono bg-background border border-border/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground'>
          {sql}
        </pre>
      )}
      <p className='text-xs text-muted-foreground'>
        {count} row{count !== 1 ? 's' : ''} returned
      </p>
      {rows && rows.length > 0 && rows[0] != null && (
        <div className='max-h-40 overflow-auto rounded-md border border-border/50'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-muted/50 border-b'>
                {Object.keys(rows[0]).map((key) => (
                  <th key={key} className='text-left font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap'>
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row, i) => (
                <tr key={i} className='border-b border-border/30 last:border-0'>
                  {Object.values(row).map((val, j) => (
                    <td key={j} className='px-2 py-1 whitespace-nowrap max-w-[200px] truncate'>
                      {val == null ? '—' : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <p className='text-[10px] text-muted-foreground px-2 py-1'>…and {rows.length - 10} more rows</p>
          )}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ListTablesResult({ result }: { result: Record<string, any> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = result?.tables as Record<string, any>[] | undefined;
  if (!result?.found || !tables?.length) {
    return <p className='text-xs text-muted-foreground'>{result?.message ?? 'No tables found.'}</p>;
  }

  return (
    <div className='space-y-1.5'>
      <p className='text-xs text-muted-foreground'>
        {tables.length} table{tables.length !== 1 ? 's' : ''} found
      </p>
      <div className='space-y-1 max-h-48 overflow-y-auto'>
        {tables.map((t, i: number) => (
          <div key={i} className='rounded-md bg-background border border-border/50 p-2 text-xs'>
            <div className='flex items-center gap-2 mb-1'>
              <Table2 className='size-3 text-blue-500 shrink-0' />
              <span className='font-medium truncate'>{t.tableName}</span>
              <Badge variant='secondary' className='text-[10px] shrink-0 ml-auto'>
                {t.rowCount} rows
              </Badge>
            </div>
            {t.summary && <p className='text-muted-foreground line-clamp-1 ml-5'>{t.summary}</p>}
            {t.columns && (
              <div className='flex flex-wrap gap-1 mt-1.5 ml-5'>
                {(t.columns as string[]).slice(0, 6).map((col: string) => (
                  <span
                    key={col}
                    className='rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground'
                  >
                    {col}
                  </span>
                ))}
                {(t.columns as string[]).length > 6 && (
                  <span className='text-[10px] text-muted-foreground/60'>
                    +{(t.columns as string[]).length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GetTableSampleResult({ result }: { result: Record<string, any> }) {
  if (!result?.found) {
    return <p className='text-xs text-muted-foreground'>{result?.message ?? 'Table not found.'}</p>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sampleRows = result?.sampleRows as Record<string, any>[] | undefined;
  const columns = result?.exactColumns as string[] | undefined;

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2 text-xs'>
        <span className='font-medium'>{result.tableName}</span>
        <span className='text-muted-foreground'>·</span>
        <span className='text-muted-foreground'>{result.rowCount} total rows</span>
      </div>
      {columns && (
        <div className='flex flex-wrap gap-1'>
          {columns.map((col: string) => (
            <span key={col} className='rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground'>
              {col}
            </span>
          ))}
        </div>
      )}
      {sampleRows && sampleRows.length > 0 && sampleRows[0] != null && (
        <div className='max-h-40 overflow-auto rounded-md border border-border/50'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-muted/50 border-b'>
                {Object.keys(sampleRows[0]).map((key) => (
                  <th key={key} className='text-left font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap'>
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr key={i} className='border-b border-border/30 last:border-0'>
                  {Object.values(row).map((val, j) => (
                    <td key={j} className='px-2 py-1 whitespace-nowrap max-w-[150px] truncate'>
                      {val == null ? '—' : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExecuteCodeResult({ result, input }: { result: Record<string, any>; input?: Record<string, any> }) {
  const code = input?.code as string | undefined;
  const stdout = result?.stdout as string | undefined;
  const stderr = result?.stderr as string | undefined;
  const error = result?.error as string | undefined;

  return (
    <div className='space-y-2'>
      {code && (
        <details className='group/code'>
          <summary className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1'>
            <ChevronDown className='size-3 transition-transform group-open/code:rotate-180' />
            Python script
          </summary>
          <pre className='mt-1.5 text-xs font-mono bg-zinc-950 text-zinc-100 rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre-wrap'>
            {code}
          </pre>
        </details>
      )}
      {stdout && (
        <div className='rounded-md bg-zinc-950 text-zinc-100 p-3 overflow-x-auto max-h-48'>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5'>Output</p>
          <pre className='text-xs font-mono whitespace-pre-wrap'>{stdout}</pre>
        </div>
      )}
      {(stderr || error) && (
        <div className='rounded-md bg-destructive/10 p-2'>
          <pre className='text-xs font-mono text-destructive whitespace-pre-wrap'>{stderr || error}</pre>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SearchTablesResult({ result }: { result: Record<string, any>[] | Record<string, any> }) {
  const tables = Array.isArray(result) ? result : [];
  if (!tables.length) {
    return <p className='text-xs text-muted-foreground'>No matching tables found.</p>;
  }

  return (
    <div className='space-y-1.5'>
      <p className='text-xs text-muted-foreground'>
        {tables.length} table{tables.length !== 1 ? 's' : ''} matched
      </p>
      <div className='space-y-1 max-h-40 overflow-y-auto'>
        {tables.map((t, i: number) => (
          <div key={i} className='rounded-md bg-background border border-border/50 p-2 text-xs'>
            <div className='flex items-center gap-2'>
              <ScanSearch className='size-3 text-cyan-500 shrink-0' />
              <span className='font-medium truncate'>{t.tableName}</span>
              <Badge variant='secondary' className='text-[10px] shrink-0 ml-auto'>
                {t.rowCount} rows
              </Badge>
            </div>
            {t.summary && <p className='text-muted-foreground line-clamp-1 mt-0.5 ml-5'>{t.summary}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- helpers ---- */

// AI SDK 5 uses typed part names: "tool-searchContracts", "tool-listTables", etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveToolName(part: Record<string, any>): string {
  if (part.toolName) return part.toolName as string;
  const type = part.type as string;
  if (type === 'dynamic-tool') return (part.toolName as string) ?? 'unknown';
  if (type?.startsWith('tool-')) return type.slice(5);
  return 'unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isToolPart(part: Record<string, any>): boolean {
  const type = part.type as string;
  return (
    type === 'dynamic-tool' ||
    (type?.startsWith('tool-') && type !== 'tool-invocation' && type !== 'tool-call' && type !== 'tool-result') ||
    type === 'tool-invocation' ||
    type === 'tool-call' ||
    type === 'tool-result'
  );
}

/* ---- ToolCallsGroup — compact tool rendering ---- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolCallsGroup({ toolParts }: { toolParts: Record<string, any>[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (toolParts.length === 0) return null;

  const lastPart = toolParts[toolParts.length - 1]!;
  const lastToolName = resolveToolName(lastPart);
  const lastIsDone = lastPart.state === 'result' || lastPart.state === 'output-available';
  const lastMeta = TOOL_META[lastToolName] ?? DEFAULT_META;

  return (
    <div className='my-2'>
      {/* Active tool — shown prominently when last tool is still running */}
      {!lastIsDone && (
        <div className='flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 mb-2'>
          <div className={`flex size-7 items-center justify-center rounded-md ${lastMeta.bgColor} shrink-0`}>
            <Loader2 className={`size-3.5 ${lastMeta.color} animate-spin`} />
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium'>{lastMeta.activeLabel}</p>
            <ActiveToolContext toolName={lastToolName} input={lastPart.input} />
          </div>
        </div>
      )}

      {/* Completed tools — compact rows */}
      {toolParts.some((p) => p.state === 'result' || p.state === 'output-available') && (
        <div className='rounded-lg border border-border/40 overflow-hidden'>
          {toolParts.map((part, idx) => {
            const toolName = resolveToolName(part);
            const isDone = part.state === 'result' || part.state === 'output-available';
            if (!isDone) return null;

            const meta = TOOL_META[toolName] ?? DEFAULT_META;
            const Icon = meta.icon;
            const result = part.result ?? part.output;
            const input = part.input ?? part.args;
            const isOpen = expandedIdx === idx;
            const hasContent = result != null;

            return (
              <div key={part.toolInvocationId ?? part.toolCallId ?? `tool-${idx}`}>
                <button
                  type='button'
                  onClick={() => hasContent && setExpandedIdx(isOpen ? null : idx)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors border-b border-border/20 last:border-b-0 ${hasContent ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default'}`}
                >
                  <Icon className={`size-3.5 ${meta.color} shrink-0`} />
                  <span className='text-xs font-medium truncate flex-1'>{meta.label}</span>
                  <CheckCircle2 className='size-3.5 text-emerald-500 shrink-0' />
                  {hasContent && (
                    <ChevronDown
                      className={`size-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
                {isOpen && hasContent && (
                  <div className='px-3 py-2.5 bg-muted/10 border-b border-border/20'>
                    <ToolResultContent toolName={toolName} result={result} input={input} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveToolContext({ toolName, input }: { toolName: string; input?: Record<string, any> }) {
  let detail: string | null = null;
  if (toolName === 'searchContracts' && input?.query) detail = `"${input.query}"`;
  else if (toolName === 'executeCode' && input?.sessionLabel) detail = `Session: ${input.sessionLabel}`;
  else if (toolName === 'runQuery') detail = 'Executing SQL…';
  else if (toolName === 'calculate' && input?.expression) detail = input.expression;
  else if (toolName === 'listTables') detail = 'Scanning contract tables…';
  else if (toolName === 'getTableSample' && input?.tableName) detail = `Table: ${input.tableName}`;
  else if (toolName === 'searchTables' && input?.query) detail = `"${input.query}"`;

  if (!detail) return null;
  return <p className='text-[10px] text-muted-foreground mt-0.5 truncate'>{detail}</p>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolResultContent({
  toolName,
  result,
  input,
}: {
  toolName: string;
  result: Record<string, any>;
  input?: Record<string, any>;
}) {
  if (toolName === 'searchContracts') return <SearchContractsResult result={result} />;
  if (toolName === 'calculate') return <CalculateResult result={result} />;
  if (toolName === 'runQuery') return <RunQueryResult result={result} input={input} />;
  if (toolName === 'listTables') return <ListTablesResult result={result} />;
  if (toolName === 'getTableSample') return <GetTableSampleResult result={result} />;
  if (toolName === 'executeCode') return <ExecuteCodeResult result={result} input={input} />;
  if (toolName === 'searchTables') return <SearchTablesResult result={result} />;
  return (
    <pre className='text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-36'>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

/* ---- CitationsBar ---- */

interface Citation {
  contractId: string;
  contractName: string;
  vendorName: string;
  effectiveFrom?: string | null;
  matchCount: number;
}

function CitationsBar({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className='mt-3 pt-3 border-t border-border/60'>
      <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5'>
        <FileText className='size-3' />
        Sources ({citations.length})
      </p>
      <div className='flex flex-wrap gap-1.5'>
        {citations.map((c) => (
          <a
            key={c.contractId}
            href={`/contracts/${c.contractId}`}
            className='inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-primary/5 transition-colors'
          >
            <FileText className='size-3 text-muted-foreground shrink-0' />
            <span className='truncate max-w-[180px]'>{c.contractName}</span>
            <span className='text-muted-foreground shrink-0'>· {c.vendorName}</span>
            {c.matchCount > 1 && (
              <span className='ml-0.5 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary shrink-0'>
                {c.matchCount}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ---- AgentStepsTrail ---- */

const STEP_LABELS: Record<string, string> = {
  searchContracts: 'Search',
  listTables: 'Discover',
  searchTables: 'Filter',
  getTableSample: 'Sample',
  executeCode: 'Analyze',
  runQuery: 'Query',
  calculate: 'Calculate',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AgentStepsTrail({ parts }: { parts: Record<string, any>[] }) {
  const toolParts = parts.filter(isToolPart);

  const seen = new Set<string>();
  const steps: { toolName: string; isDone: boolean }[] = [];
  for (const p of toolParts) {
    const name = resolveToolName(p);
    const key = p.toolInvocationId ?? p.toolCallId ?? `${name}-${seen.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({
      toolName: name,
      isDone: p.state === 'result' || p.state === 'output-available',
    });
  }

  if (steps.length < 2) return null;

  return (
    <div className='flex items-center gap-1 flex-wrap mb-3'>
      <span className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1'>Steps</span>
      {steps.map((step, i) => {
        const meta = TOOL_META[step.toolName] ?? DEFAULT_META;
        const StepIcon = meta.icon;
        return (
          <span key={i} className='flex items-center gap-1'>
            {i > 0 && <span className='text-muted-foreground/30 mx-0.5'>&rarr;</span>}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${step.isDone ? 'bg-muted text-muted-foreground' : `${meta.bgColor} ${meta.color}`}`}
            >
              {step.isDone ? <StepIcon className='size-2.5' /> : <Loader2 className='size-2.5 animate-spin' />}
              {STEP_LABELS[step.toolName] ?? step.toolName}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ---- main page ---- */

export default function AgentPage() {
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');

  useEffect(() => {
    contractsApi
      .getAll()
      .then((data) => {
        const list = data as unknown as ContractOption[];
        setContracts(list);
        const bollore = list.find(
          (c) => c.vendor.name.toLowerCase().includes('bollore') || c.vendor.name.toLowerCase().includes('bolloré'),
        );
        if (bollore) setSelectedContractId(bollore.id);
      })
      .catch(() => {});
  }, []);

  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/agent/chat`,
      body: selectedContractId
        ? {
            contractId: selectedContractId,
            vendorId: selectedContract?.vendorId,
          }
        : {},
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleSuggestion = (s: string) => {
    sendMessage({ text: s });
  };

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      {/* Header */}
      <div className='flex items-center justify-between border-b px-6 py-4 shrink-0'>
        <div className='flex items-center gap-3'>
          <div className='flex size-9 items-center justify-center rounded-lg bg-primary/10'>
            <Sparkles className='size-4 text-primary' />
          </div>
          <div>
            <h1 className='font-semibold'>Contract Catalog Agent</h1>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <select
              value={selectedContractId}
              onChange={(e) => {
                setSelectedContractId(e.target.value);
                setMessages([]);
              }}
              className='appearance-none h-8 rounded-md border bg-background pl-3 pr-8 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer'
            >
              <option value=''>All contracts</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.vendor?.name ?? 'Unassigned'} — {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground' />
          </div>

          {selectedContract && (
            <Badge variant='outline' className='text-xs gap-1 hidden sm:flex'>
              <span className='size-1.5 rounded-full bg-blue-500' />
              {selectedContract.vendor.name}
            </Badge>
          )}

          {messages.length > 0 && (
            <Button variant='ghost' size='sm' onClick={() => setMessages([])} className='text-muted-foreground'>
              <RotateCcw className='size-3.5' />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      {messages.length === 0 ? (
        <div className='flex-1 overflow-y-auto'>
          <EmptyState onSuggestion={handleSuggestion} />
        </div>
      ) : (
        <Conversation className='flex-1 px-4'>
          <ConversationContent className='mx-auto max-w-3xl'>
            {messages.map((m, msgIdx) => {
              const isUser = m.role === 'user';
              const isLastAssistant = !isUser && msgIdx === messages.length - 1;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const parts = (m.parts as Record<string, any>[]) ?? [];

              const toolParts = parts.filter(isToolPart);

              const citations: Citation[] = (() => {
                if (isUser) return [];
                const citationMap = new Map<string, Citation>();
                for (const part of toolParts) {
                  if (resolveToolName(part) === 'searchContracts') {
                    const result = part.result ?? part.output;
                    const incoming: Citation[] = result?.citations ?? [];
                    for (const c of incoming) {
                      const existing = citationMap.get(c.contractId);
                      if (existing) {
                        existing.matchCount = Math.max(existing.matchCount, c.matchCount);
                      } else {
                        citationMap.set(c.contractId, { ...c });
                      }
                    }
                  }
                }
                return Array.from(citationMap.values()).sort((a, b) => b.matchCount - a.matchCount);
              })();

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type RenderItem =
                | { kind: 'text'; part: Record<string, any>; idx: number }
                | { kind: 'tools'; parts: Record<string, any>[] };
              const renderItems: RenderItem[] = [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let pendingTools: Record<string, any>[] = [];
              for (let idx = 0; idx < parts.length; idx++) {
                const part = parts[idx]!;
                if (isToolPart(part)) {
                  pendingTools.push(part);
                } else {
                  if (pendingTools.length) {
                    renderItems.push({ kind: 'tools', parts: pendingTools });
                    pendingTools = [];
                  }
                  renderItems.push({ kind: 'text', part, idx });
                }
              }
              if (pendingTools.length) {
                renderItems.push({ kind: 'tools', parts: pendingTools });
              }

              return (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {!isUser && <AgentStepsTrail parts={parts} />}

                    {renderItems.map((item, renderIdx) => {
                      if (item.kind === 'tools') {
                        return <ToolCallsGroup key={`tools-${renderIdx}`} toolParts={item.parts} />;
                      }
                      const { part, idx } = item;
                      const partKey: string = part.toolInvocationId ?? part.toolCallId ?? `${part.type}-${idx}`;

                      if (part.type === 'text') {
                        if (isUser) {
                          return (
                            <p key={partKey} className='text-sm whitespace-pre-wrap'>
                              {part.text}
                            </p>
                          );
                        }
                        return (
                          <MessageResponse key={partKey} isAnimating={isLastAssistant && isLoading}>
                            {part.text}
                          </MessageResponse>
                        );
                      }

                      return null;
                    })}
                    {!isUser && <CitationsBar citations={citations} />}
                  </MessageContent>
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Prompt input */}
      <div className='shrink-0 border-t bg-background px-6 py-4'>
        <div className='mx-auto max-w-3xl'>
          <PromptInput
            onSubmit={({ text }) => {
              if (!text.trim() || isLoading) return;
              sendMessage({ text });
            }}
          >
            <PromptInputTextarea
              placeholder='Ask about contract terms, rates, or invoice charges…'
              disabled={isLoading}
            />
            <PromptInputFooter>
              <PromptInputTools>
                <p className='text-xs text-muted-foreground'>Enter to send · Shift+Enter for new line</p>
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

/* ---- empty state ---- */

// const CAPABILITIES = [
//   { icon: Search, label: 'Semantic search', color: 'text-violet-600' },
//   { icon: Database, label: 'SQL queries', color: 'text-orange-600' },
//   { icon: Table2, label: 'Table discovery', color: 'text-blue-600' },
//   { icon: Code2, label: 'Python analysis', color: 'text-emerald-600' },
//   { icon: Calculator, label: 'Rate calculations', color: 'text-pink-600' },
// ];

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className='mx-auto flex max-w-2xl flex-col items-center gap-8 py-12 px-4'>
      <div className='flex flex-col items-center gap-3 text-center'>
        <div className='flex size-16 items-center justify-center rounded-2xl bg-primary/10'>
          <Sparkles className='size-8 text-primary' />
        </div>
        <h2 className='text-xl font-semibold'>Contract Catalog Agent</h2>
        <p className='text-sm text-muted-foreground max-w-sm'>I query your live contract database, calculate rates.</p>
        {/* <div className="flex flex-wrap justify-center gap-2 mt-1">
          {CAPABILITIES.map(({ icon: CapIcon, label, color }) => (
            <span key={label} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <CapIcon className={`size-3 ${color}`} />
              {label}
            </span>
          ))}
        </div> */}
      </div>

      <div className='w-full'>
        <p className='mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center'>
          Try asking
        </p>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className='rounded-lg border bg-card px-4 py-3 text-left text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-colors'
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
