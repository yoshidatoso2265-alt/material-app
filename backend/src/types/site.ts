/** 現場マスター */
export interface Site {
  id: number;
  site_code: string | null;
  name: string;
  normalized_name: string; // 必ず保存（NOT NULL前提）
  status: 'active' | 'closed' | 'unknown';
  customer_id: number | null;
  created_at: string;
  updated_at: string;
}

/** 現場エイリアス */
export interface SiteAlias {
  id: number;
  site_id: number | null; // NULL = 未統合
  alias_name: string;     // CSV上の生表記（表示・監査用）
  normalized_alias: string; // 正規化済み（比較・候補抽出の主入力）
  confidence: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'auto';
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

/** 現場作成入力 */
export interface CreateSiteInput {
  name: string;
  site_code?: string;
  customer_id?: number;
}

/** 現場更新入力 */
export interface UpdateSiteInput {
  name?: string;
  site_code?: string;
  status?: 'active' | 'closed' | 'unknown';
  customer_id?: number;
}

/** 現場検索クエリ */
export interface SiteQuery {
  search?: string;
  status?: 'active' | 'closed' | 'unknown';
  page?: number;
  limit?: number;
}

/** エイリアス承認入力 */
export interface ApproveAliasInput {
  site_id: number;      // 統合先の site_id
  reviewed_by?: string;
}

/** エイリアス却下入力 */
export interface RejectAliasInput {
  reviewed_by?: string;
  new_site_name?: string; // 新規現場として登録する場合
}

/** 現場別集計 */
export interface SiteSummary {
  site_id: number;
  site_name: string;
  total_amount: number;
  row_count: number;
  period?: {
    from: string;
    to: string;
  };
}
