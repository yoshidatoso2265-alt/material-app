/**
 * delivery-imports API クライアント
 */

import { apiClient } from './client';

// ============================================================
// 型定義
// ============================================================

export interface DeliveryImport {
  id: number;
  source_type: string;
  source_file_name: string | null;
  source_file_path: string | null;
  delivery_date: string | null;
  raw_orderer_name: string | null;
  raw_site_name: string | null;
  raw_person_name: string | null;
  matched_site_id: number | null;
  matched_site_name: string | null;
  site_match_status: 'matched' | 'candidate' | 'unmatched' | 'ignored';
  site_match_score: number | null;
  total_amount_ex_tax: number | null;
  total_tax: number | null;
  total_amount_in_tax: number | null;
  parse_status: 'success' | 'partial' | 'failed';
  parse_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryImportListItem extends DeliveryImport {
  line_count: number;
  top_items: string[];
}

export interface DeliveryImportLine {
  id: number;
  delivery_import_id: number;
  line_no: number;
  item_name_raw: string | null;
  item_name_normalized: string | null;
  spec_raw: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount_ex_tax: number | null;
  tax_amount: number | null;
  amount_in_tax: number | null;
  is_freight: number;
  is_misc_charge: number;
  raw_line_text: string | null;
}

export interface SiteMatchCandidate {
  id: number;
  delivery_import_id: number;
  raw_site_name: string;
  candidate_site_id: number | null;
  candidate_site_name: string | null;
  similarity_score: number | null;
  status: 'pending' | 'approved' | 'rejected';
}

export interface DeliveryImportDetail extends DeliveryImport {
  lines: DeliveryImportLine[];
  candidates: SiteMatchCandidate[];
  line_count: number;
}

export interface UnmatchedSiteGroup {
  raw_site_name: string;
  import_count: number;
  candidates: SiteMatchCandidate[];
}

export interface SiteSummaryRow {
  site_name: string;
  total_amount: number;
  import_count: number;
  last_delivery_date: string | null;
  item_count: number;
  unmatched_count: number;
}

export interface ItemSummaryRow {
  item_name_raw: string;
  total_amount: number;
  total_qty: number | null;
  unit: string | null;
  avg_unit_price: number | null;
  delivery_count: number;
  site_count: number;
}

export interface DateSummaryRow {
  delivery_date: string;
  total_amount: number;
  import_count: number;
}

export interface PersonSummaryRow {
  raw_person_name: string;
  total_amount: number;
  import_count: number;
}

export interface SiteItemSummaryRow {
  item_name: string;
  spec: string | null;
  total_qty: number | null;
  unit: string | null;
  avg_unit_price: number | null;
  total_amount_ex_tax: number;
  delivery_count: number;
  is_freight: number;
  is_misc_charge: number;
}

export interface ListParams {
  date_from?: string;
  date_to?: string;
  person_name?: string;
  raw_site_name?: string;
  no_site_name?: boolean;
  item_name?: string;
  unmatched_only?: boolean;
  parse_status?: 'success' | 'partial' | 'failed';
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UploadResult {
  data: {
    deliveryImport: DeliveryImport;
    lines: DeliveryImportLine[];
    candidates: SiteMatchCandidate[];
    warnings: string[];
  };
}

/** POST /update のレスポンス */
export interface UpdateResult {
  date_from: string;         // 取得対象期間（開始）
  date_to: string;           // 取得対象期間（終了）
  fetched_count: number;     // 一覧から取得した納品書数
  imported_count: number;    // 新規取込成功数
  skipped_count: number;     // 重複スキップ数
  failed_count: number;      // PDF取得・解析失敗数
  is_first_sync: boolean;    // 初回同期かどうか
  warnings: string[];
  executed_at: string;       // 実行日時 ISO 8601
  duration_ms: number;       // 処理時間（ミリ秒）
  error_summary?: string;    // 致命的エラー
}

export type ResolveSiteAction = 'match_existing' | 'create_alias' | 'keep_unmatched' | 'ignore';

// ============================================================
// API 関数
// ============================================================

export const deliveryImportsApi = {
  /**
   * pdf_inbox/ 内の未取込PDFを一括取込する
   * 「更新」ボタンから呼び出す
   */
  update: (params?: { date_from?: string }): Promise<{ data: UpdateResult }> =>
    apiClient.post('/delivery-imports/update', params ?? {}).then((r) => r.data),

  /** PDF ファイルをアップロードして解析 */
  uploadPdf: (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient
      .post('/delivery-imports/from-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  /** 一覧取得 */
  list: (params?: ListParams): Promise<PaginatedResult<DeliveryImportListItem>> =>
    apiClient.get('/delivery-imports', { params }).then((r) => r.data),

  /** 詳細取得（明細・候補含む） */
  getById: (id: number): Promise<{ data: DeliveryImportDetail }> =>
    apiClient.get(`/delivery-imports/${id}`).then((r) => r.data),

  /** 現場統合 */
  resolveSite: (
    id: number,
    action: ResolveSiteAction,
    opts?: { site_id?: number; create_alias?: boolean }
  ): Promise<{ success: boolean }> =>
    apiClient
      .post(`/delivery-imports/${id}/resolve-site`, { action, ...opts })
      .then((r) => r.data),

  /** 再解析 */
  reparse: (id: number): Promise<{ data: DeliveryImportDetail }> =>
    apiClient.post(`/delivery-imports/${id}/reparse`).then((r) => r.data),

  /** 未分類現場名グループ */
  unmatchedSites: (): Promise<{ data: UnmatchedSiteGroup[]; total: number }> =>
    apiClient.get('/delivery-imports/unmatched-sites').then((r) => r.data),

  /** 集計: 現場別 */
  summaryBySite: (params?: {
    date_from?: string;
    date_to?: string;
    person_name?: string;
  }): Promise<{ data: SiteSummaryRow[] }> =>
    apiClient.get('/delivery-imports/summary/by-site', { params }).then((r) => r.data),

  /** 集計: 材料別 */
  summaryByItem: (params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{ data: ItemSummaryRow[] }> =>
    apiClient.get('/delivery-imports/summary/by-item', { params }).then((r) => r.data),

  /** 集計: 日付別 */
  summaryByDate: (params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{ data: DateSummaryRow[] }> =>
    apiClient.get('/delivery-imports/summary/by-date', { params }).then((r) => r.data),

  /** 集計: 担当者別 */
  summaryByPerson: (params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{ data: PersonSummaryRow[] }> =>
    apiClient.get('/delivery-imports/summary/by-person', { params }).then((r) => r.data),

  /** 集計: 現場別資材明細 */
  summarySiteItems: (params: {
    site_name: string;
    date_from?: string;
    date_to?: string;
  }): Promise<{ data: SiteItemSummaryRow[] }> =>
    apiClient.get('/delivery-imports/summary/site-items', { params }).then((r) => r.data),
};
