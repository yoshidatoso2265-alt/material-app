/**
 * scraper.service.ts - オーケストレーター
 *
 * /probe  : ログインして post-login ページの HTML/SS を保存（セレクタ確認用）
 * /run    : ログイン → 納品書ページ → 日付入力 → CSVダウンロード → DB保存
 * /artifacts: 保存済みアーティファクト一覧
 */

import path from 'path';
import fs from 'fs';
import { launchBrowser, closeBrowser, SCREENSHOTS_DIR } from './kaken/kakenClient';
import { login } from './kaken/kakenLogin';
import { goToDeliveryPage, setDateRangeAndSearch } from './kaken/kakenNavigator';
import { downloadCsv } from './kaken/kakenDownloader';
import { parseCsvBuffer } from '../imports/csv/csvParser';
import { buildColumnMapping, normalizeRow } from '../imports/csv/csvNormalizer';
import { checkDuplicate } from '../imports/csv/duplicateDetector';
import { importsRepository } from '../imports/imports.repository';
import { sitesRepository } from '../sites/sites.repository';
import { normalizeSiteName } from '../../utils/siteNameNormalizer';
import { getDb } from '../../db/client';
import { logger } from '../../utils/logger';

export interface ProbeResult {
  success: boolean;
  message: string;
  files: string[];
}

