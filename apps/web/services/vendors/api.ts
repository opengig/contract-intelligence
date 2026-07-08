import type { Vendor, CreateVendorPayload } from '@repo/types';
import { apiClient } from '@/lib/api-client';

export const vendorsApi = {
  getAll: () => apiClient<Vendor[]>('/vendors'),
  getOne: (id: string) => apiClient<Vendor>(`/vendors/${id}`),
  create: (payload: CreateVendorPayload) =>
    apiClient<Vendor>('/vendors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
