/** ダッシュボードサマリー */
export interface DashboardSummary {
  /** 当月集計 */
  currentMonth: {
    total: number;       // 材料費合計
    siteCount: number;   // 現場数
    rowCount: number;    // 明細行数
    period: {
      from: string;      // YYYY-MM-DD
      to: string;        // YYYY-MM-DD
    };
  };

  /** 現場別費用ランキング TOP5 */
  topSites: Array<{
    site_id: number | null;
    site_name: string;
    total_amount: number;
    row_count: number;
  }>;

  /** 最近のCSV取込履歴 */
  recentImports: Array<{
    id: number;
    filename: string;
    row_count: number;
    status: string;
    started_at: string | null;
    imported_at: string;
  }>;

  /** 未解決エイリアス件数（pending） */
  pendingAliasCount: number;

  /** 未分類（site_id = NULL）の集計 */
  unclassified: {
    amount: number;
    rowCount: number;
  };
}

/** 期間指定集計クエリ */
export interface SummaryQuery {
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
}
