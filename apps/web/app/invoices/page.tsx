'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetInvoices, useGetInvoice } from '@/services/invoices/hooks';
import type { AuditLineStatus } from '@repo/types';

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function AuditStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <Badge variant="secondary">Pending</Badge>;
  if (status === 'ok') return <Badge variant="success">OK</Badge>;
  if (status === 'overcharge') return <Badge variant="destructive">Overcharge</Badge>;
  return <Badge variant="warning">Review</Badge>;
}

function LineResultBadge({ result }: { result: AuditLineStatus }) {
  if (result === 'ok') return <Badge variant="success">OK</Badge>;
  if (result === 'overcharge') return <Badge variant="destructive">Overcharge</Badge>;
  if (result === 'variance') return <Badge variant="warning">Variance</Badge>;
  return <Badge variant="secondary">Review</Badge>;
}

function resultSummary(lineResults: any[]) {
  if (!lineResults?.length) return '—';
  const overcharges = lineResults.filter((l) => l.result === 'overcharge').length;
  const variances = lineResults.filter((l) => l.result === 'variance').length;
  const ok = lineResults.filter((l) => l.result === 'ok').length;
  const parts: string[] = [];
  if (overcharges) parts.push(`${overcharges} overcharge${overcharges > 1 ? 's' : ''}`);
  if (variances) parts.push(`${variances} variance${variances > 1 ? 's' : ''}`);
  if (ok) parts.push(`${ok} OK`);
  return parts.join(', ');
}

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useGetInvoices();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invoice Audit</h1>
            <p className="text-muted-foreground mt-1">
              Upload and audit vendor invoices against contract terms
            </p>
          </div>
          <Button asChild>
            <Link href="/invoices/upload">
              <Plus className="size-4" />
              Upload Invoice
            </Link>
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (invoices?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <FileText className="size-10 text-muted-foreground/40" />
                <p className="text-muted-foreground">No invoices uploaded yet.</p>
                <Button asChild size="sm">
                  <Link href="/invoices/upload">Upload your first invoice</Link>
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Invoice No</th>
                    <th className="px-6 py-3 font-medium">Vendor</th>
                    <th className="px-6 py-3 font-medium">Invoice Total</th>
                    <th className="px-6 py-3 font-medium">Expected Total</th>
                    <th className="px-6 py-3 font-medium">Variance</th>
                    <th className="px-6 py-3 font-medium">Result</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices?.map((inv) => {
                    const audit = (inv as any).auditResult;
                    const lines = audit?.lineResults ?? [];
                    const isSelected = selectedId === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        className={`border-b last:border-0 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary/5'
                            : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setSelectedId(isSelected ? null : inv.id)}
                      >
                        <td className="px-6 py-3 font-mono font-medium">
                          {inv.invoiceNo}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {(inv as any).vendor?.name ?? '—'}
                        </td>
                        <td className="px-6 py-3">
                          {audit ? formatCurrency(audit.invoiceTotal) : '—'}
                        </td>
                        <td className="px-6 py-3 text-emerald-700">
                          {audit ? formatCurrency(audit.expectedTotal) : '—'}
                        </td>
                        <td
                          className={`px-6 py-3 font-medium ${
                            audit?.variance > 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {audit
                            ? audit.variance > 0
                              ? `+${formatCurrency(audit.variance)}`
                              : formatCurrency(Math.abs(audit.variance))
                            : '—'}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground text-xs">
                          {resultSummary(lines)}
                        </td>
                        <td className="px-6 py-3">
                          <AuditStatusBadge status={audit?.status} />
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice sidesheet */}
      {selectedId && (
        <InvoiceSidesheet
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function InvoiceSidesheet({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const { data: invoice, isLoading } = useGetInvoice(invoiceId);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);

  const audit = invoice?.auditResult;
  const lines = audit?.lineResults ?? [];

  return (
    <div className="w-lg border-l bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 flex items-center justify-between border-b bg-background px-5 py-4">
        <div className="flex-1 min-w-0 mr-3">
          {isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <>
              <p className="font-semibold font-mono truncate">
                {invoice?.invoiceNo}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {(invoice as any)?.vendor?.name}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {invoice && (
            <Button variant="ghost" size="icon-sm" asChild title="Open full report">
              <Link href={`/invoices/${invoiceId}`} target="_blank">
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !invoice ? null : (
          <>
            {/* Audit summary */}
            {audit ? (
              <div className="grid grid-cols-3 divide-x border-b">
                <SummaryCell
                  label="Invoice Total"
                  value={formatCurrency(audit.invoiceTotal)}
                />
                <SummaryCell
                  label="Expected Total"
                  value={formatCurrency(audit.expectedTotal)}
                  valueClass="text-emerald-700"
                />
                <SummaryCell
                  label="Variance"
                  value={
                    audit.variance > 0
                      ? `+${formatCurrency(audit.variance)}`
                      : formatCurrency(Math.abs(audit.variance))
                  }
                  valueClass={audit.variance > 0 ? 'text-destructive' : 'text-muted-foreground'}
                />
              </div>
            ) : invoice.status === 'processing' ? (
              <div className="flex flex-col items-center gap-2 py-12">
                <Loader2 className="size-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Audit in progress…</p>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-center text-muted-foreground">
                No audit results yet.
              </p>
            )}

            {/* Status + file */}
            {audit && (
              <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <AuditStatusBadge status={audit.status} />
                </div>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-48">
                  {invoice.fileName}
                </span>
              </div>
            )}

            {/* Line items */}
            {lines.length > 0 && (
              <div>
                <p className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/10">
                  Line-by-line breakdown
                </p>
                <div className="divide-y">
                  {lines.map((line: any) => {
                    const isExpanded = expandedLine === line.id;
                    const hasVariance = line.result !== 'ok';
                    return (
                      <div key={line.id}>
                        <div
                          className={`px-5 py-3 ${
                            hasVariance ? 'cursor-pointer hover:bg-muted/20' : ''
                          }`}
                          onClick={() =>
                            hasVariance &&
                            setExpandedLine(isExpanded ? null : line.id)
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {hasVariance ? (
                                isExpanded ? (
                                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                                )
                              ) : (
                                <span className="size-3.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-tight truncate">
                                  {line.invoiceLine?.description ??
                                    line.invoiceLine?.chargeType}
                                </p>
                              </div>
                            </div>
                            <LineResultBadge result={line.result} />
                          </div>
                          <div className="flex items-center gap-4 mt-1 ml-5 text-xs text-muted-foreground">
                            <span>
                              Invoiced:{' '}
                              <span className="font-medium text-foreground">
                                {formatCurrency(line.invoiceLine?.invoicedAmount)}
                              </span>
                            </span>
                            <span>
                              Expected:{' '}
                              <span className="font-medium text-emerald-700">
                                {formatCurrency(line.expectedAmount)}
                              </span>
                            </span>
                            {line.variance !== 0 && (
                              <span className={line.variance > 0 ? 'text-destructive font-medium' : ''}>
                                {line.variance > 0 ? '+' : ''}
                                {formatCurrency(line.variance)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline evidence */}
                        {isExpanded && line.evidence && (
                          <EvidencePanel evidence={line.evidence} explanation={line.explanation} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {invoice && (
        <div className="border-t px-5 py-3 flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/invoices/${invoiceId}`}>
              <ExternalLink className="size-3.5" />
              View Full Report
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function EvidencePanel({
  evidence,
  explanation,
}: {
  evidence: unknown;
  explanation?: string;
}) {
  let ev: { invoiceSays?: string; contractSays?: string; source?: string } = {};
  try {
    ev = typeof evidence === 'string' ? JSON.parse(evidence) : (evidence as any) ?? {};
  } catch {
    ev = {};
  }
  return (
    <div className="mx-5 mb-3 rounded-md border bg-muted/30 p-3 text-xs space-y-2">
      {ev.invoiceSays && <EvidenceRow label="Invoice says" value={ev.invoiceSays} />}
      {ev.contractSays && <EvidenceRow label="Contract says" value={ev.contractSays} />}
      {ev.source && (
        <EvidenceRow label="Source" value={ev.source} valueClass="text-muted-foreground" />
      )}
      {explanation && (
        <div className="pt-1 border-t text-muted-foreground italic">{explanation}</div>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  valueClass = 'text-foreground',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p className={`text-base font-bold ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  valueClass = 'text-foreground',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground w-24">{label}:</span>
      <span className={`flex-1 ${valueClass}`}>{value}</span>
    </div>
  );
}
