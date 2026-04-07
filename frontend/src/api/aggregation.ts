import { apiClient } from './client';

export interface SiteAggRow {
  raw_site_name: string;
  display_name: string;
  total_amount: number;
  row_count: number;
  slip_count: number;
  last_delivery_date: string | null;
  avg_amount: number;
}

export interface SiteAggDetail {
  display_name: string;
  total_amount: number;
  row_count: number;
  slip_count: number;
  last_delivery_date: string | null;
  monthly: Array<{ month: string; amount: number; count: number }>;
  rows: Array<{
    id: number;
    delivery_date: string | null;
    order_date: string | null;
    slip_number: string | null;
    material_name: string;
    amount: number;
    source_type: string;
    is_provisional_name: number;
  }>;
}

export const aggregationApi = {
  sites: (params?: { search?: string; date_from?: string; date_to?: string }) =>
    apiClient
      .get<{ data: SiteAggRow[]; total: number }>('/aggregation/sites', { params })
      .then((r) => r.data),

  siteDetail: (siteName: string, params?: { date_from?: string; date_to?: string }) =>
    apiClient
      .get<SiteAggDetail>(`/aggregation/sites/${encodeURIComponent(siteName)}`, { params })
      .then((r) => r.data),
};
