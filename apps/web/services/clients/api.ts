import type { Client, CreateClientPayload } from '@repo/types';
import { apiClient } from '@/lib/api-client';

export const clientsApi = {
  getAll: () => apiClient<Client[]>('/clients'),
  getOne: (id: string) => apiClient<Client>(`/clients/${id}`),
  create: (payload: CreateClientPayload) =>
    apiClient<Client>('/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
