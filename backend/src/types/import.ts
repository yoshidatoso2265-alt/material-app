/** CSV取込バッチ */
export interface MaterialImport {
  id: number;
  filename: string;
  raw_file_path: string | null;
  source_type: 'manual' | 'kaken_auto';
  period_from: string | null;
  period_to: string | null;
  row_count: number;
  error_count: number;
  duplicate_count: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  imported_at: string;
  imported_by: string | null;
  deleted_at: string | null;
}

/** CSV取込明細行 */
export interface MaterialImportRow {
  id: number;
  import_id: number;
  site_id: number | null;
  site_alias_id: number | null;
  raw_site_name: string | null;
  order_date: string | null;
  delivery_date: string | null;
  slip_number: string | null;
  material_name: string;
  spec: string | null;
  // SQLite=REAL / PostgreSQL移行時=DECIMAL(10,3)
  quantity: number | null;
  unit: string | null;
  // SQLite=REAL / PostgreSQL移行時=DECIMAL(12,2)
  unit_price: number | null;
  amount: number | null;
  supplier: string | null;
  row_index: number | null;
  source_row_hash: string;
  is_duplicate: number; // 0=通常, 1=重複
  duplicate_of_id: number | null;
  has_error: number;    // 0=正常, 1=エラー
  error_message: string | null;
  normalized_site_name?: string | null;
  is_provisional_name?: number;
  created_at: string;
}

/** 取込作成入力 */
export interface CreateImportInput {
  filename: string;
  source_type?: 'manual' | 'kaken_auto';
  period_from?: string;
  period_to?: string;
  imported_by?: string;
}

/** 取込ステータス更新 */
export interface UpdateImportStatusInput {
  status: 'completed' | 'partial' | 'failed';
  row_count?: number;
  error_count?: number;
  duplicate_count?: number;
  raw_file_path?: string;
  finished_at?: string;
}

/** 取込一覧クエリ */
export interface ImportQuery {
  page?: number;
  limit?: number;
  status?: string;
  source_type?: string;
}

/** 取込サマリー（一覧表示用） */
export interface ImportSummary {
  id: number;
  filename: string;
  source_type: string;
  row_count: number;
  error_count: number;
  duplicate_count: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  imported_at: string;
}
