export type AuditResultStatus = 'ok' | 'overcharge' | 'review';
export type AuditLineStatus = 'ok' | 'overcharge' | 'variance' | 'review';

export interface AuditEvidence {
  invoiceSays: string;
  contractSays: string;
  source: string;
  termId?: string;
  contractName?: string;
}

export interface AuditLineResult {
  id: string;
  invoiceLineId: string;
  chargeType: string;
  description: string;
  invoicedAmount: number;
  expectedAmount: number;
  variance: number;
  result: AuditLineStatus;
  explanation: string;
  evidence: AuditEvidence;
  matchedTermId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditResult {
  id: string;
  invoiceId: string;
  invoiceNo?: string;
  vendorName?: string;
  invoiceTotal: number;
  expectedTotal: number;
  variance: number;
  status: AuditResultStatus;
  lineResults: AuditLineResult[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  contractsUploaded: number;
  activeVendors: number;
  invoicesAudited: number;
  totalOvercharge: number;
  manualReviewItems: number;
}
