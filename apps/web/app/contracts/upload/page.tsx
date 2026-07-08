'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Upload,
  FileText,
  Settings2,
  Zap,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileUploadZone } from '@/components/shared/file-upload-zone';
import { useGetVendors, useCreateVendor } from '@/services/vendors/hooks';
import { useCreateContract, useGetContractStatus } from '@/services/contracts/hooks';
import { contractsApi } from '@/services/contracts/api';
import type { ContractStatus } from '@repo/types';

const CONTRACT_TYPES = [
  { value: 'rate_sheet', label: 'Rate Sheet' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'surcharge', label: 'Surcharge Schedule' },
  { value: 'other', label: 'Other' },
] as const;

type Step = 'upload' | 'metadata' | 'processing';

const PIPELINE_STEPS: { status: ContractStatus; label: string; desc: string }[] = [
  { status: 'uploaded', label: 'Uploaded', desc: 'File received' },
  { status: 'parsing', label: 'Parsing', desc: 'Extracting document text' },
  { status: 'parsed', label: 'Parsed', desc: 'Text extraction complete' },
  { status: 'active', label: 'Complete', desc: 'Ready to use' },
];

const STATUS_ORDER: ContractStatus[] = ['uploaded', 'parsing', 'parsed', 'active'];

const STEP_CONFIG: Record<Step, { Icon: LucideIcon; label: string }> = {
  upload: { Icon: Upload, label: 'Select File' },
  metadata: { Icon: Settings2, label: 'Details' },
  processing: { Icon: Zap, label: 'Processing' },
};

