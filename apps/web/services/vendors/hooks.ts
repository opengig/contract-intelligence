import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateVendorPayload } from '@repo/types';
import { vendorsApi } from './api';

export const vendorKeys = {
  all: ['vendors'] as const,
  detail: (id: string) => ['vendors', id] as const,
};

export function useGetVendors() {
  return useQuery({ queryKey: vendorKeys.all, queryFn: vendorsApi.getAll });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVendorPayload) => vendorsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: vendorKeys.all }),
  });
}