export interface RunResult {
  success: boolean;
  message: string;
  /** 取得期間（開始） */
  dateFrom: string;
  /** 取得期間（終了） */
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

export interface BackfillResult {
  success: boolean;
  message: string;
  totalFetched: number;
  totalInserted: number;
  totalSkipped: number;
  chunks: number;
  chunkResults: Array<{
    dateFrom: string;
    dateTo: string;
    fetched: number;
    inserted: number;
    skipped: number;
    success: boolean;
    error?: string;
  }>;
}

/** 認証情報をロードして検証 */
function loadCredentials(): { loginId: string; password: string } {
  const loginId = process.env.KAKEN_LOGIN_ID ?? '';
  const password = process.env.KAKEN_LOGIN_PASSWORD ?? '';
  if (!loginId || !password) {
    throw new Error('.env に KAKEN_LOGIN_ID と KAKEN_LOGIN_PASSWORD が設定されていません');
  }
  return { loginId, password };
}

/** scraper_runs テーブルにレコードを作成し、ID を返す */
function createRunRecord(runType: 'auto' | 'manual' | 'backfill', dateFrom: string, dateTo: string): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO scraper_runs (run_type, date_from, date_to, started_at)
     VALUES (?, ?, ?, ?)`
  ).run(runType, dateFrom, dateTo, new Date().toISOString());
  return result.lastInsertRowid as number;
}

/** scraper_runs テーブルのレコードを完了/失敗状態に更新する */
function finishRunRecord(runId: number, result: RunResult): void {
  const db = getDb();
  db.prepare(
    `UPDATE scraper_runs
     SET status = ?, fetched_count = ?, inserted_count = ?, skipped_count = ?,
         mode = ?, error_message = ?, finished_at = ?
     WHERE id = ?`
  ).run(
    result.success ? 'completed' : 'failed',
    result.fetched,
    result.inserted,
    result.skipped,
    result.mode,
    result.errorDetail ?? null,
    new Date().toISOString(),
    runId
  );
}

/**
 * /probe: ログインして post-login ページの HTML/SS を保存
 */
export async function runProbe(): Promise<ProbeResult> {
  let creds: { loginId: string; password: string };
  try {
    creds = loadCredentials();
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message,
      files: [],
    };
  }

  const session = await launchBrowser(false);
  const files: string[] = [];

  try {
    await login(session.page, creds.loginId, creds.password);

    if (fs.existsSync(SCREENSHOTS_DIR)) {
      const all = fs.readdirSync(SCREENSHOTS_DIR)
        .filter((f) => f.startsWith('probe-'))
        .sort()
        .map((f) => path.join('storage/screenshots', f));
      files.push(...all);
    }

    return {
      success: true,
      message: `プローブ完了。${files.length} 件のファイルを保存しました。`,
      files,
    };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`Probe error: ${msg}`);
    return { success: false, message: msg, files };
  } finally {
    await closeBrowser(session);
  }
}

/**
 * /run: フルフロー実行
 */
export async function runScraper(options: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<RunResult> {
  const creds = loadCredentials();

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const dateFrom = options.dateFrom ?? formatDate(sevenDaysAgo);
  const dateTo   = options.dateTo   ?? formatDate(today);

  logger.info(`Scraper: 実行開始 dateFrom=${dateFrom} dateTo=${dateTo}`);

  const session = await launchBrowser(false);

  try {
    await login(session.page, creds.loginId, creds.password);
    await goToDeliveryPage(session.page);
    await setDateRangeAndSearch(session.page, dateFrom, dateTo);

    const { buffer, filename } = await downloadCsv(session.page, session.context);
    const mode: RunResult['mode'] = filename.startsWith('kaken_grid_')
      ? 'grid_fallback'
      : 'csv_download';
    const isProvisionalMode = filename.startsWith('kaken_grid_');

    const { rowsInserted, skippedDuplicates, fetchedCount, importId } =
      await processCsvBuffer(buffer, filename, dateFrom, dateTo, isProvisionalMode);

    logger.info(`Scraper: 完了 fetched=${fetchedCount} inserted=${rowsInserted} skipped=${skippedDuplicates} mode=${mode}`);
    return {
      success: true,
      message: `自動取得完了: ${rowsInserted} 件保存 / ${skippedDuplicates} 件重複スキップ`,
      dateFrom,
      dateTo,
      fetched: fetchedCount,
      inserted: rowsInserted,
      skipped: skippedDuplicates,
      mode,
      importId,
    };
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`Scraper error: ${msg}`);
    return {
      success: false,
      message: '自動取得に失敗しました',
      dateFrom: options.dateFrom ?? '',
      dateTo: options.dateTo ?? '',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      mode: 'grid_fallback',
      errorDetail: msg,
    };
  } finally {
    await closeBrowser(session);
  }
}

/**
 * scraper_runs 履歴つきで実行する（auto / manual 用）
 */
export async function runScraperWithHistory(
  runType: 'auto' | 'manual',
  options: { dateFrom?: string; dateTo?: string } = {}
): Promise<RunResult> {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const dateFrom = options.dateFrom ?? formatDate(sevenDaysAgo);
  const dateTo = options.dateTo ?? formatDate(today);

  const runId = createRunRecord(runType, dateFrom, dateTo);
  const result = await runScraper({ dateFrom, dateTo });
  finishRunRecord(runId, result);
  return result;
}

/**
 * バックフィル: 指定期間を chunkDays 単位で分割して順次実行
 */
export async function runBackfill(opts: {
  dateFrom: string;
  dateTo: string;
  chunkDays?: number;
  onChunkDone?: (chunkIndex: number, total: number, chunkResult: BackfillResult['chunkResults'][0]) => void;
}): Promise<BackfillResult> {
  const chunkDays = opts.chunkDays ?? 7;
  const chunks = buildDateChunks(opts.dateFrom, opts.dateTo, chunkDays);

  logger.info(`Backfill: ${chunks.length} チャンク (${opts.dateFrom}〜${opts.dateTo}, ${chunkDays}日単位)`);

  const chunkResults: BackfillResult['chunkResults'] = [];
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  const runId = createRunRecord('backfill', opts.dateFrom, opts.dateTo);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.info(`Backfill: チャンク ${i + 1}/${chunks.length}: ${chunk.from}〜${chunk.to}`);
    try {
      const result = await runScraper({ dateFrom: chunk.from, dateTo: chunk.to });
      chunkResults.push({
        dateFrom: chunk.from,
        dateTo: chunk.to,
        fetched: result.fetched,
        inserted: result.inserted,
        skipped: result.skipped,
        success: result.success,
        error: result.errorDetail,
      });
      totalFetched += result.fetched;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
    } catch (e) {
      const errMsg = (e as Error).message;
      chunkResults.push({
        dateFrom: chunk.from,
        dateTo: chunk.to,
        fetched: 0, inserted: 0, skipped: 0,
        success: false, error: errMsg,
      });
      logger.error(`Backfill: チャンク失敗 ${chunk.from}〜${chunk.to}: ${errMsg}`);
    }
    if (opts.onChunkDone) {
      opts.onChunkDone(i, chunks.length, chunkResults[chunkResults.length - 1]);
    }
  }

  const allSuccess = chunkResults.every(r => r.success);
  const backfillResult: BackfillResult = {
    success: allSuccess,
    message: `バックフィル完了: ${totalInserted} 件保存 / ${totalSkipped} 件重複スキップ (${chunks.length} チャンク)`,
    totalFetched,
    totalInserted,
    totalSkipped,
    chunks: chunks.length,
    chunkResults,
  };

  // Update the run record with totals
  const db = getDb();
  db.prepare(
    `UPDATE scraper_runs
     SET status = ?, fetched_count = ?, inserted_count = ?, skipped_count = ?,
         mode = 'grid_fallback', finished_at = ?
     WHERE id = ?`
  ).run(
    allSuccess ? 'completed' : 'failed',
    totalFetched, totalInserted, totalSkipped,
    new Date().toISOString(),
    runId
  );

  return backfillResult;
}

/**
 * 実行履歴を取得する
 */
export function getRunHistory(limit = 20): ScraperRunRecord[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM scraper_runs
     ORDER BY started_at DESC
     LIMIT ?`
  ).all(limit) as ScraperRunRecord[];
}

