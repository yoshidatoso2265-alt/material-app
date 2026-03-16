/** ページネーション結果 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** APIレスポンス共通形式 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** 日付範囲（YYYY-MM-DD 形式） */
export interface DateRange {
  from: string;
  to: string;
}

/** ページネーションクエリパラメータ */
export interface PaginationQuery {
  page?: number;
  limit?: number;
}
