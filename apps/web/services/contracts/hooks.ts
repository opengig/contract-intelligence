import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateContractPayload, UpdateTermPayload } from '@repo/types';
import { contractsApi } from './api';

export const contractKeys = {
  all: ['contracts'] as const,
  detail: (id: string) => ['contracts', id] as const,
  status: (id: string) => ['contracts', id, 'status'] as const,
};

const TERMINAL_STATUSES = new Set(['active', 'review', 'error']);

export function useGetContracts() {
  return useQuery({ queryKey: contractKeys.all, queryFn: contractsApi.getAll });
}

export function useGetContract(id: string) {
  return useQuery({
    queryKey: contractKeys.detail(id),
    queryFn: () => contractsApi.getOne(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 3000;
    },
  });
}

export function useGetContractStatus(id: string | null) {
  return useQuery({
    queryKey: contractKeys.status(id ?? ''),
    queryFn: () => contractsApi.getStatus(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 2000;
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateContractPayload) => contractsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.all }),
  });
}

export function useUpdateTerm(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ termId, payload }: { termId: string; payload: UpdateTermPayload }) =>
      contractsApi.updateTerm(contractId, termId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.detail(contractId) }),
  });
}

export function useActivateContract(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => contractsApi.activate(contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contractKeys.detail(contractId) });
      qc.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

export function useReprocessContract(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => contractsApi.reprocess(contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contractKeys.detail(contractId) });
      qc.invalidateQueries({ queryKey: contractKeys.status(contractId) });
      qc.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contractId: string) => contractsApi.delete(contractId),
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.all }),
  });
}