function StepIndicator({
  step,
  current,
}: {
  step: Step;
  current: Step;
}) {
  const steps: Step[] = ['upload', 'metadata', 'processing'];
  const currentIdx = steps.indexOf(current);

  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => {
        const { Icon, label } = STEP_CONFIG[s];
        const done = i < currentIdx;
        const active = s === current;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
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
                {done ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Icon className="size-3.5" />
                )}
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

export default function ContractUploadPage() {
  const router = useRouter();
  const { data: vendors } = useGetVendors();
  const { mutateAsync: createVendor, isPending: creatingVendor } = useCreateVendor();
  const { mutateAsync: createContract, isPending: creatingContract } = useCreateContract();

  // Step tracking
  const [step, setStep] = useState<Step>('upload');

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Step 2 state
  const [name, setName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [type, setType] = useState<string>('rate_sheet');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 3 state
  const [contractId, setContractId] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const { data: statusData } = useGetContractStatus(contractId);

  // Auto-suggest contract name from filename
  const handleFileSelect = (f: File) => {
    setFile(f);
    if (!name) {
      const suggested = f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setName(suggested);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await contractsApi.uploadLocal(file, setUploadProgress);
      setStorageKey(result.storageKey);
      setStep('metadata');
    } catch (err) {
      setProcessingError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const validateMetadata = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Contract name is required';
    if (!showNewVendor && !vendorId) errors.vendor = 'Please select a vendor';
    if (showNewVendor && !newVendorName.trim()) errors.vendor = 'Vendor name is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateMetadata() || !storageKey) return;

    let resolvedVendorId = vendorId;
    if (showNewVendor) {
      try {
        const vendor = await createVendor({ name: newVendorName });
        resolvedVendorId = vendor.id;
      } catch {
        setFieldErrors((e) => ({ ...e, vendor: 'Failed to create vendor' }));
        return;
      }
    }

    try {
      const contract = await createContract({
        vendorId: resolvedVendorId,
        name: name.trim(),
        type: type as any,
        storageKey,
        fileName: file!.name,
        effectiveFrom: effectiveFrom || undefined,
      });
      setContractId(contract.id);
      setStep('processing');
    } catch (err) {
      setProcessingError((err as Error).message);
    }
  };

  // Redirect once processing is complete — must be in useEffect to avoid
  // calling router.push during render which triggers a React warning.
  useEffect(() => {
    if (
      contractId &&
      statusData?.status !== 'error' &&
      (statusData?.status === 'active' || statusData?.status === 'review')
    ) {
      router.push(`/contracts/${contractId}`);
    }
  }, [contractId, statusData?.status, router]);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/contracts">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Upload Contract</h1>
          <p className="text-sm text-muted-foreground">
            AI will extract and structure commercial terms automatically
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex justify-center">
        <StepIndicator step={step} current={step} />
      </div>

      {/* ── Step 1: Select & Upload File ── */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Document</CardTitle>
            <CardDescription>
              Upload a contract PDF, image (PNG, JPG, TIFF), or CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUploadZone
              onFileSelect={handleFileSelect}
              selectedFile={file}
              onClear={() => {
                setFile(null);
                setUploadProgress(null);
                setStorageKey(null);
              }}
              disabled={uploading}
              uploadProgress={uploading ? uploadProgress : undefined}
            />

            {processingError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {processingError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Uploading… {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  Upload File
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Contract Metadata ── */}
      {step === 'metadata' && (
        <Card>
          <CardHeader>
            <CardTitle>Contract Details</CardTitle>
            <CardDescription>
              Fill in the metadata — name and vendor are required
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Uploaded file summary */}
            {file && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <FileText className="size-4 text-primary shrink-0" />
                <span className="truncate text-muted-foreground">{file.name}</span>
                <Badge variant="secondary" className="ml-auto shrink-0">
                  Uploaded
                </Badge>
              </div>
            )}

            <Separator />

            {/* Contract Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Contract Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((e) => ({ ...e, name: '' }));
                }}
                placeholder="e.g. Road Freight Rate Sheet 2026"
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive">{fieldErrors.name}</p>
              )}
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Vendor <span className="text-destructive">*</span>
              </label>
              {!showNewVendor ? (
                <div className="flex gap-2">
                  <Select
                    value={vendorId}
                    onValueChange={(v) => {
                      setVendorId(v);
                      setFieldErrors((e) => ({ ...e, vendor: '' }));
                    }}
                  >
                    <SelectTrigger className="flex-1 w-full">
                      <SelectValue placeholder="Select vendor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewVendor(true)}
                  >
                    + New
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={newVendorName}
                    onChange={(e) => {
                      setNewVendorName(e.target.value);
                      setFieldErrors((fe) => ({ ...fe, vendor: '' }));
                    }}
                    placeholder="e.g. FastMove Logistics"
                    aria-invalid={!!fieldErrors.vendor}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowNewVendor(false);
                      setNewVendorName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {fieldErrors.vendor && (
                <p className="text-xs text-destructive">{fieldErrors.vendor}</p>
              )}
            </div>

            {/* Contract Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contract Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
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

            {/* Effective From */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Effective From{' '}
                <span className="font-normal">(optional)</span>
              </label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep('upload')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={creatingContract || creatingVendor}
              >
                {creatingContract || creatingVendor ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Process Contract'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Processing ── */}
      {step === 'processing' && contractId && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Contract</CardTitle>
            <CardDescription>
              AI is analysing your document in the background
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {statusData?.status === 'error' ? (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                <AlertCircle className="size-5 shrink-0" />
                <div>
                  <p className="font-medium">Processing failed</p>
                  <p className="text-xs mt-0.5 text-destructive/80">
                    Check the server logs for details. You can delete and re-upload this contract.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {PIPELINE_STEPS.map((ps, i) => {
                  const currentIdx = STATUS_ORDER.indexOf(
                    statusData?.status ?? 'uploaded',
                  );
                  const stepIdx = STATUS_ORDER.indexOf(ps.status);
                  const done = stepIdx < currentIdx;
                  const active =
                    stepIdx === currentIdx &&
                    statusData?.status !== 'active';
                  const pending = stepIdx > currentIdx;

                  return (
                    <div key={ps.status} className="flex items-center gap-3">
                      <div
                        className={[
                          'flex size-7 shrink-0 items-center justify-center rounded-full',
                          done
                            ? 'bg-primary text-primary-foreground'
                            : active
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        {done ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : active ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Circle className="size-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            pending ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {ps.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{ps.desc}</p>
                      </div>
                      {done && (
                        <Badge variant="success" className="text-xs">
                          Done
                        </Badge>
                      )}
                      {active && (
                        <Badge variant="secondary" className="text-xs">
                          In progress
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {statusData?.status === 'active' || statusData?.status === 'review' ? (
              <Button className="w-full" asChild>
                <Link href={`/contracts/${contractId}`}>View Contract</Link>
              </Button>
            ) : statusData?.status === 'error' ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/contracts')}
              >
                Back to Contracts
              </Button>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                This usually takes 10–30 seconds. You can leave this page — processing
                continues in the background.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
