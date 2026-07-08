'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileText, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.pdf', '.csv'];
const ALLOWED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'text/csv',
];

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    return <FileSpreadsheet className="size-5 text-emerald-600" />;
  }
  return <FileText className="size-5 text-primary" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
  description?: string;
  selectedFile?: File | null;
  onClear?: () => void;
  disabled?: boolean;
  uploadProgress?: number | null;
}

export function FileUploadZone({
  onFileSelect,
  accept = '.xlsx,.xls,.pdf,.csv',
  label = 'Drop your document here',
  description = 'PDF, Excel (.xlsx / .xls), or CSV',
  selectedFile,
  onClear,
  disabled,
  uploadProgress,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  const validate = useCallback((file: File): boolean => {
    if (ALLOWED_MIME.includes(file.type)) return true;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return true;
    setTypeError(`Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    return false;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        setTypeError(null);
        if (validate(file)) onFileSelect(file);
      }
    },
    [onFileSelect, validate],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTypeError(null);
      if (validate(file)) onFileSelect(file);
    }
    e.target.value = '';
  };

  if (selectedFile) {
    const isUploading = uploadProgress != null && uploadProgress < 100;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          <FileIcon name={selectedFile.name} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
          </div>
          {!isUploading && onClear && (
            <Button variant="ghost" size="icon-sm" onClick={onClear} disabled={disabled}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        {uploadProgress != null && (
          <div className="space-y-1">
            <Progress value={uploadProgress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-right">
              {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Upload complete'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/20',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <div className="rounded-full bg-muted p-3">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <p className="text-xs text-muted-foreground/70">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
      {typeError && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {typeError}
        </div>
      )}
    </div>
  );
}
