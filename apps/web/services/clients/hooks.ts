import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateClientPayload } from '@repo/types';
import { clientsApi } from './api';

export const clientKeys = {
  all: ['clients'] as const,
};

export function useGetClients() {
  return useQuery({ queryKey: clientKeys.all, queryFn: clientsApi.getAll });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClientPayload) => clientsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}
