import { apiClient } from './client'

export interface MaterialItem {
  id: number
  import_id: number
  site_id: number | null
  site_name: string | null
  raw_site_name: string | null
  order_date: string | null
  delivery_date: string | null
  slip_number: string | null
  material_name: string
  spec: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  amount: number | null
  supplier: string | null
  import_filename: string
  imported_at: string
}

export interface MaterialFilter {
  search?: string
  site_id?: number
  date_from?: string
  date_to?: string
  import_id?: number
  page?: number
  limit?: number
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const materialsApi = {
  list: (params: MaterialFilter) =>
    apiClient.get<{ data: Paginated<MaterialItem> }>('/materials', { params }).then((r) => r.data.data),
  getById: (id: number) =>
    apiClient.get<{ data: MaterialItem }>(`/materials/${id}`).then((r) => r.data.data),
}
