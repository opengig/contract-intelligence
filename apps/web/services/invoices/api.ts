import type { Invoice, AuditResult } from '@repo/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081';

export const invoicesApi = {
  getAll: async (): Promise<Invoice[]> => {
    const res = await fetch(`${API_BASE}/invoices`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  getOne: async (id: string): Promise<Invoice & { auditResult?: AuditResult }> => {
    const res = await fetch(`${API_BASE}/invoices/${id}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  upload: async (formData: FormData): Promise<Invoice> => {
    const res = await fetch(`${API_BASE}/invoices/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
};
