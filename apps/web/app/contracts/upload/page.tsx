'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Upload,
  FileText,
  FileSpreadsheet,
  Settings2,
  Zap,
  AlertCircle,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileUploadZone } from '@/components/shared/file-upload-zone';
import { useGetVendors, useCreateVendor } from '@/services/vendors/hooks';
import { contractsApi } from '@/services/contracts/api';
import type { ContractStatus } from '@repo/types';

const CONTRACT_TYPES = [
  { value: 'rate_sheet', label: 'Rate Sheet' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'surcharge', label: 'Surcharge Schedule' },
  { value: 'other', label: 'Other' },
] as const;

type Step = 'upload' | 'metadata' | 'processing';

const PIPELINE_STEPS: {
  status: ContractStatus;
  label: string;
  desc: string;
}[] = [
  { status: 'uploaded', label: 'Uploaded', desc: 'File received' },
  { status: 'parsing', label: 'Parsing', desc: 'Extracting document text' },
  { status: 'parsed', label: 'Parsed', desc: 'Text extraction complete' },
  { status: 'active', label: 'Complete', desc: 'Ready to use' },
];

const STATUS_ORDER: ContractStatus[] = ['uploaded', 'parsing', 'parsed', 'active'];

const STEP_CONFIG: Record<Step, { Icon: LucideIcon; label: string }> = {
  upload: { Icon: Upload, label: 'Select Files' },
  metadata: { Icon: Settings2, label: 'Details' },
  processing: { Icon: Zap, label: 'Processing' },
};

