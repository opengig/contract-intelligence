import type { DashboardStats } from '@repo/types';
import { apiClient } from '@/lib/api-client';

export const dashboardApi = {
  getStats: () => apiClient<DashboardStats>('/dashboard/stats'),
};