/** 最後に実行した kaken_auto 取込の結果を返す */
export function getLastRunResult(): {
  importId: number;
  status: string;
  rowCount: number;
  duplicateCount: number;
  errorCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  finishedAt: string | null;
  startedAt: string;
} | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, status, row_count, duplicate_count, error_count,
           period_from, period_to, finished_at, started_at
    FROM material_imports
    WHERE source_type = 'kaken_auto'
    ORDER BY id DESC
    LIMIT 1
  `).get() as {
    id: number; status: string; row_count: number; duplicate_count: number;
    error_count: number; period_from: string | null; period_to: string | null;
    finished_at: string | null; started_at: string;
  } | undefined;

  if (!row) return null;
  return {
    importId:       row.id,
    status:         row.status,
    rowCount:       row.row_count,
    duplicateCount: row.duplicate_count,
    errorCount:     row.error_count,
    periodFrom:     row.period_from,
    periodTo:       row.period_to,
    finishedAt:     row.finished_at,
    startedAt:      row.started_at,
  };
}

/** 保存済みアーティファクト一覧 */
export function listArtifacts(): string[] {
  if (!fs.existsSync(SCREENSHOTS_DIR)) return [];
  return fs.readdirSync(SCREENSHOTS_DIR)
    .sort()
    .reverse()
    .map((f) => path.join('storage/screenshots', f));
}

/** CSV バッファ解析 → DB 保存 */
async function processCsvBuffer(
  buffer: Buffer,
  filename: string,
  dateFrom: string,
  dateTo: string,
  isProvisionalMode: boolean
): Promise<{ rowsInserted: number; skippedDuplicates: number; fetchedCount: number; importId: number | undefined }> {
  const db = getDb();
  // グリッドから自動生成したCSVはUTF-8、サイトから直接ダウンロードしたCSVはShift-JISの可能性がある
  // ファイル名でグリッド生成CSVを識別してエンコーディングを切り替える
  const csvEncoding = filename.startsWith('kaken_grid_') ? 'utf8' : 'shift_jis';
  const allRecords = parseCsvBuffer(buffer, { encoding: csvEncoding });

  if (allRecords.length === 0) {
    throw new Error('CSVを解析しましたが、データが0件でした。');
  }

  // GeneXus サーバーサイドフィルタが効かない場合のクライアントサイドフィルタ
  // 納品日が指定の日付範囲外の行をスキップする
  const fromYMD = dateFrom.replace(/-/g, '/'); // YYYY-MM-DD → YYYY/MM/DD
  const toYMD   = dateTo.replace(/-/g, '/');
  const records = allRecords.filter(r => {
    const dDate = r['納品日'];
    if (!dDate) return true; // 日付なしは通す
    return dDate >= fromYMD && dDate <= toYMD;
  });
  const filteredOut = allRecords.length - records.length;
  if (filteredOut > 0) {
    logger.info(`Scraper: 日付範囲外を除外: ${filteredOut} 件 (${dateFrom}〜${dateTo})`);
  }
  if (records.length === 0) {
    logger.info(`Scraper: 指定期間 (${dateFrom}〜${dateTo}) のデータなし`);
    return { rowsInserted: 0, skippedDuplicates: 0, fetchedCount: allRecords.length, importId: undefined };
  }

  // ヘッダー列名を取得してカラムマッピングを構築
  const headers = Object.keys(records[0]);
  const columnMap = buildColumnMapping(headers);
  logger.info(`CSV解析: ${records.length} 行, ヘッダー: ${headers.join(', ')}`);

  // import レコード作成（source_type='kaken_auto'）
  const importRecord = importsRepository.createImport({
    filename,
    source_type: 'kaken_auto',
    period_from: dateFrom,
    period_to:   dateTo,
  });

  let rowsInserted = 0;
  let skippedDuplicates = 0;
  let errorCount = 0;

  const insertAll = db.transaction(() => {
    for (let i = 0; i < records.length; i++) {
      const raw = records[i];

      // 正規化
      const result = normalizeRow(raw, columnMap, i);

      if (result.hasError || !result.row.material_name) {
        importsRepository.insertRow({
          import_id:        importRecord.id,
          row_index:        i,
          raw_site_name:    null,
          material_name:    result.row.material_name || '(エラー)',
          spec:             null,
          quantity:         null,
          unit:             null,
          unit_price:       null,
          amount:           null,
          supplier:         null,
          order_date:       null,
          delivery_date:    null,
          slip_number:      null,
          source_row_hash:  `error-${importRecord.id}-${i}`,
          is_duplicate:     0,
          duplicate_of_id:  null,
          has_error:        1,
          error_message:    result.errors.join(', '),
          site_id:          null,
          site_alias_id:    null,
        });
        errorCount++;
        continue;
      }

      const row = result.row;

      // 重複チェック
      const dupResult = checkDuplicate(db, {
        order_date:    row.order_date,
        delivery_date: row.delivery_date,
        slip_number:   row.slip_number,
        raw_site_name: row.raw_site_name,
        material_name: row.material_name,
        spec:          row.spec,
        quantity:      row.quantity,
        unit:          row.unit,
        unit_price:    row.unit_price,
        amount:        row.amount,
      });

      if (dupResult.isDuplicate) {
        importsRepository.insertRow({
          import_id:       importRecord.id,
          row_index:       i,
          raw_site_name:   row.raw_site_name,
          material_name:   row.material_name,
          spec:            row.spec,
          quantity:        row.quantity,
          unit:            row.unit,
          unit_price:      row.unit_price,
          amount:          row.amount,
          supplier:        row.supplier,
          order_date:      row.order_date,
          delivery_date:   row.delivery_date,
          slip_number:     row.slip_number,
          source_row_hash: dupResult.sourceRowHash,
          is_duplicate:    1,
          duplicate_of_id: dupResult.duplicateOfId,
          has_error:       0,
          error_message:   null,
          site_id:         null,
          site_alias_id:   null,
        });
        skippedDuplicates++;
        continue;
      }

      // サイト名マッチング（exact match のみ）
      let siteId: number | null = null;
      if (row.raw_site_name) {
        const normalizedName = normalizeSiteName(row.raw_site_name);
        const matched = sitesRepository.findByNormalizedName(normalizedName);
        if (matched) siteId = matched.id;
      }

      importsRepository.insertRow({
        import_id:            importRecord.id,
        row_index:            i,
        raw_site_name:        row.raw_site_name,
        material_name:        row.material_name,
        spec:                 row.spec,
        quantity:             row.quantity,
        unit:                 row.unit,
        unit_price:           row.unit_price,
        amount:               row.amount,
        supplier:             row.supplier,
        order_date:           row.order_date,
        delivery_date:        row.delivery_date,
        slip_number:          row.slip_number,
        source_row_hash:      dupResult.sourceRowHash,
        is_duplicate:         0,
        duplicate_of_id:      null,
        has_error:            0,
        error_message:        null,
        site_id:              siteId,
        site_alias_id:        null,
        normalized_site_name: row.raw_site_name ? normalizeSiteName(row.raw_site_name) : null,
        is_provisional_name:  isProvisionalMode ? 1 : 0,
      });
      rowsInserted++;
    }
  });

  insertAll();

  importsRepository.updateImportStatus(importRecord.id, {
    status:     errorCount === records.length ? 'failed'
              : errorCount > 0               ? 'partial'
              : 'completed',
    row_count:       rowsInserted,
    error_count:     errorCount,
    duplicate_count: skippedDuplicates,
    finished_at:     new Date().toISOString(),
  });

  return {
    rowsInserted,
    skippedDuplicates,
    fetchedCount: allRecords.length,
    importId: importRecord.id,
  };
}

/** 日付範囲を chunkDays 単位のチャンクに分割する */
function buildDateChunks(
  from: string,
  to: string,
  chunkDays: number
): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let current = new Date(from);
  const end = new Date(to);

  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push({ from: formatDate(current), to: formatDate(chunkEnd) });
    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }
  return chunks;
}

/** YYYY-MM-DD 形式 */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
