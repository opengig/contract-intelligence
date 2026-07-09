export type InvoiceStatus = "processing" | "audited" | "disputed";

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  chargeType: string;
  description: string;
  invoicedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  vendorId: string;
  vendorName?: string;
  invoiceNo: string;
  filePath: string;
  fileName: string;
  totalAmount: number;
  status: InvoiceStatus;
  lines?: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoicePayload {
  vendorId: string;
  invoiceNo?: string;
}
