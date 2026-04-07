import { apiClient } from './client';

export interface ScraperRunInput {
  dateFrom?: string;
  dateTo?: string;
}

/** POST /api/scraper/run のレスポンス（backend RunResult に合わせる） */
export interface ScraperRunResult {
  success: boolean;
  message: string;
  dateFrom: string;
  dateTo: string;
  /** グリッドから取得した総行数（クライアントフィルタ前） */
  fetched: number;
  /** DB に新規保存した件数 */
  inserted: number;
  /** 重複スキップした件数 */
  skipped: number;
  /** データ取得モード */
  mode: 'grid_fallback' | 'csv_download';
  /** 保存があった場合の import ID */
  importId?: number;
  /** 失敗時の詳細エラー */
  errorDetail?: string;
}

export interface ProbeResult {
  success: boolean;
  message: string;
  files: string[];
}

/** GET /api/scraper/last-result のレスポンス */
export interface LastRunResult {
  importId: number;
  status: string;
  rowCount: number;
  duplicateCount: number;
  errorCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  finishedAt: string | null;
  startedAt: string;
}

export interface BackfillChunkResult {
  dateFrom: string;
  dateTo: string;
  fetched: number;
  inserted: number;
  skipped: number;
  success: boolean;
  error?: string;
}

export interface BackfillResult {
  success: boolean;
  message: string;
  totalFetched: number;
  totalInserted: number;
  totalSkipped: number;
  chunks: number;
  chunkResults: BackfillChunkResult[];
}

export interface ScraperRunRecord {
  id: number;
  run_type: 'auto' | 'manual' | 'backfill';
  status: 'running' | 'completed' | 'failed';
  date_from: string | null;
  date_to: string | null;
  fetched_count: number;
  inserted_count: number;
  skipped_count: number;
  mode: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export const scraperApi = {
  run: (input: ScraperRunInput = {}) =>
    apiClient.post<ScraperRunResult>('/scraper/run', input).then((r) => r.data),

  probe: () =>
    apiClient.post<ProbeResult>('/scraper/probe').then((r) => r.data),

  artifacts: () =>
    apiClient
      .get<{ files: string[] }>('/scraper/artifacts')
      .then((r) => r.data.files),

  lastResult: () =>
    apiClient.get<LastRunResult | null>('/scraper/last-result').then((r) => r.data),

  backfill: (input: { dateFrom?: string; dateTo?: string; chunkDays?: number }) =>
    apiClient.post<BackfillResult>('/scraper/backfill', input).then((r) => r.data),

  history: (limit = 20) =>
    apiClient.get<ScraperRunRecord[]>(`/scraper/history?limit=${limit}`).then((r) => r.data),
};
