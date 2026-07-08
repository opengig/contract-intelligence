import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from './api';

export function useGetDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30000,
  });
}
