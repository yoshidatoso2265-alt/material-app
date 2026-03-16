import { apiClient } from './client'
import type { Paginated } from './materials'

export interface MaterialImport {
  id: number
  filename: string
  raw_file_path: string | null
  source_type: 'manual' | 'kaken_auto'
  row_count: number
  error_count: number
  duplicate_count: number
  status: 'processing' | 'completed' | 'partial' | 'failed'
  started_at: string | null
  finished_at: string | null
  imported_at: string
  deleted_at: string | null
}

export interface ImportRow {
  id: number
  import_id: number
  site_id: number | null
  raw_site_name: string | null
  order_date: string | null
  material_name: string
  amount: number | null
  is_duplicate: number
  has_error: number
  error_message: string | null
}

export interface UploadResult {
  importId: number
  rowCount: number
  errorCount: number
  duplicateCount: number
  status: string
  errors: string[]
}

export const importsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<{ data: Paginated<MaterialImport> }>('/imports', { params }).then((r) => r.data.data),

  getById: (id: number) =>
    apiClient.get<{ data: MaterialImport }>(`/imports/${id}`).then((r) => r.data.data),

  getRows: (id: number, params?: { page?: number; limit?: number }) =>
    apiClient.get<{ data: Paginated<ImportRow> }>(`/imports/${id}/rows`, { params }).then((r) => r.data.data),

  getErrors: (id: number) =>
    apiClient.get<{ data: ImportRow[] }>(`/imports/${id}/errors`).then((r) => r.data.data),

  upload: (file: File, encoding: string = 'utf8') => {
    const form = new FormData()
    form.append('file', file)
    form.append('encoding', encoding)
    return apiClient.post<{ data: UploadResult }>('/imports/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data)
  },

  softDelete: (id: number) =>
    apiClient.delete(`/imports/${id}`).then((r) => r.data),
}
