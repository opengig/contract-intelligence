'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  Eye,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  ExternalLink,
  Loader2,
  Pencil,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useGetContracts,
  useGetContract,
  useDeleteContract,
  useUpdateTerm,
  useUpdateContract,
  useActivateContract,
  useReprocessContract,
} from '@/services/contracts/hooks';
import { useGetVendors, useCreateVendor } from '@/services/vendors/hooks';
import { useGetClients, useCreateClient } from '@/services/clients/hooks';
import type { Contract, ContractTerm, ContractTermStatus } from '@repo/types';

const NO_REPROCESS_PERMISSION_MSG = "You don't have permission to reprocess contracts";

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function ContractStatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge variant='success'>Active</Badge>;
  if (status === 'review') return <Badge variant='warning'>Needs Review</Badge>;
  if (status === 'error') return <Badge variant='destructive'>Error</Badge>;
  return <Badge variant='secondary'>Processing</Badge>;
}

export default function ContractsPage() {
  const { data: contracts, isLoading } = useGetContracts();
  const { mutate: deleteContract, isPending: deleting } = useDeleteContract();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteContract(id, {
      onSuccess: () => {
        setConfirmDeleteId(null);
        if (selectedId === id) setSelectedId(null);
      },
    });
  };

  return (
    <div className='flex h-full'>
      {/* Main content */}
      <div className='flex-1 min-w-0 overflow-auto p-8 space-y-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold'>Contract Catalog</h1>
            <p className='text-muted-foreground mt-1'>Manage vendor contracts and extracted commercial terms</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button disabled className='pointer-events-none opacity-50'>
                    <Plus className='size-4' />
                    Upload Contract
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>You don&apos;t have permission to upload</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Card className='overflow-hidden'>
          <CardContent className='p-0 overflow-x-auto'>
            {isLoading ? (
              <div className='p-6 space-y-3'>
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className='h-12 w-full' />
                ))}
              </div>
            ) : (contracts?.length ?? 0) === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 gap-3'>
                <FileText className='size-10 text-muted-foreground/40' />
                <p className='text-muted-foreground'>No contracts uploaded yet.</p>
                <Button size='sm' asChild>
                  <Link href='/contracts/upload'>Upload your first contract</Link>
                </Button>
              </div>
            ) : (
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='px-6 py-3 font-medium'>Vendor</th>
                    <th className='px-6 py-3 font-medium'>Client</th>
                    <th className='px-6 py-3 font-medium'>Contract Name</th>
                    <th className='px-6 py-3 font-medium'>Type</th>
                    <th className='px-6 py-3 font-medium'>Status</th>
                    <th className='px-6 py-3 font-medium'>Terms</th>
                    <th className='px-6 py-3 font-medium'>Effective</th>
                    <th className='px-6 py-3 font-medium w-20'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts?.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b last:border-0 transition-colors ${
                        selectedId === c.id ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className='px-6 py-3 text-muted-foreground'>{(c as any).vendor?.name ?? '—'}</td>
                      <td className='px-6 py-3 text-muted-foreground'>{(c as any).client?.name ?? '—'}</td>
                      <td className='px-6 py-3 font-medium'>{c.name}</td>
                      <td className='px-6 py-3 capitalize text-muted-foreground'>{c.type.replace('_', ' ')}</td>
                      <td className='px-6 py-3'>
                        <ContractStatusBadge status={c.status} />
                      </td>
                      <td className='px-6 py-3 text-muted-foreground'>{(c as any)._count?.terms ?? 0}</td>
                      <td className='px-6 py-3 text-muted-foreground'>
                        {c.effectiveFrom ? new Date(c.effectiveFrom).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className='px-6 py-3'>
                        <div className='flex items-center gap-1'>
                          <button
                            onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                            className={`rounded p-1.5 transition-colors ${
                              selectedId === c.id
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                            title='View details'
                          >
                            <Eye className='size-3.5' />
                          </button>
                          <ReprocessButton contractId={c.id} />
                          {confirmDeleteId === c.id ? (
                            <div className='flex items-center gap-1'>
                              <button
                                onClick={() => handleDelete(c.id)}
                                disabled={deleting}
                                className='rounded px-2 py-1 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/80'
                              >
                                {deleting ? '...' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className='rounded px-2 py-1 text-xs border hover:bg-muted'
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(c.id)}
                              className='rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors'
                              title='Delete'
                            >
                              <Trash2 className='size-3.5' />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contract sidesheet */}
      {selectedId && (
        <ContractSidesheet
          contractId={selectedId}
          onClose={() => setSelectedId(null)}
          onDelete={(id) => setConfirmDeleteId(id)}
        />
      )}
    </div>
  );
}

function ReprocessButton({ contractId: _contractId }: { contractId: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <button disabled className='rounded p-1.5 text-muted-foreground/40 transition-colors cursor-not-allowed'>
              <RotateCcw className='size-3.5' />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{NO_REPROCESS_PERMISSION_MSG}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ContractSidesheet({
  contractId,
  onClose,
  onDelete,
}: {
  contractId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { data: contract, isLoading } = useGetContract(contractId);
  const { mutate: updateTerm } = useUpdateTerm(contractId);
  const { mutate: updateContract } = useUpdateContract(contractId);
  const { mutate: activate, isPending: activating } = useActivateContract(contractId);

  const terms = contract?.terms ?? [];
  const approved = terms.filter((t) => t.status === 'approved').length;
  const needsReview = terms.filter((t) => t.status === 'review').length;

  return (
    <div className='w-120 border-l bg-background flex flex-col overflow-hidden'>
      {/* Header */}
      <div className='sticky top-0 flex items-center justify-between border-b bg-background px-5 py-4'>
        <div className='flex-1 min-w-0 mr-3'>
          {isLoading ? (
            <Skeleton className='h-5 w-40' />
          ) : (
            <>
              <p className='font-semibold truncate'>{contract?.name}</p>
              <div className='flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5'>
                <EditableEntity
                  label='Vendor'
                  currentId={(contract as any)?.vendor?.id}
                  currentName={(contract as any)?.vendor?.name}
                  useGetAll={useGetVendors}
                  useCreate={useCreateVendor}
                  onSave={(vendorId) => updateContract({ vendorId })}
                />
                <span>·</span>
                <EditableEntity
                  label='Client'
                  currentId={(contract as any)?.client?.id}
                  currentName={(contract as any)?.client?.name}
                  useGetAll={useGetClients}
                  useCreate={useCreateClient}
                  onSave={(clientId) => updateContract({ clientId })}
                />
              </div>
            </>
          )}
        </div>
        <div className='flex items-center gap-1.5'>
          {contract && (
            <Button variant='ghost' size='icon-sm' asChild title='Open full page'>
              <Link href={`/contracts/${contractId}`} target='_blank'>
                <ExternalLink className='size-3.5' />
              </Link>
            </Button>
          )}
          <Button variant='ghost' size='icon-sm' onClick={onClose}>
            <X className='size-4' />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className='flex-1 overflow-auto'>
        {isLoading ? (
          <div className='p-5 space-y-3'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-32 w-full' />
            <Skeleton className='h-48 w-full' />
          </div>
        ) : !contract ? null : (
          <>
            {/* Meta info */}
            <div className='grid grid-cols-2 gap-3 p-5 border-b'>
              <MetaItem label='Status'>
                {contract.status === 'active' ? (
                  <Badge variant='success'>Active</Badge>
                ) : contract.status === 'review' ? (
                  <Badge variant='warning'>Needs Review</Badge>
                ) : contract.status === 'error' ? (
                  <Badge variant='destructive'>Error</Badge>
                ) : (
                  <Badge variant='secondary'>Processing</Badge>
                )}
              </MetaItem>
              <MetaItem label='Type'>
                <span className='capitalize'>{contract.type.replace('_', ' ')}</span>
              </MetaItem>
              <MetaItem label='Effective From'>
                {contract.effectiveFrom ? new Date(contract.effectiveFrom).toLocaleDateString('en-IN') : '—'}
              </MetaItem>
              <MetaItem label='File'>
                <span className='truncate text-xs font-mono'>{contract.fileName}</span>
              </MetaItem>
            </div>

            {/* AI Metadata */}
            {(contract as any).metadata && (
              <SidesheetMetadataCard
                metadata={(contract as any).metadata}
                summary={(contract as any).summary}
              />
            )}

            {/* Terms summary */}
            {terms.length > 0 && (
              <div className='flex gap-4 px-5 py-3 border-b bg-muted/20'>
                <div>
                  <p className='text-lg font-bold'>{terms.length}</p>
                  <p className='text-xs text-muted-foreground'>Terms</p>
                </div>
                <div className='w-px bg-border' />
                <div>
                  <p className='text-lg font-bold text-emerald-600'>{approved}</p>
                  <p className='text-xs text-muted-foreground'>Approved</p>
                </div>
                <div className='w-px bg-border' />
                <div>
                  <p className='text-lg font-bold text-amber-600'>{needsReview}</p>
                  <p className='text-xs text-muted-foreground'>Review</p>
                </div>
              </div>
            )}

            {/* Terms list */}
            {contract.status === 'parsing' ? (
              <div className='flex flex-col items-center gap-2 py-12'>
                <Loader2 className='size-7 animate-spin text-muted-foreground' />
                <p className='text-sm text-muted-foreground'>Extracting terms…</p>
              </div>
            ) : terms.length === 0 ? (
              <p className='px-5 py-6 text-sm text-center text-muted-foreground'>No terms extracted yet.</p>
            ) : (
              <div className='divide-y'>
                {terms.map((term) => (
                  <TermCard
                    key={term.id}
                    term={term}
                    onUpdate={(status) => updateTerm({ termId: term.id, payload: { status } })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer actions */}
      {contract && (
        <div className='border-t px-5 py-4 flex items-center gap-2'>
          {contract.status === 'review' && (
            <Button className='flex-1' onClick={() => activate()} disabled={activating} size='sm'>
              {activating ? (
                <>
                  <Loader2 className='size-3.5 animate-spin' /> Activating…
                </>
              ) : (
                <>
                  <CheckCircle2 className='size-3.5' /> Approve & Activate
                </>
              )}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant='outline' size='sm' disabled>
                    <RotateCcw className='size-3.5' /> Reprocess
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{NO_REPROCESS_PERMISSION_MSG}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant='outline'
            size='sm'
            className='text-destructive hover:bg-destructive/10 hover:text-destructive'
            onClick={() => onDelete(contractId)}
          >
            <Trash2 className='size-3.5' />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground mb-0.5'>{label}</p>
      <div className='text-sm font-medium'>{children}</div>
    </div>
  );
}

function TermCard({ term, onUpdate }: { term: ContractTerm; onUpdate: (status: ContractTermStatus) => void }) {
  const valueText = term.rate
    ? `${formatCurrency(term.rate)}${term.unit ? ' / ' + term.unit.replace('_', ' ') : ''}`
    : (term.formula ?? null);

  return (
    <div className='px-5 py-3 hover:bg-muted/20 transition-colors'>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex-1 min-w-0'>
          <p className='text-sm font-medium leading-snug'>{term.description}</p>
          {term.route && <p className='text-xs text-muted-foreground mt-0.5'>{term.route}</p>}
          {valueText && <p className='text-sm font-mono text-primary mt-1'>{valueText}</p>}
          {term.source && <p className='text-xs text-muted-foreground mt-0.5'>Source: {term.source}</p>}
        </div>
        <div className='flex flex-col items-end gap-1.5 shrink-0'>
          <TermStatusBadge status={term.status} />
          <ConfidenceBadge confidence={term.confidence} />
        </div>
      </div>
      {/* Quick actions */}
      <div className='flex gap-1 mt-2'>
        {term.status !== 'approved' && (
          <button
            onClick={() => onUpdate('approved')}
            className='rounded p-1 text-emerald-600 hover:bg-emerald-50'
            title='Approve'
          >
            <CheckCircle2 className='size-3.5' />
          </button>
        )}
        {term.status !== 'review' && (
          <button
            onClick={() => onUpdate('review')}
            className='rounded p-1 text-amber-600 hover:bg-amber-50'
            title='Flag for review'
          >
            <Clock className='size-3.5' />
          </button>
        )}
        {term.status !== 'rejected' && (
          <button
            onClick={() => onUpdate('rejected')}
            className='rounded p-1 text-destructive hover:bg-destructive/10'
            title='Reject'
          >
            <XCircle className='size-3.5' />
          </button>
        )}
        {term.status !== 'pending' && (
          <button
            onClick={() => onUpdate('pending')}
            className='rounded p-1 text-muted-foreground hover:bg-muted'
            title='Reset to pending'
          >
            <RotateCcw className='size-3' />
          </button>
        )}
      </div>
    </div>
  );
}

function TermStatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <Badge variant='success'>Approved</Badge>;
  if (status === 'review') return <Badge variant='warning'>Review</Badge>;
  if (status === 'rejected') return <Badge variant='destructive'>Rejected</Badge>;
  return <Badge variant='secondary'>Pending</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (pct >= 90) return <Badge variant='success'>{pct}%</Badge>;
  if (pct >= 75) return <Badge variant='warning'>{pct}%</Badge>;
  return <Badge variant='destructive'>{pct}%</Badge>;
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

function SidesheetMetadataCard({ metadata, summary }: { metadata: ContractMetadata; summary?: string | null }) {
  const fields: { label: string; value: string | null | undefined }[] = [
    { label: 'Carrier', value: metadata.carrierName },
    { label: 'SCAC', value: metadata.carrierScac },
    { label: 'Mode', value: metadata.mode?.toUpperCase() },
    { label: 'Shipper', value: metadata.shipper },
    { label: 'Start', value: metadata.startDate ? new Date(metadata.startDate).toLocaleDateString('en-US') : null },
    { label: 'Expiry', value: metadata.expirationDate ? new Date(metadata.expirationDate).toLocaleDateString('en-US') : null },
    { label: 'Currency', value: metadata.currency },
    { label: 'Rate Type', value: metadata.rateType?.replace('_', ' ') },
    { label: 'Lanes', value: metadata.laneCount?.toString() },
  ];
  const filledFields = fields.filter((f) => f.value);
  if (filledFields.length === 0 && !summary && !metadata.originRegions?.length && !metadata.destRegions?.length && !metadata.divisions?.length && !metadata.keyTerms?.length) return null;

  return (
    <div className='px-5 py-4 border-b space-y-3'>
      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>AI Metadata</p>
      {summary && <p className='text-xs text-muted-foreground italic'>{summary}</p>}
      {filledFields.length > 0 && (
        <div className='grid grid-cols-2 gap-2'>
          {filledFields.map(({ label, value }) => (
            <div key={label}>
              <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>{label}</p>
              <p className='text-xs font-medium'>{value}</p>
            </div>
          ))}
        </div>
      )}
      {metadata.originRegions && metadata.originRegions.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Origin Regions</p>
          <div className='flex flex-wrap gap-1'>{metadata.originRegions.map((r) => <Badge key={r} variant='secondary' className='text-xs'>{r}</Badge>)}</div>
        </div>
      )}
      {metadata.destRegions && metadata.destRegions.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Dest Regions</p>
          <div className='flex flex-wrap gap-1'>{metadata.destRegions.map((r) => <Badge key={r} variant='secondary' className='text-xs'>{r}</Badge>)}</div>
        </div>
      )}
      {metadata.divisions && metadata.divisions.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Divisions</p>
          <div className='flex flex-wrap gap-1'>{metadata.divisions.map((d) => <Badge key={d} variant='outline' className='text-xs'>{d}</Badge>)}</div>
        </div>
      )}
      {metadata.keyTerms && metadata.keyTerms.length > 0 && (
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>Key Terms</p>
          <div className='flex flex-wrap gap-1'>{metadata.keyTerms.map((t) => <Badge key={t} variant='outline' className='text-xs'>{t}</Badge>)}</div>
        </div>
      )}
    </div>
  );
}

function EditableEntity({
  label,
  currentId,
  currentName,
  useGetAll,
  useCreate,
  onSave,
}: {
  label: string;
  currentId?: string;
  currentName?: string;
  useGetAll: () => { data?: Array<{ id: string; name: string }> };
  useCreate: () => { mutateAsync: (payload: { name: string }) => Promise<{ id: string; name: string }> };
  onSave: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const { data: items } = useGetAll();
  const { mutateAsync: create } = useCreate();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className='inline-flex items-center gap-1 hover:text-foreground transition-colors group'
        title={`Edit ${label}`}
      >
        <span>{currentName ?? `No ${label}`}</span>
        <Pencil className='size-3 opacity-0 group-hover:opacity-100 transition-opacity' />
      </button>
    );
  }

  if (creating) {
    return (
      <span className='inline-flex items-center gap-1'>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${label}`}
          className='h-5 w-28 text-xs'
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            if (e.key === 'Enter' && newName.trim()) {
              create({ name: newName.trim() }).then((entity) => {
                onSave(entity.id);
                setCreating(false);
                setEditing(false);
                setNewName('');
              });
            }
          }}
        />
        <button
          onClick={() => {
            if (!newName.trim()) return;
            create({ name: newName.trim() }).then((entity) => {
              onSave(entity.id);
              setCreating(false);
              setEditing(false);
              setNewName('');
            });
          }}
          className='rounded p-0.5 text-primary hover:bg-primary/10'
        >
          <Check className='size-3' />
        </button>
        <button onClick={() => { setCreating(false); setNewName(''); }} className='rounded p-0.5 text-muted-foreground hover:bg-muted'>
          <X className='size-3' />
        </button>
      </span>
    );
  }

  return (
    <span className='inline-flex items-center gap-1'>
      <Select
        value={currentId ?? ''}
        onValueChange={(val) => {
          if (val === '__new__') { setCreating(true); }
          else { onSave(val); setEditing(false); }
        }}
      >
        <SelectTrigger className='h-5 w-32 text-xs'>
          <SelectValue placeholder={`Select ${label}…`} />
        </SelectTrigger>
        <SelectContent>
          {items?.map((item) => (
            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
          ))}
          <SelectItem value='__new__'>
            <span className='flex items-center gap-1 text-primary'>
              <Plus className='size-3' /> Create new
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <button onClick={() => setEditing(false)} className='rounded p-0.5 text-muted-foreground hover:bg-muted'>
        <X className='size-3' />
      </button>
    </span>
  );
}