interface FileEntry {
  id: string;
  file: File;
  name: string;
  type: string;
  effectiveFrom: string;
  storageKey: string | null;
  contractId: string | null;
  status: ContractStatus | 'uploading' | 'error' | 'pending';
  error?: string;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    return <FileSpreadsheet className='size-4 text-emerald-600' />;
  }
  return <FileText className='size-4 text-primary' />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ['upload', 'metadata', 'processing'];
  const currentIdx = steps.indexOf(current);

  return (
    <div className='flex items-center gap-0'>
      {steps.map((s, i) => {
        const { Icon, label } = STEP_CONFIG[s];
        const done = i < currentIdx;
        const active = s === current;
        return (
          <div key={s} className='flex items-center'>
            <div className='flex flex-col items-center gap-1.5'>
              <div
                className={[
                  'flex size-8 items-center justify-center rounded-full border-2 transition-colors',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted-foreground/30 bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {done ? <CheckCircle2 className='size-4' /> : <Icon className='size-3.5' />}
              </div>
              <span
                className={`text-xs font-medium ${
                  active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mb-5 h-px w-16 transition-colors ${
                  i < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FileProcessingStatus({ entry }: { entry: FileEntry }) {
  const currentIdx = STATUS_ORDER.indexOf(entry.status as ContractStatus);

  if (entry.status === 'error') {
    return (
      <div className='flex items-center gap-2 text-xs text-destructive'>
        <AlertCircle className='size-3.5' />
        <span>{entry.error ?? 'Processing failed'}</span>
      </div>
    );
  }

  if (entry.status === 'uploading' || entry.status === 'pending') {
    return (
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        <Loader2 className='size-3 animate-spin' />
        <span>{entry.status === 'uploading' ? 'Uploading...' : 'Pending'}</span>
      </div>
    );
  }

  return (
    <div className='flex items-center gap-1.5'>
      {PIPELINE_STEPS.map((ps) => {
        const stepIdx = STATUS_ORDER.indexOf(ps.status);
        const done = stepIdx < currentIdx || entry.status === 'active';
        const active = stepIdx === currentIdx && entry.status !== 'active';

        return (
          <div key={ps.status} className='flex items-center gap-1'>
            {done ? (
              <CheckCircle2 className='size-3 text-primary' />
            ) : active ? (
              <Loader2 className='size-3 animate-spin text-primary' />
            ) : (
              <Circle className='size-3 text-muted-foreground/40' />
            )}
            <span
              className={`text-[10px] ${
                done ? 'text-primary' : active ? 'text-foreground' : 'text-muted-foreground/60'
              }`}
            >
              {ps.label}
            </span>
            {stepIdx < PIPELINE_STEPS.length - 1 && <span className='text-muted-foreground/30 mx-0.5'>-</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function ContractUploadPage() {
  const router = useRouter();
  const { data: vendors } = useGetVendors();
  const { mutateAsync: createVendor, isPending: creatingVendor } = useCreateVendor();

  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesSelect = (newFiles: File[]) => {
    const entries: FileEntry[] = newFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      type: 'rate_sheet',
      effectiveFrom: '',
      storageKey: null,
      contractId: null,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...entries]);
  };

  const handleSingleFileSelect = (f: File) => {
    handleFilesSelect([f]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const validateMetadata = () => {
    const errors: Record<string, string> = {};
    if (!showNewVendor && !vendorId) errors.vendor = 'Please select a vendor';
    if (showNewVendor && !newVendorName.trim()) errors.vendor = 'Vendor name is required';
    const unnamed = files.find((f) => !f.name.trim());
    if (unnamed) errors.files = 'All contracts need a name';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProcess = async () => {
    if (!validateMetadata()) return;

    setIsProcessing(true);
    setStep('processing');

    let resolvedVendorId = vendorId;
    if (showNewVendor) {
      try {
        const vendor = await createVendor({ name: newVendorName });
        resolvedVendorId = vendor.id;
      } catch {
        setFieldErrors((e) => ({ ...e, vendor: 'Failed to create vendor' }));
        setIsProcessing(false);
        setStep('metadata');
        return;
      }
    }

    // Process each file sequentially
    for (const entry of files) {
      try {
        // Upload
        updateFile(entry.id, { status: 'uploading' });
        const uploadResult = await contractsApi.uploadLocal(entry.file);
        updateFile(entry.id, { storageKey: uploadResult.storageKey });

        // Create contract
        const contract = await contractsApi.create({
          vendorId: resolvedVendorId,
          name: entry.name.trim(),
          type: entry.type as any,
          storageKey: uploadResult.storageKey,
          fileName: entry.file.name,
          effectiveFrom: entry.effectiveFrom || undefined,
        });
        updateFile(entry.id, {
          contractId: contract.id,
          status: 'uploaded',
        });
      } catch (err) {
        updateFile(entry.id, {
          status: 'error',
          error: (err as Error).message,
        });
      }
    }

    setIsProcessing(false);
  };

  // Poll status for contracts that are processing
  useEffect(() => {
    if (step !== 'processing') return;

    const activeIds = files
      .filter(
        (f) =>
          f.contractId &&
          f.status !== 'active' &&
          f.status !== 'error' &&
          f.status !== 'pending' &&
          f.status !== 'uploading',
      )
      .map((f) => ({ id: f.id, contractId: f.contractId! }));

    if (activeIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const { id, contractId } of activeIds) {
        try {
          const res = await contractsApi.getStatus(contractId);
          if (res.status !== files.find((f) => f.id === id)?.status) {
            updateFile(id, { status: res.status });
          }
        } catch {
          // ignore polling errors
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [step, files]);

  const allDone = files.length > 0 && files.every((f) => f.status === 'active' || f.status === 'error');

  return (
    <div className='p-8 max-w-3xl mx-auto space-y-8'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon-sm' asChild>
          <Link href='/contracts'>
            <ArrowLeft className='size-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold'>Upload Contracts</h1>
          <p className='text-sm text-muted-foreground'>
            Upload one or more documents — AI will extract and structure them
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className='flex justify-center'>
        <StepIndicator current={step} />
      </div>

      {/* ── Step 1: Select Files ── */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Documents</CardTitle>
            <CardDescription>
              Upload contract PDFs, Word docs (.docx), Excel files, or text files. You can select multiple.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <FileUploadZone
              onFileSelect={handleSingleFileSelect}
              onFilesSelect={handleFilesSelect}
              multiple
              disabled={false}
            />

            {/* File list */}
            {files.length > 0 && (
              <div className='space-y-2'>
                <p className='text-xs font-medium text-muted-foreground'>
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </p>
                <div className='space-y-1.5 max-h-60 overflow-y-auto'>
                  {files.map((entry) => (
                    <div key={entry.id} className='flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2'>
                      <FileIcon name={entry.file.name} />
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm truncate'>{entry.file.name}</p>
                        <p className='text-[10px] text-muted-foreground'>{formatBytes(entry.file.size)}</p>
                      </div>
                      <Button variant='ghost' size='icon-sm' onClick={() => removeFile(entry.id)}>
                        <X className='size-3.5' />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className='w-full' onClick={() => setStep('metadata')} disabled={files.length === 0}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Metadata ── */}
      {step === 'metadata' && (
        <Card>
          <CardHeader>
            <CardTitle>Contract Details</CardTitle>
            <CardDescription>Set the vendor (shared) and per-file details</CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            {/* Vendor (shared across all files) */}
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>
                Vendor <span className='text-destructive'>*</span>
              </label>
              {!showNewVendor ? (
                <div className='flex gap-2'>
                  <Select
                    value={vendorId}
                    onValueChange={(v) => {
                      setVendorId(v);
                      setFieldErrors((e) => ({ ...e, vendor: '' }));
                    }}
                  >
                    <SelectTrigger className='flex-1 w-full'>
                      <SelectValue placeholder='Select vendor...' />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant='outline' size='sm' onClick={() => setShowNewVendor(true)}>
                    + New
                  </Button>
                </div>
              ) : (
                <div className='flex gap-2'>
                  <Input
                    value={newVendorName}
                    onChange={(e) => {
                      setNewVendorName(e.target.value);
                      setFieldErrors((fe) => ({ ...fe, vendor: '' }));
                    }}
                    placeholder='e.g. FastMove Logistics'
                    aria-invalid={!!fieldErrors.vendor}
                  />
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setShowNewVendor(false);
                      setNewVendorName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {fieldErrors.vendor && <p className='text-xs text-destructive'>{fieldErrors.vendor}</p>}
            </div>

            <Separator />

            {/* Per-file metadata */}
            <div className='space-y-3'>
              <label className='text-sm font-medium'>Files</label>
              {fieldErrors.files && <p className='text-xs text-destructive'>{fieldErrors.files}</p>}
              <div className='space-y-3 max-h-[400px] overflow-y-auto'>
                {files.map((entry) => (
                  <div key={entry.id} className='rounded-lg border p-3 space-y-2.5'>
                    <div className='flex items-center gap-2'>
                      <FileIcon name={entry.file.name} />
                      <span className='text-xs text-muted-foreground truncate flex-1'>{entry.file.name}</span>
                      <Badge variant='secondary' className='text-[10px]'>
                        {formatBytes(entry.file.size)}
                      </Badge>
                    </div>
                    <div className='grid grid-cols-3 gap-2'>
                      <div className='col-span-2'>
                        <Input
                          value={entry.name}
                          onChange={(e) => updateFile(entry.id, { name: e.target.value })}
                          placeholder='Contract name'
                          className='h-8 text-xs'
                        />
                      </div>
                      <Select value={entry.type} onValueChange={(v) => updateFile(entry.id, { type: v })}>
                        <SelectTrigger className='h-8 text-xs'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTRACT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      type='date'
                      value={entry.effectiveFrom}
                      onChange={(e) =>
                        updateFile(entry.id, {
                          effectiveFrom: e.target.value,
                        })
                      }
                      className='h-8 text-xs w-44'
                      placeholder='Effective from (optional)'
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className='flex gap-3 pt-2'>
              <Button variant='outline' onClick={() => setStep('upload')} className='flex-1'>
                Back
              </Button>
              <Button className='flex-1' onClick={handleProcess} disabled={isProcessing || creatingVendor}>
                {isProcessing || creatingVendor ? (
                  <>
                    <Loader2 className='size-4 animate-spin' />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className='size-4' />
                    Process {files.length} Contract{files.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Processing ── */}
      {step === 'processing' && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Contracts</CardTitle>
            <CardDescription>AI is extracting data from your documents</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              {files.map((entry) => (
                <div key={entry.id} className='flex items-center gap-3 rounded-lg border px-4 py-3'>
                  <FileIcon name={entry.file.name} />
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium truncate'>{entry.name}</p>
                    <FileProcessingStatus entry={entry} />
                  </div>
                  {entry.status === 'active' && (
                    <Badge variant='success' className='shrink-0'>
                      Done
                    </Badge>
                  )}
                  {entry.status === 'error' && (
                    <Badge variant='destructive' className='shrink-0'>
                      Failed
                    </Badge>
                  )}
                  {entry.status !== 'active' && entry.status !== 'error' && (
                    <Loader2 className='size-4 animate-spin text-muted-foreground shrink-0' />
                  )}
                </div>
              ))}
            </div>

            {allDone ? (
              <Button className='w-full' asChild>
                <Link href='/contracts'>View All Contracts</Link>
              </Button>
            ) : (
              <p className='text-center text-xs text-muted-foreground'>
                Processing usually takes 10-60 seconds per file. You can leave this page — processing continues in the
                background.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
