/** 材料費一覧表示用（import_rows + sites を JOIN した表示モデル） */
export interface MaterialListItem {
  id: number;            // material_import_rows.id
  import_id: number;
  site_id: number | null;
  site_name: string | null;   // sites.name（JOIN後）
  raw_site_name: string | null;
  order_date: string | null;
  delivery_date: string | null;
  slip_number: string | null;
  material_name: string;
  spec: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  supplier: string | null;
  import_filename: string;    // material_imports.filename
  imported_at: string;
}

/** 材料一覧検索フィルタ */
export interface MaterialFilter {
  search?: string;        // 材料名・現場名・伝票番号のフリーワード
  site_id?: number;
  date_from?: string;     // YYYY-MM-DD
  date_to?: string;
  import_id?: number;
  page?: number;
  limit?: number;
}
