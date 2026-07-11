'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  FileText,
  FileSpreadsheet,
  Zap,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileUploadZone } from '@/components/shared/file-upload-zone';
import { contractsApi } from '@/services/contracts/api';
import type { ContractStatus } from '@repo/types';

const PIPELINE_STEPS: { status: ContractStatus; label: string }[] = [
  { status: 'uploaded', label: 'Uploaded' },
  { status: 'parsing', label: 'Parsing' },
  { status: 'parsed', label: 'Parsed' },
  { status: 'active', label: 'Complete' },
];

const STATUS_ORDER: ContractStatus[] = ['uploaded', 'parsing', 'parsed', 'active'];

interface FileEntry {
  id: string;
  file: File;
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
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesSelect = (newFiles: File[]) => {
    const entries: FileEntry[] = newFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      storageKey: null,
      contractId: null,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...entries]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const handleProcess = async () => {
    setIsProcessing(true);

    for (const entry of files) {
      try {
        updateFile(entry.id, { status: 'uploading' });
        const uploadResult = await contractsApi.uploadLocal(entry.file);
        updateFile(entry.id, { storageKey: uploadResult.storageKey });

        const contract = await contractsApi.create({
          storageKey: uploadResult.storageKey,
          fileName: entry.file.name,
        });
        updateFile(entry.id, { contractId: contract.id, status: 'uploaded' });
      } catch (err) {
        updateFile(entry.id, { status: 'error', error: (err as Error).message });
      }
    }

    setIsProcessing(false);
  };

  // Poll status for contracts that are processing
  useEffect(() => {
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
  }, [files]);

  const allDone = files.length > 0 && files.every((f) => f.status === 'active' || f.status === 'error');
  const hasStarted = files.some((f) => f.status !== 'pending');

  return (
    <div className='p-8 max-w-3xl mx-auto space-y-8'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon-sm' asChild>
          <Link href='/contracts'>
            <ArrowLeft className='size-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold'>Upload Contracts</h1>
          <p className='text-sm text-muted-foreground'>
            Upload documents — AI will extract vendor, client, type, dates, and terms automatically
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Temporarily Disabled</CardTitle>
          <CardDescription>
            Document upload is currently disabled while we improve the ingestion pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-col items-center gap-3 py-8 text-center'>
            <AlertCircle className='size-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground max-w-md'>
              We are enhancing document parsing to better handle complex spreadsheet formats,
              multi-row headers, and metadata extraction. Upload will be re-enabled soon.
            </p>
            <Button variant='outline' asChild>
              <Link href='/contracts'>View Existing Contracts</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
