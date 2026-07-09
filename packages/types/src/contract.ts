export interface ExtractedTable {
  name: string;
  summary: string;
  headers: string[];
  rows: string[][];
  /** Full readable text of the table (for vector search / agent context) */
  textContent: string;
}

/** Shape stored in Contract.columns for PDF-parsed documents. */
export interface TableMeta {
  tableName: string;
  summary: string;
  headers: string[];
}

export type ContractType = "rate_sheet" | "amendment" | "surcharge" | "other";
export type ContractStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "review"
  | "active"
  | "error";
export type ContractTermStatus = "pending" | "approved" | "rejected" | "review";
export type ContractTermType =
  | "freight_rate"
  | "detention"
  | "fuel_surcharge"
  | "other";

export interface ContractTerm {
  id: string;
  contractId: string;
  termType: ContractTermType;
  description: string;
  route: string | null;
  vehicleType: string | null;
  rate: number | null;
  unit: string | null;
  formula: string | null;
  conditions: string | null;
  confidence: number;
  status: ContractTermStatus;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  vendorId?: string | null;
  vendorName?: string;
  clientId?: string | null;
  clientName?: string;
  name: string;
  type: ContractType;
  filePath: string;
  fileName: string;
  storageKey?: string | null;
  status: ContractStatus;
  effectiveFrom: string | null;
  termCount?: number;
  terms?: ContractTerm[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractPayload {
  vendorId?: string;
  name?: string;
  type?: ContractType;
  storageKey: string;
  fileName: string;
  effectiveFrom?: string;
}

export interface UpdateTermPayload {
  status?: ContractTermStatus;
  description?: string;
  rate?: number;
  unit?: string;
  formula?: string;
}

export interface UploadTarget {
  uploadUrl: string;
  storageKey: string;
  strategy: "local" | "azure";
}

export interface ContractProcessingStatus {
  id: string;
  status: ContractStatus;
  processingJobId?: string | null;
}
