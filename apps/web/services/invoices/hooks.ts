import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesApi } from './api';

export const invoiceKeys = {
  all: ['invoices'] as const,
  detail: (id: string) => ['invoices', id] as const,
};

export function useGetInvoices() {
  return useQuery({ queryKey: invoiceKeys.all, queryFn: invoicesApi.getAll });
}

export function useGetInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoicesApi.getOne(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' ? 3000 : false;
    },
  });
}

export function useUploadInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => invoicesApi.upload(formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}
