import { apiClient } from './client'
import type { Paginated } from './materials'

export interface Site {
  id: number
  site_code: string | null
  name: string
  normalized_name: string
  status: 'active' | 'closed' | 'unknown'
  customer_id: number | null
  created_at: string
  updated_at: string
}

export interface SiteAlias {
  id: number
  site_id: number | null
  alias_name: string
  normalized_alias: string
  confidence: number | null
  status: 'pending' | 'approved' | 'rejected' | 'auto'
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  candidates?: Array<{ siteId: number; siteName: string; normalizedName: string; score: number }>
}

export interface SiteSummary {
  site: Site
  total_amount: number
  row_count: number
}

export const sitesApi = {
  list: (params?: { search?: string; status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ data: Paginated<Site> }>('/sites', { params }).then((r) => r.data.data),

  getById: (id: number) =>
    apiClient.get<{ data: Site }>(`/sites/${id}`).then((r) => r.data.data),

  create: (body: { name: string; site_code?: string }) =>
    apiClient.post<{ data: Site }>('/sites', body).then((r) => r.data.data),

  update: (id: number, body: Partial<Site>) =>
    apiClient.put<{ data: Site }>(`/sites/${id}`, body).then((r) => r.data.data),

  getMaterials: (id: number, params?: { date_from?: string; date_to?: string; page?: number }) =>
    apiClient.get<{ data: Paginated<Record<string, unknown>> }>(`/sites/${id}/materials`, { params }).then((r) => r.data.data),

  getSummary: (id: number, params?: { date_from?: string; date_to?: string }) =>
    apiClient.get<{ data: SiteSummary }>(`/sites/${id}/summary`, { params }).then((r) => r.data.data),

  getPendingAliases: () =>
    apiClient.get<{ data: SiteAlias[] }>('/sites/aliases/pending').then((r) => r.data.data),

  getAliasCandidates: () =>
    apiClient.get<{ data: SiteAlias[] }>('/sites/aliases/candidates').then((r) => r.data.data),

  approveAlias: (id: number, body: { site_id: number; reviewed_by?: string }) =>
    apiClient.post<{ data: SiteAlias }>(`/sites/aliases/${id}/approve`, body).then((r) => r.data.data),

  rejectAlias: (id: number, body: { reviewed_by?: string; new_site_name?: string }) =>
    apiClient.post<{ data: { alias: SiteAlias; newSite?: Site } }>(`/sites/aliases/${id}/reject`, body).then((r) => r.data.data),
}
