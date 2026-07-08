'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUploadZone } from '@/components/shared/file-upload-zone';
import { useGetVendors } from '@/services/vendors/hooks';
import { useUploadInvoice } from '@/services/invoices/hooks';

export default function InvoiceUploadPage() {
  const router = useRouter();
  const { data: vendors } = useGetVendors();
  const { mutateAsync: uploadInvoice, isPending: uploading } = useUploadInvoice();

  const [file, setFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!file) return setError('Please select an invoice file');
    if (!vendorId) return setError('Please select a vendor');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('vendorId', vendorId);
    if (invoiceNo) fd.append('invoiceNo', invoiceNo);

    const invoice = await uploadInvoice(fd);
    router.push(`/invoices/${invoice.id}`);
  };

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/invoices"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Audit Invoice</h1>
          <p className="text-muted-foreground text-sm">
            AI will extract and verify charges against approved contracts
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select vendor...</option>
              {vendors?.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Invoice Number <span className="text-muted-foreground">(optional — AI will detect)</span>
            </label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-1045"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Invoice File</CardTitle></CardHeader>
        <CardContent>
          <FileUploadZone
            onFileSelect={setFile}
            selectedFile={file}
            onClear={() => setFile(null)}
            disabled={uploading}
            label="Drop invoice here"
          />
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button className="w-full" onClick={handleSubmit} disabled={uploading}>
        {uploading ? (
          <><Loader2 className="size-4 animate-spin" /> Uploading & Running Audit...</>
        ) : (
          'Upload & Audit Invoice'
        )}
      </Button>
    </div>
  );
}
