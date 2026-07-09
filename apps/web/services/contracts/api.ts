import type {
  Contract,
  ContractProcessingStatus,
  CreateContractPayload,
  UpdateTermPayload,
  UploadTarget,
} from '@repo/types';
import { authHeaders } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

export const contractsApi = {
  getAll: async (): Promise<Contract[]> => {
    const res = await fetch(`${API_BASE}/contracts`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  getOne: async (id: string): Promise<Contract> => {
    const res = await fetch(`${API_BASE}/contracts/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  getStatus: async (id: string): Promise<ContractProcessingStatus> => {
    const res = await fetch(`${API_BASE}/contracts/${id}/status`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  presign: async (fileName: string): Promise<UploadTarget> => {
    const res = await fetch(`${API_BASE}/contracts/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  /**
   * Upload a file to the local dev endpoint with progress reporting.
   * Returns the storageKey assigned by the server.
   */
  uploadLocal: (file: File, onProgress?: (pct: number) => void): Promise<{ storageKey: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload network error')));

      xhr.open('PUT', `${API_BASE}/contracts/upload/local`);

      const token = document.cookie.match(/(?:^|; )auth_token=([^;]*)/)?.[1];
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${decodeURIComponent(token)}`);

      xhr.send(fd);
    });
  },

  create: async (payload: CreateContractPayload): Promise<Contract> => {
    const res = await fetch(`${API_BASE}/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  update: async (contractId: string, payload: { vendorId?: string; clientId?: string; name?: string; type?: string }): Promise<Contract> => {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  updateTerm: async (contractId: string, termId: string, payload: UpdateTermPayload): Promise<void> => {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/terms/${termId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  },

  activate: async (contractId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/activate`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  },

  reprocess: async (contractId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/reprocess`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  },

  delete: async (contractId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  },
};
