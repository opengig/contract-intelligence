'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetContract, useUpdateTerm, useActivateContract, useReprocessContract } from '@/services/contracts/hooks';
import type { ContractTerm, ContractTermStatus } from '@repo/types';

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: contract, isLoading } = useGetContract(id);
  const { mutate: updateTerm } = useUpdateTerm(id);
  const { mutate: activate, isPending: activating } = useActivateContract(id);
  const { mutate: reprocess, isPending: reprocessing } = useReprocessContract(id);

  const terms = contract?.terms ?? [];
  const pending = terms.filter((t) => t.status === 'pending').length;
  const needsReview = terms.filter((t) => t.status === 'review').length;
  const approved = terms.filter((t) => t.status === 'approved').length;

  if (isLoading) {
    return (
      <div className='p-8 space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-96 w-full' />
      </div>
    );
  }

  if (!contract) return null;

  const isProcessing = contract.status === 'parsing';

  return (
    <div className='p-8 space-y-6'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon-sm' asChild>
          <Link href='/contracts'>
            <ArrowLeft className='size-4' />
          </Link>
        </Button>
        <div className='flex-1'>
          <h1 className='text-2xl font-bold'>{contract.name}</h1>
          <p className='text-muted-foreground text-sm'>
            {(contract as any).vendor?.name} · {contract.type.replace('_', ' ')}
            {contract.effectiveFrom && ` · Effective ${new Date(contract.effectiveFrom).toLocaleDateString('en-IN')}`}
          </p>
        </div>
        {contract.status === 'review' && (
          <Button onClick={() => activate()} disabled={activating}>
            {activating ? (
              <>
                <Loader2 className='size-4 animate-spin' /> Activating...
              </>
            ) : (
              <>
                <CheckCircle2 className='size-4' /> Approve & Activate
              </>
            )}
          </Button>
        )}
        <Button variant='outline' onClick={() => reprocess()} disabled={reprocessing}>
          {reprocessing ? (
            <>
              <Loader2 className='size-4 animate-spin' /> Reprocessing...
            </>
          ) : (
            <>
              <RotateCcw className='size-4' /> Reprocess
            </>
          )}
        </Button>
      </div>

      {/* Metadata card */}
      {(contract as any).metadata && (
        <MetadataCard metadata={(contract as any).metadata} summary={(contract as any).summary} />
      )}

      {/* Status summary */}
      {!isProcessing && terms.length > 0 && (
        <div className='flex gap-4 rounded-lg border bg-muted/30 p-4'>
          <div className='text-center'>
            <p className='text-2xl font-bold'>{terms.length}</p>
            <p className='text-xs text-muted-foreground'>Total Terms</p>
          </div>
          <div className='w-px bg-border' />
          <div className='text-center'>
            <p className='text-2xl font-bold text-emerald-600'>{approved}</p>
            <p className='text-xs text-muted-foreground'>Approved</p>
          </div>
          <div className='w-px bg-border' />
          <div className='text-center'>
            <p className='text-2xl font-bold text-amber-600'>{needsReview}</p>
            <p className='text-xs text-muted-foreground'>Needs Review</p>
          </div>
          <div className='w-px bg-border' />
          <div className='text-center'>
            <p className='text-2xl font-bold'>{pending}</p>
            <p className='text-xs text-muted-foreground'>Pending</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Extracted Terms</CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          {isProcessing ? (
            <div className='flex flex-col items-center gap-3 py-16'>
              <Loader2 className='size-8 animate-spin text-muted-foreground' />
              <p className='text-muted-foreground'>AI is extracting contract terms…</p>
              <p className='text-xs text-muted-foreground'>This may take 30–60 seconds</p>
            </div>
          ) : terms.length === 0 ? (
            <p className='px-6 py-8 text-center text-sm text-muted-foreground'>No terms extracted yet.</p>
          ) : (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b text-left text-muted-foreground'>
                  <th className='px-6 py-3 font-medium'>Term</th>
                  <th className='px-6 py-3 font-medium'>Value</th>
                  <th className='px-6 py-3 font-medium'>Confidence</th>
                  <th className='px-6 py-3 font-medium'>Source</th>
                  <th className='px-6 py-3 font-medium'>Status</th>
                  <th className='px-6 py-3 font-medium'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <TermRow
                    key={term.id}
                    term={term}
                    onUpdate={(status) => updateTerm({ termId: term.id, payload: { status } })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TermRow({ term, onUpdate }: { term: ContractTerm; onUpdate: (status: ContractTermStatus) => void }) {
  const valueText = term.rate
    ? `₹${term.rate.toLocaleString('en-IN')}${term.unit ? ' / ' + term.unit : ''}`
    : (term.formula ?? '—');

  return (
    <tr className='border-b last:border-0 hover:bg-muted/20'>
      <td className='px-6 py-3'>
        <p className='font-medium'>{term.description}</p>
        {term.route && <p className='text-xs text-muted-foreground'>{term.route}</p>}
      </td>
      <td className='px-6 py-3 font-mono text-sm'>{valueText}</td>
      <td className='px-6 py-3'>
        <ConfidenceBadge confidence={term.confidence} />
      </td>
      <td className='px-6 py-3 text-xs text-muted-foreground'>{term.source ?? '—'}</td>
      <td className='px-6 py-3'>
        <TermStatusBadge status={term.status} />
      </td>
      <td className='px-6 py-3'>
        <div className='flex gap-1'>
          {term.status !== 'approved' && (
            <button
              onClick={() => onUpdate('approved')}
              className='rounded p-1 text-emerald-600 hover:bg-emerald-50'
              title='Approve'
            >
              <CheckCircle2 className='size-4' />
            </button>
          )}
          {term.status !== 'review' && (
            <button
              onClick={() => onUpdate('review')}
              className='rounded p-1 text-amber-600 hover:bg-amber-50'
              title='Flag for review'
            >
              <Clock className='size-4' />
            </button>
          )}
          {term.status !== 'rejected' && (
            <button
              onClick={() => onUpdate('rejected')}
              className='rounded p-1 text-destructive hover:bg-destructive/10'
              title='Reject'
            >
              <XCircle className='size-4' />
            </button>
          )}
          {term.status !== 'pending' && (
            <button
              onClick={() => onUpdate('pending')}
              className='rounded p-1 text-muted-foreground hover:bg-muted'
              title='Reset'
            >
              <RotateCcw className='size-3.5' />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (pct >= 90) return <Badge variant='success'>{pct}%</Badge>;
  if (pct >= 75) return <Badge variant='warning'>{pct}%</Badge>;
  return <Badge variant='destructive'>{pct}%</Badge>;
}

function TermStatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge variant='success'>Approved</Badge>;
  if (status === 'review') return <Badge variant='warning'>Review</Badge>;
  if (status === 'rejected') return <Badge variant='destructive'>Rejected</Badge>;
  return <Badge variant='secondary'>Pending</Badge>;
}

interface ContractMetadata {
  carrierName?: string | null;
  carrierScac?: string | null;
  mode?: string | null;
  shipper?: string | null;
  startDate?: string | null;
  expirationDate?: string | null;
  currency?: string | null;
  divisions?: string[] | null;
  originRegions?: string[] | null;
  destRegions?: string[] | null;
  rateType?: string | null;
  laneCount?: number | null;
  keyTerms?: string[] | null;
}

function MetadataCard({ metadata, summary }: { metadata: ContractMetadata; summary?: string | null }) {
  const fields: { label: string; value: string | null | undefined }[] = [
    { label: 'Carrier', value: metadata.carrierName },
    { label: 'SCAC', value: metadata.carrierScac },
    { label: 'Mode', value: metadata.mode?.toUpperCase() },
    { label: 'Shipper', value: metadata.shipper },
    {
      label: 'Start Date',
      value: metadata.startDate ? new Date(metadata.startDate).toLocaleDateString('en-US') : null,
    },
    {
      label: 'Expiration',
      value: metadata.expirationDate ? new Date(metadata.expirationDate).toLocaleDateString('en-US') : null,
    },
    { label: 'Currency', value: metadata.currency },
    { label: 'Rate Type', value: metadata.rateType?.replace('_', ' ') },
    { label: 'Lanes', value: metadata.laneCount?.toString() },
  ];

  const filledFields = fields.filter((f) => f.value);

  if (filledFields.length === 0 && !summary) return null;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>Contract Metadata</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {summary && <p className='text-sm text-muted-foreground italic'>{summary}</p>}

        {filledFields.length > 0 && (
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
            {filledFields.map(({ label, value }) => (
              <div key={label}>
                <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>{label}</p>
                <p className='text-sm font-medium'>{value}</p>
              </div>
            ))}
          </div>
        )}

        {metadata.originRegions && metadata.originRegions.length > 0 && (
          <div>
            <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>
              Origin Regions
            </p>
            <div className='flex flex-wrap gap-1'>
              {metadata.originRegions.map((r) => (
                <Badge key={r} variant='secondary' className='text-xs'>
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {metadata.destRegions && metadata.destRegions.length > 0 && (
          <div>
            <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>
              Destination Regions
            </p>
            <div className='flex flex-wrap gap-1'>
              {metadata.destRegions.map((r) => (
                <Badge key={r} variant='secondary' className='text-xs'>
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {metadata.divisions && metadata.divisions.length > 0 && (
          <div>
            <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Divisions</p>
            <div className='flex flex-wrap gap-1'>
              {metadata.divisions.map((d) => (
                <Badge key={d} variant='outline' className='text-xs'>
                  {d}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {metadata.keyTerms && metadata.keyTerms.length > 0 && (
          <div>
            <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Key Terms</p>
            <div className='flex flex-wrap gap-1'>
              {metadata.keyTerms.map((t) => (
                <Badge key={t} variant='outline' className='text-xs'>
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
