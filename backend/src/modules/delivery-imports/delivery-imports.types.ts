/**
 * delivery-imports モジュール 型定義
 */

// ============================================================
// DB モデル型
// ============================================================

export interface DeliveryImport {
  id: number;
  source_type: string;
  source_file_name: string | null;
  source_file_path: string | null;
  source_unique_key: string | null;   // PDF内容のSHA-256（重複防止）
  raw_text: string | null;
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
  created_at: string;
}

export interface SiteMatchCandidate {
  id: number;
  delivery_import_id: number;
  raw_site_name: string;
  candidate_site_id: number | null;
  candidate_site_name: string | null;
  similarity_score: number | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// ============================================================
// API 入出力型
// ============================================================

export interface DeliveryImportDetail extends DeliveryImport {
  lines: DeliveryImportLine[];
  candidates: SiteMatchCandidate[];
  line_count: number;
}

export interface DeliveryImportListItem extends DeliveryImport {
  line_count: number;
  top_items: string[];  // 主要商品名（運賃・割増除く）最大3件
}

export interface DeliveryImportQuery {
  date_from?: string;
  date_to?: string;
  person_name?: string;
  site_id?: number;
  raw_site_name?: string;
  no_site_name?: boolean;
  item_name?: string;
  unmatched_only?: boolean;
  parse_status?: 'success' | 'partial' | 'failed';
  page?: number;
  limit?: number;
}

export interface ResolveSiteInput {
  action: 'match_existing' | 'create_alias' | 'keep_unmatched' | 'ignore';
  site_id?: number;
  create_alias?: boolean;
}

// ============================================================
// 集計型
// ============================================================

export interface SiteSummaryRow {
  site_name: string;           // matched_site_name or raw_site_name
  total_amount: number;
  import_count: number;
  last_delivery_date: string | null;
  item_count: number;          // 明細行数（運賃・割増除く）
  unmatched_count: number;     // 未確定（candidate/unmatched）の取込件数
}

export interface ItemSummaryRow {
  item_name_raw: string;
  total_amount_ex_tax: number;
  total_tax: number;
  total_amount_in_tax: number;
  total_qty: number | null;
  unit: string | null;
  avg_unit_price: number | null;
  delivery_count: number;
  site_count: number;
  first_delivery_date: string | null;
  last_delivery_date: string | null;
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

export interface UnmatchedSiteGroup {
  raw_site_name: string;
  import_count: number;
  candidates: SiteMatchCandidate[];
}

// ============================================================
// サービス返却型
// ============================================================

export interface ImportPdfResult {
  deliveryImport: DeliveryImport;
  lines: DeliveryImportLine[];
  candidates: SiteMatchCandidate[];
  warnings: string[];
}

/** POST /update のレスポンス */
export interface UpdateResult {
  date_from: string;         // 取得対象期間（開始）YYYY-MM-DD
  date_to: string;           // 取得対象期間（終了）YYYY-MM-DD
  fetched_count: number;     // 一覧から取得した納品書数
  imported_count: number;    // 新規取込成功数
  skipped_count: number;     // 重複スキップ数
  failed_count: number;      // PDF取得・解析失敗数
  is_first_sync: boolean;    // 初回同期かどうか
  warnings: string[];        // 各ファイルの警告メッセージ
  executed_at: string;       // 実行日時（ISO 8601）
  duration_ms: number;       // 処理時間（ミリ秒）
  error_summary?: string;    // 致命的エラー発生時のメッセージ
}
