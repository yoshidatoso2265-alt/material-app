import { apiClient } from './client'

export interface DashboardSummary {
  currentMonth: {
    total: number
    siteCount: number
    rowCount: number
    period: { from: string; to: string }
  }
  topSites: Array<{
    site_id: number | null
    site_name: string
    total_amount: number
    row_count: number
  }>
  recentImports: Array<{
    id: number
    filename: string
    row_count: number
    status: string
    started_at: string | null
    imported_at: string
  }>
  pendingAliasCount: number
  unclassified: { amount: number; rowCount: number }
}

export const dashboardApi = {
  getSummary: (params?: { date_from?: string; date_to?: string }) =>
    apiClient.get<{ data: DashboardSummary }>('/dashboard/summary', { params }).then((r) => r.data.data),
}
