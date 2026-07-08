'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  X,
  FileText,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetInvoice } from '@/services/invoices/hooks';
import type { AuditLineResult, AuditEvidence } from '@repo/types';

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: invoice, isLoading } = useGetInvoice(id);
  const [selectedLine, setSelectedLine] = useState<AuditLineResult | null>(null);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) return null;

  const audit = (invoice as any).auditResult;
  const isProcessing = invoice.status === 'processing';

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/invoices"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{invoice.invoiceNo}</h1>
            <p className="text-muted-foreground text-sm">
              {(invoice as any).vendor?.name} · {invoice.fileName}
            </p>
          </div>
          {audit && <AuditStatusBadge status={audit.status} />}
        </div>

        {/* Summary card */}
        {isProcessing ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Running audit…</p>
              <p className="text-xs text-muted-foreground">
                Matching invoice lines to contract terms
              </p>
            </CardContent>
          </Card>
        ) : audit ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <SummaryCard
                label="Invoice Total"
                value={formatCurrency(audit.invoiceTotal)}
              />
              <SummaryCard
                label="Expected Total"
                value={formatCurrency(audit.expectedTotal)}
                sub="per contract"
              />
              <SummaryCard
                label="Variance"
                value={formatCurrency(audit.variance)}
                highlight={audit.variance > 0}
                sub={audit.variance > 0 ? 'Overcharge' : audit.variance < 0 ? 'Undercharge' : 'None'}
              />
            </div>

            {/* Line-level table */}
            <Card>
              <CardHeader>
                <CardTitle>Audit Line Items</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Click a row with a variance to see evidence
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-6 py-3 font-medium">Charge</th>
                      <th className="px-6 py-3 font-medium text-right">Invoiced</th>
                      <th className="px-6 py-3 font-medium text-right">Expected</th>
                      <th className="px-6 py-3 font-medium text-right">Variance</th>
                      <th className="px-6 py-3 font-medium">Result</th>
                      <th className="px-6 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.lineResults.map((line: AuditLineResult) => (
                      <tr
                        key={line.id}
                        className={`border-b last:border-0 transition-colors ${
                          line.result !== 'ok'
                            ? 'cursor-pointer hover:bg-muted/30'
                            : ''
                        } ${selectedLine?.id === line.id ? 'bg-primary/5' : ''}`}
                        onClick={() =>
                          line.result !== 'ok' &&
                          setSelectedLine(
                            selectedLine?.id === line.id ? null : line,
                          )
                        }
                      >
                        <td className="px-6 py-3">
                          <p className="font-medium">{line.description}</p>
                        </td>
                        <td className="px-6 py-3 text-right font-mono">
                          {formatCurrency(line.invoicedAmount)}
                        </td>
                        <td className="px-6 py-3 text-right font-mono">
                          {formatCurrency(line.expectedAmount)}
                        </td>
                        <td className={`px-6 py-3 text-right font-mono font-medium ${
                          line.variance > 0 ? 'text-destructive' : line.variance < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                        }`}>
                          {line.variance !== 0
                            ? `${line.variance > 0 ? '+' : ''}${formatCurrency(line.variance)}`
                            : '—'}
                        </td>
                        <td className="px-6 py-3">
                          <LineResultBadge result={line.result} />
                        </td>
                        <td className="px-6 py-3">
                          {line.result !== 'ok' && (
                            <ChevronRight className={`size-4 text-muted-foreground transition-transform ${
                              selectedLine?.id === line.id ? 'rotate-90' : ''
                            }`} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No audit result available.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Evidence panel */}
      {selectedLine && (
        <EvidencePanel
          line={selectedLine}
          onClose={() => setSelectedLine(null)}
        />
      )}
    </div>
  );
}

function EvidencePanel({
  line,
  onClose,
}: {
  line: AuditLineResult;
  onClose: () => void;
}) {
  let evidence: AuditEvidence | null = null;
  try {
    evidence =
      typeof line.evidence === 'string'
        ? JSON.parse(line.evidence)
        : (line.evidence as AuditEvidence);
  } catch {
    evidence = null;
  }

  return (
    <div className="w-96 border-l bg-background overflow-auto">
      <div className="sticky top-0 flex items-center justify-between border-b bg-background px-6 py-4">
        <h3 className="font-semibold">Evidence</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="p-6 space-y-6">
        {/* Line summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Charge
          </p>
          <p className="font-medium">{line.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <LineResultBadge result={line.result} />
            <span className={`text-sm font-medium ${line.variance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {line.variance > 0 ? 'Overcharged by' : 'Undercharged by'}{' '}
              {formatCurrency(Math.abs(line.variance))}
            </span>
          </div>
        </div>

        {/* Invoice says */}
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="size-4 text-destructive" />
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              Invoice Says
            </p>
          </div>
          <p className="text-sm font-medium">
            {evidence?.invoiceSays ?? `Amount charged: ${formatCurrency(line.invoicedAmount)}`}
          </p>
        </div>

        {/* Contract says */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="size-4 text-emerald-700 dark:text-emerald-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Contract Says
            </p>
          </div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            {evidence?.contractSays ?? `Expected amount: ${formatCurrency(line.expectedAmount)}`}
          </p>
        </div>

        {/* Source */}
        {evidence?.source && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Source
            </p>
            <p className="text-sm">{evidence.source}</p>
          </div>
        )}

        {/* Explanation */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Explanation
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {line.explanation}
          </p>
        </div>

        {/* Numbers comparison */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoiced</span>
            <span className="font-mono font-medium">{formatCurrency(line.invoicedAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expected</span>
            <span className="font-mono font-medium text-emerald-600">{formatCurrency(line.expectedAmount)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between text-sm font-semibold">
            <span>Variance</span>
            <span className={`font-mono ${line.variance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {line.variance > 0 ? '+' : ''}{formatCurrency(line.variance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-destructive/40' : ''}>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-destructive' : ''}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  if (status === 'overcharge')
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
        <AlertTriangle className="size-4 text-destructive" />
        <span className="text-sm font-semibold text-destructive">
          Overcharge Detected
        </span>
      </div>
    );
  if (status === 'ok')
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <CheckCircle2 className="size-4 text-emerald-700" />
        <span className="text-sm font-semibold text-emerald-700">
          Invoice Verified
        </span>
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <Clock className="size-4 text-amber-700" />
      <span className="text-sm font-semibold text-amber-700">Needs Review</span>
    </div>
  );
}

function LineResultBadge({ result }: { result: string }) {
  if (result === 'ok') return <Badge variant="success">OK</Badge>;
  if (result === 'overcharge') return <Badge variant="destructive">Overcharge</Badge>;
  if (result === 'variance') return <Badge variant="warning">Variance</Badge>;
  return <Badge variant="outline">Review</Badge>;
}
