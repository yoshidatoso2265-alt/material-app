/**
 * delivery-imports サービス
 *
 * 責務:
 *   - PDF取込フロー全体のオーケストレーション
 *   - 現場名マッチング（完全一致 → 類似候補 → 未分類）
 *   - resolve-site 承認フロー
 *   - 集計データの提供
 *
 * 設計:
 *   - 材料名は自動統合しない（item_name_raw を正とする）
 *   - 現場名のみ類似判定を行い、ユーザー確認後に確定する
 *   - AI 補助は feature flag (ENABLE_AI_SITE_INFERENCE) でON/OFF可能
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { normalizeSiteName } from '../../utils/siteNameNormalizer';
import { findSimilarSites } from '../../utils/siteNameMatcher';
import { sitesRepository } from '../sites/sites.repository';
import { getDb } from '../../db/client';
import { PaginatedResult } from '../../types/common';

// Kaken スクレイパー（PDFダウンロード用）
import { launchBrowser, closeBrowser } from '../scraper/kaken/kakenClient';
import { login } from '../scraper/kaken/kakenLogin';
import {
  goToDeliveryPage,
  setDateRangeAndSearch,
  readGridData,
  getTotalPages,
  clickPageNumber,
  selectCurrentPageRows,
} from '../scraper/kaken/kakenNavigator';
import { downloadZipBuffer, extractPdfsFromZip } from '../scraper/kaken/kakenDownloader';
// import { downloadPdfByPath } from '../scraper/kaken/kakenPdfFetcher'; // gxdownload は 404 のため未使用

import { extractPdfTextFromBuffer } from './pdf/pdfExtractor';
import { extractDeliverySlip } from '../../utils/geminiClient';

import * as repo from './delivery-imports.repository';
import {
  DeliveryImportDetail,
  DeliveryImportListItem,
  DeliveryImportQuery,
  DeliveryImportLine,
  SiteMatchCandidate,
  ImportPdfResult,
  ResolveSiteInput,
  SiteSummaryRow,
  ItemSummaryRow,
  DateSummaryRow,
  PersonSummaryRow,
  UnmatchedSiteGroup,
  UpdateResult,
} from './delivery-imports.types';

// ============================================================
// ストレージパス
// ============================================================

// PDF保存は廃止。ストレージパス関数は不要。

// ============================================================
// 現場名マッチング
// ============================================================

interface SiteMatchResult {
  status: 'matched' | 'candidate' | 'unmatched';
  matchedSiteId?: number;
  matchedSiteName?: string;
  matchScore?: number;
  candidates: Array<{ siteId: number; siteName: string; score: number }>;
}

/**
 * 現場名の3段階マッチング
 * Step1: 完全一致 (raw/normalized/alias)
 * Step2: 類似候補抽出 (Levenshtein)
 * Step3: 未マッチ
 */
export function matchSiteForDeliveryImport(rawSiteName: string): SiteMatchResult {
  if (!rawSiteName || rawSiteName.trim() === '') {
    return { status: 'unmatched', candidates: [] };
  }

  const normalized = normalizeSiteName(rawSiteName);

  // Step 1a: normalized_name での完全一致
  const exactSite = sitesRepository.findByNormalizedName(normalized);
  if (exactSite) {
    return {
      status: 'matched',
      matchedSiteId: exactSite.id,
      matchedSiteName: exactSite.name,
      matchScore: 1.0,
      candidates: [],
    };
  }

  // Step 1b: site_aliases での完全一致
  const exactAlias = sitesRepository.findAliasByNormalizedName(normalized);
  if (exactAlias && exactAlias.site_id) {
    const site = sitesRepository.findById(exactAlias.site_id);
    if (site) {
      return {
        status: 'matched',
        matchedSiteId: site.id,
        matchedSiteName: site.name,
        matchScore: 1.0,
        candidates: [],
      };
    }
  }

  // Step 2: 類似候補抽出
  const allSites = sitesRepository.findAllForMatching();
  const similar = findSimilarSites(normalized, allSites);

  if (similar.length > 0) {
    return {
      status: 'candidate',
      candidates: similar.slice(0, 5).map((s) => ({
        siteId: s.siteId,
        siteName: s.siteName,
        score: s.score,
      })),
    };
  }

  // Step 3: 未マッチ
  return { status: 'unmatched', candidates: [] };
}

// ============================================================
// PDF取込フロー
// ============================================================

/**
 * PDF ファイルを取り込む（メインエントリーポイント）
 */
export async function importPdfFile(opts: {
  buffer: Buffer;
  originalName: string;
  importedBy?: string;
  sourceUniqueKey?: string;  // 事前に計算済みのSHA-256（省略時は内部で計算）
  fallbackSiteName?: string; // Geminiが現場名を取れなかった場合の届け先フォールバック
}): Promise<ImportPdfResult> {
  const { buffer, originalName } = opts;
  const warnings: string[] = [];

  logger.info(`PDF取込開始: ${originalName}`);

  // ---- Step 1: PDF テキスト抽出 ----
  const extractResult = await extractPdfTextFromBuffer(buffer);

  let parseStatus: 'success' | 'partial' | 'failed' = 'success';
  let parseConfidence = 0;

  if (!extractResult.success) {
    parseStatus = 'failed';
    warnings.push(extractResult.error ?? 'PDF解析に失敗しました');
    logger.warn(`PDF テキスト抽出失敗: ${originalName} - ${extractResult.error}`);
  }

  // ---- Step 2: Gemini で現場名・資材名・金額を抽出 ----
  const knownSiteNames = repo.getRecentSiteNames(30);
  const geminiResult = extractResult.success
    ? await extractDeliverySlip(extractResult.text, knownSiteNames)
    : { site_name: null, delivery_date: null, orderer_name: null, person_name: null,
        total_amount_ex_tax: null, total_tax: null, total_amount_in_tax: null,
        materials: [], confidence: 0, warnings: [] };

  warnings.push(...geminiResult.warnings);

  if (parseStatus !== 'failed') {
    parseStatus = geminiResult.confidence >= 0.6 ? 'success' : 'partial';
    parseConfidence = geminiResult.confidence;
  }

  // parsed 互換オブジェクト（後続コードとの互換性維持）
  // 現場名が取れなかった場合はグリッドの届け先をフォールバックとして使用
  const rawResolvedSiteName = geminiResult.site_name || opts.fallbackSiteName || null;
  if (!geminiResult.site_name && opts.fallbackSiteName) {
    logger.info(`現場名フォールバック: Gemini未取得 → 届け先 "${opts.fallbackSiteName}" を使用`);
  }
  // 会社直納（会社入れ/御社入れ/貴社入れ等）は「彩り」に統一
  const COMPANY_DELIVERY_NAMES = /^(会社入れ|御社入れ|貴社入れ|株式会社吉田|彩り工房)$/;
  const resolvedSiteName = COMPANY_DELIVERY_NAMES.test(rawResolvedSiteName ?? '')
    ? '彩り'
    : rawResolvedSiteName;
  const parsed = {
    raw_site_name: resolvedSiteName,
    delivery_date: geminiResult.delivery_date,
    raw_orderer_name: geminiResult.orderer_name,
    raw_person_name: geminiResult.person_name,
    total_amount_ex_tax: geminiResult.total_amount_ex_tax,
    total_tax: geminiResult.total_tax,
    total_amount_in_tax: geminiResult.total_amount_in_tax,
  };

  logger.info(`Gemini抽出: site="${parsed.raw_site_name}" date="${parsed.delivery_date}" materials=${geminiResult.materials.length}件 confidence=${parseConfidence}`);

  // ---- Step 3: 現場名マッチング ----
  const siteMatch = parsed.raw_site_name
    ? matchSiteForDeliveryImport(parsed.raw_site_name)
    : { status: 'unmatched' as const, candidates: [] };

  // ---- Step 4: DB保存（ヘッダ） ----
  const uniqueKey = opts.sourceUniqueKey ?? crypto.createHash('sha256').update(buffer).digest('hex');
  const db = getDb();
  const GRID_ONLY_CONFIDENCE = 0.2;
  const insertResult = db.transaction(() => {
    // グリッドのみ登録済みレコードがある場合は UPDATE（PDF取得済みに昇格）
    const existingRecord = repo.findByUniqueKey(uniqueKey);
    const isUpgrade = existingRecord && (existingRecord.parse_confidence ?? 0) <= GRID_ONLY_CONFIDENCE;

    if (isUpgrade && existingRecord) {
      // 既存レコードを PDF 内容で上書き更新（直接SQL）
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE delivery_imports SET
          raw_text = ?, delivery_date = ?, raw_orderer_name = ?,
          raw_site_name = ?, raw_person_name = ?,
          matched_site_id = ?, matched_site_name = ?,
          site_match_status = ?, site_match_score = ?,
          total_amount_ex_tax = ?, total_tax = ?, total_amount_in_tax = ?,
          parse_status = ?, parse_confidence = ?, updated_at = ?
        WHERE id = ?
      `).run(
        extractResult.text || null,
        parsed.delivery_date ?? null,
        parsed.raw_orderer_name ?? null,
        parsed.raw_site_name ?? null,
        parsed.raw_person_name ?? null,
        siteMatch.matchedSiteId ?? null,
        siteMatch.matchedSiteName ?? null,
        siteMatch.status,
        siteMatch.matchScore ?? null,
        parsed.total_amount_ex_tax ?? null,
        parsed.total_tax ?? null,
        parsed.total_amount_in_tax ?? null,
        parseStatus,
        parseConfidence,
        now,
        existingRecord.id
      );
      // 既存の明細を削除して再挿入
      db.prepare('DELETE FROM delivery_import_lines WHERE delivery_import_id = ?').run(existingRecord.id);
      logger.info(`グリッドのみ登録をPDF内容で更新: id=${existingRecord.id} slip=${uniqueKey}`);
    }

    const deliveryImport = isUpgrade && existingRecord
      ? repo.findDeliveryImportById(existingRecord.id)!
      : repo.createDeliveryImport({
          source_type: 'kaken_pdf',
          source_file_name: originalName,
          source_unique_key: uniqueKey,
          raw_text: extractResult.text || undefined,
          delivery_date: parsed.delivery_date ?? undefined,
          raw_orderer_name: parsed.raw_orderer_name ?? undefined,
          raw_site_name: parsed.raw_site_name ?? undefined,
          raw_person_name: parsed.raw_person_name ?? undefined,
          matched_site_id: siteMatch.matchedSiteId,
          matched_site_name: siteMatch.matchedSiteName,
          site_match_status: siteMatch.status,
          site_match_score: siteMatch.matchScore,
          total_amount_ex_tax: parsed.total_amount_ex_tax ?? undefined,
          total_tax: parsed.total_tax ?? undefined,
          total_amount_in_tax: parsed.total_amount_in_tax ?? undefined,
          parse_status: parseStatus,
          parse_confidence: parseConfidence,
        });

    // ---- Step 5: PDFファイルは保存しない（テキストデータのみ保存）----
    // バッファはメモリ処理のみ。storage/pdf_raw/ への保存は行わない。

    // ---- Step 6: 明細行保存（Gemini抽出の資材リスト） ----
    const lines: DeliveryImportLine[] = [];

    for (let i = 0; i < geminiResult.materials.length; i++) {
      const mat = geminiResult.materials[i];
      const isFreight = /運賃|配送|送料|割増/.test(mat.name ?? '');
      const line = repo.insertDeliveryImportLine({
        delivery_import_id: deliveryImport.id,
        line_no: i + 1,
        item_name_raw: mat.name,
        item_name_normalized: mat.name,
        spec_raw: mat.spec ?? null,
        quantity: mat.quantity ?? null,
        unit: mat.unit ?? null,
        unit_price: mat.unit_price ?? null,
        amount_ex_tax: mat.amount ?? null,
        tax_amount: null,
        amount_in_tax: null,
        is_freight: isFreight ? 1 : 0,
        is_misc_charge: 0,
        raw_line_text: null,
      });
      lines.push(line);
    }

    // ---- Step 7: 類似候補保存 ----
    const candidates: SiteMatchCandidate[] = [];
    if (siteMatch.status === 'candidate' && parsed.raw_site_name) {
      for (const c of siteMatch.candidates) {
        const candidate = repo.insertSiteMatchCandidate({
          delivery_import_id: deliveryImport.id,
          raw_site_name: parsed.raw_site_name,
          candidate_site_id: c.siteId,
          candidate_site_name: c.siteName,
          similarity_score: c.score,
        });
        candidates.push(candidate);
      }
    }

    logger.info(
      `PDF取込完了: id=${deliveryImport.id} parse_status=${parseStatus} lines=${lines.length} ` +
      `site_match=${siteMatch.status} candidates=${candidates.length}`
    );

    return { deliveryImport, lines, candidates };
  })();

  return {
    ...insertResult,
    warnings,
  };
}

// ============================================================
// Kaken 納品書一括更新
// ============================================================

/**
 * DB内の最終納品日を取得（差分取得の起点）
 */
function getLastDeliveryImportDate(): string | null {
  const row = getDb()
    .prepare(
      `SELECT MAX(delivery_date) as last_date
       FROM delivery_imports
       WHERE source_type = 'kaken_pdf' AND delivery_date IS NOT NULL`
    )
    .get() as { last_date: string | null } | undefined;
  return row?.last_date ?? null;
}

/** YYYY-MM-DD 形式 */
function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 化研マテリアルの納品書一覧から未取込PDFを一括取込する
 *
 * フロー:
 *   1. DB の最終納品日 → 取得期間を決定（初回: 過去1年 / 以降: 最終日 -14日分オーバーラップ）
 *   2. Playwright でログイン → 納品書ページ → 日付フィルタ → グリッド読取
 *   3. 各行: 伝票番号で重複チェック → 新規のみ PDF ダウンロード → 解析・保存
 *   4. UpdateResult を返す
 *
 * 重複キー: source_unique_key = 伝票番号（グリッド取得時点で判定可能）
 */
export type ProgressEvent =
  | { type: 'phase'; phase: string }
  | { type: 'total'; total: number; skipped: number }
  | { type: 'item'; current: number; total: number; slipNumber: string; status: 'ok' | 'skip' | 'fail' }
  | { type: 'done'; result: UpdateResult }
  | { type: 'error'; message: string }

export async function runKakenUpdate(opts?: { dateFrom?: string; onProgress?: (e: ProgressEvent) => void }): Promise<UpdateResult> {
  const emit = opts?.onProgress ?? (() => {});
  const startedAt = Date.now();
  const executedAt = new Date().toISOString();

  // ---- 認証情報チェック ----
  const loginId  = process.env.KAKEN_LOGIN_ID ?? '';
  const password = process.env.KAKEN_LOGIN_PASSWORD ?? '';
  if (!loginId || !password) {
    throw new Error(
      '.env に KAKEN_LOGIN_ID と KAKEN_LOGIN_PASSWORD が設定されていません。' +
      '設定後に再度「更新」を押してください。'
    );
  }

  // ---- 取得期間の決定 ----
  const today       = new Date();
  const lastDate    = getLastDeliveryImportDate();
  const isFirstSync = !lastDate;

  let dateFrom: Date;
  if (opts?.dateFrom) {
    // 明示的な開始日指定
    dateFrom = new Date(opts.dateFrom);
  } else if (lastDate) {
    // 差分取得: 最終納品日 -14日（取りこぼし防止のオーバーラップ）
    dateFrom = new Date(lastDate);
    dateFrom.setDate(dateFrom.getDate() - 14);
  } else {
    // 初回: 過去1年
    dateFrom = new Date(today);
    dateFrom.setFullYear(today.getFullYear() - 1);
  }

  const dateFromStr = formatDateStr(dateFrom);
  const dateToStr   = formatDateStr(today);

  logger.info(
    `Kaken 更新開始: ${dateFromStr}〜${dateToStr} ` +
    `(${isFirstSync ? '初回同期' : '差分取得'})`
  );

  const result: UpdateResult = {
    date_from:      dateFromStr,
    date_to:        dateToStr,
    fetched_count:  0,
    imported_count: 0,
    skipped_count:  0,
    failed_count:   0,
    is_first_sync:  isFirstSync,
    warnings:       [],
    executed_at:    executedAt,
    duration_ms:    0,
  };

  const session = await launchBrowser(true); // headless=true
  try {
    // ---- ログイン → 納品書ページ ----
    // 【重要】日付フィルタ AJAX 適用後は vSELECTED_NNNN チェックボックスが DOM から消える。
    // GeneXus は AJAX 再描画でチェックボックスを再生成しない（hidden GridContainerDataV のみ更新）。
    // そのため日付フィルタを変更せず、初期ページロード時の DOM 状態（チェックボックスあり）のまま使う。
    // デフォルト日付範囲（約4ヶ月）はすべての対象行をカバーするため問題なし。
    emit({ type: 'phase', phase: 'ログイン中…' });
    await login(session.page, loginId, password);
    emit({ type: 'phase', phase: '一覧取得中…' });
    await goToDeliveryPage(session.page);

    // 日付フィルタを適用してからグリッドを読み取る。
    // AJAX 適用後はチェックボックスが消えるが、後段で goToDeliveryPage() リロードするため問題ない。
    // GeneXus はセッションにフィルタ状態を保持するため、リロード後も絞り込み結果が維持される。
    await setDateRangeAndSearch(session.page, dateFromStr, dateToStr);

    // ---- グリッドデータ読取 ----
    const gridRows = await readGridData(session.page);
    result.fetched_count = gridRows.length;
    logger.info(`グリッド取得: ${gridRows.length} 件`);

    if (gridRows.length === 0) {
      logger.info('取得対象なし');
      result.duration_ms = Date.now() - startedAt;
      return result;
    }

    // ---- 重複チェック: 新規行のみを抽出 ----
    // parse_confidence <= 0.2 はグリッドのみ登録（PDF未取得）なので再試行する
    const GRID_ONLY_CONFIDENCE = 0.2;
    const newRows = gridRows.filter((row) => {
      const slipNumber = row.slipNumber?.trim();
      if (!slipNumber) return false;
      const existing = repo.findByUniqueKey(slipNumber);
      if (existing) {
        // PDF取得済み（parse_confidence > GRID_ONLY）はスキップ
        if ((existing.parse_confidence ?? 0) > GRID_ONLY_CONFIDENCE) {
          result.skipped_count++;
          return false;
        }
        // グリッドのみ登録（PDF未取得）は再試行
        logger.info(`PDF再取得対象（グリッドのみ登録）: ${slipNumber} id=${existing.id}`);
        return true;
      }
      return true;
    });
    logger.info(`新規取込対象: ${newRows.length} 件 (スキップ済み: ${result.skipped_count} 件)`);
    emit({ type: 'total', total: newRows.length, skipped: result.skipped_count });

    if (newRows.length === 0) {
      logger.info('新規取込対象なし');
      result.duration_ms = Date.now() - startedAt;
      return result;
    }

    // ---- ページ別ZIP一括ダウンロード ----
    // 【重要】readGridData はAJAXページ遷移を行うため、vSELECTED_* チェックボックスが
    // DOM から消える場合がある。goToDeliveryPage() でフルリロードして復元する。
    emit({ type: 'phase', phase: 'PDF取得中…' });
    await goToDeliveryPage(session.page);
    logger.info('Kaken: 納品書ページ再ロード完了（チェックボックス復元）');

    // GeneXus は全ページ選択後のZIPダウンロードが失敗するため、
    // ページごとに「選択→ダウンロード」を繰り返す方式に変更。
    const pdfMap = new Map<string, Buffer>();
    const totalPages = await getTotalPages(session.page);
    logger.info(`Kaken: 総ページ数 ${totalPages} ページ別ZIPダウンロード開始`);
    // ZIPダウンロードの進捗をtotal/itemで通知（フロントでパーセント表示）
    emit({ type: 'total', total: totalPages, skipped: 0 });

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      emit({ type: 'item', current: pageNum - 1, total: totalPages, slipNumber: `ZIP ${pageNum}/${totalPages}`, status: 'ok' });

      // ページ2以降: AJAXページ遷移でチェックボックスが消えるため、
      // 毎回フルリロードしてからページ遷移する
      if (pageNum > 1) {
        await goToDeliveryPage(session.page);
        await clickPageNumber(session.page, pageNum);
      }

      const selectedCount = await selectCurrentPageRows(session.page);
      logger.info(`Kaken: ページ${pageNum}/${totalPages}: ${selectedCount}行選択`);

      if (selectedCount === 0) continue;

      // ダウンロードボタン visible 待機
      await session.page.waitForFunction(
        () => {
          const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
          if (!btn) return false;
          const display = window.getComputedStyle(btn).display;
          return display !== 'none' && display !== '';
        },
        { timeout: 10_000 }
      ).catch(() => {});

      // ZIP ダウンロード（最大5回リトライ、絶対にスキップしない）
      let zipResult: Awaited<ReturnType<typeof downloadZipBuffer>> = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        zipResult = await downloadZipBuffer(session.page);
        if (zipResult) break;
        logger.warn(`Kaken: ページ${pageNum}: ZIPダウンロード失敗 (試行${attempt}/5)`);
        if (attempt < 5) {
          logger.info(`Kaken: ページ${pageNum}: ${attempt * 3}秒待機後リトライ...`);
          await session.page.waitForTimeout(attempt * 3000);
        }
      }
      if (!zipResult) {
        const errMsg = `ページ${pageNum}のZIPダウンロードに5回失敗しました。データの欠損を防ぐため処理を中断します。再度実行してください。`;
        logger.error(`Kaken: ${errMsg}`);
        throw new Error(errMsg);
      }
      const pdfs = extractPdfsFromZip(zipResult.buffer);
      for (const pdf of pdfs) {
        const baseName = pdf.name.split('/').pop() ?? pdf.name;
        pdfMap.set(baseName, pdf.buffer);
        pdfMap.set(pdf.name, pdf.buffer);
      }
      logger.info(`Kaken: ページ${pageNum}: ZIP内PDF ${pdfs.length}件追加（累計 ${pdfMap.size / 2}件）`);
    }

    // ページ1に戻す
    if (totalPages > 1) {
      await clickPageNumber(session.page, 1);
    }

    logger.info(`Kaken: 全ページZIPダウンロード完了: 累計PDF ${pdfMap.size / 2}件`);

    // PDF解析フェーズ開始：total イベントで件数を通知してパーセント表示
    emit({ type: 'total', total: newRows.length, skipped: result.skipped_count });
    // ---- 各行を処理 ----
    let processedCount = 0;
    for (const row of newRows) {
      const slipNumber = row.slipNumber?.trim() ?? '';
      processedCount++;
      emit({ type: 'item', current: processedCount - 1, total: newRows.length, slipNumber, status: 'ok' });

      // ---- PDF バッファ取得（ZIP優先 → 個別ダウンロード → グリッドのみ） ----
      let pdfBuffer: Buffer | null = null;

      // ZIPから pdfFilename でマッチ
      if (row.pdfFilename && pdfMap.has(row.pdfFilename)) {
        pdfBuffer = pdfMap.get(row.pdfFilename)!;
        logger.info(`ZIP内PDF使用: ${row.pdfFilename}`);
      } else if (pdfMap.size > 0) {
        // ZIP 内 PDF をスリップ番号で部分一致検索
        for (const [name, buf] of pdfMap) {
          if (slipNumber && name.includes(slipNumber)) {
            pdfBuffer = buf;
            logger.info(`ZIP内PDF一致（slipNo部分一致）: ${name} ← ${slipNumber}`);
            break;
          }
        }
      }

      // ZIP 内に見つからない場合: gxdownload は 404 を返すため試行しない
      // PDF は acm_downloadfiles 経由の ZIP でのみ取得可能
      if (!pdfBuffer && row.pdfPath) {
        logger.debug(`ZIP内未発見（gxdownload は 404 のためスキップ）: ${row.pdfFilename}`);
      }

      if (!pdfBuffer) {
        // PDF 取得失敗: グリッドデータだけで最低限のレコードを作成する
        logger.warn(`PDF取得失敗: ${slipNumber} — グリッドデータで部分登録`);
        _saveGridOnlyRecord(slipNumber, row);
        result.failed_count++;
        result.warnings.push(`${slipNumber}: PDFのダウンロードに失敗（グリッドデータで登録）`);
        emit({ type: 'item', current: processedCount, total: newRows.length, slipNumber, status: 'fail' });
        continue;
      }

      // ---- PDF 解析・保存 ----
      try {
        // グリッドの siteName → なければ description（届け先）をフォールバックに使用
        const gridSiteName = row.siteName || row.description || undefined;
        const importResult = await importPdfFile({
          buffer:           pdfBuffer,
          originalName:     row.pdfFilename || `${slipNumber}.pdf`,
          sourceUniqueKey:  slipNumber,
          fallbackSiteName: gridSiteName,
        });

        if (importResult.deliveryImport.parse_status === 'failed') {
          result.failed_count++;
          result.warnings.push(`${slipNumber}: PDF解析失敗`);
          emit({ type: 'item', current: processedCount, total: newRows.length, slipNumber, status: 'fail' });
        } else {
          result.imported_count++;
          if (importResult.warnings.length > 0) {
            result.warnings.push(
              `${slipNumber}: ${importResult.warnings.join(' / ')}`
            );
          }
          logger.info(`取込完了: ${slipNumber} → id=${importResult.deliveryImport.id}`);
          emit({ type: 'item', current: processedCount, total: newRows.length, slipNumber, status: 'ok' });
        }
      } catch (err) {
        const msg = `${slipNumber}: ${(err as Error).message}`;
        result.failed_count++;
        result.warnings.push(msg);
        logger.error(`PDF取込エラー: ${msg}`);
        emit({ type: 'item', current: processedCount, total: newRows.length, slipNumber, status: 'fail' });
      }
    }
  } finally {
    await closeBrowser(session);
  }

  result.duration_ms = Date.now() - startedAt;

  logger.info(
    `Kaken 更新完了: fetched=${result.fetched_count} ` +
    `imported=${result.imported_count} skipped=${result.skipped_count} ` +
    `failed=${result.failed_count} duration=${result.duration_ms}ms`
  );

  return result;
}

/**
 * PDF が取得できなかった場合のフォールバック:
 * グリッドデータの最小限情報でレコードを作成する（parse_status='partial'）
 */
function _saveGridOnlyRecord(
  slipNumber: string,
  row: { deliveryDate: string; siteName: string; description: string; amount: number | null }
): void {
  try {
    // 現場名決定: グリッドのsite名 → なければ "彩り"（会社への直納）
    const COMPANY_DELIVERY_NAMES = /^(会社入れ|御社入れ|貴社入れ|株式会社吉田|彩り工房)$/;
    const rawSiteRaw = row.siteName || '会社入れ';
    const rawSiteName = COMPANY_DELIVERY_NAMES.test(rawSiteRaw) ? '彩り' : rawSiteRaw;

    // YYYY/MM/DD → YYYY-MM-DD
    const deliveryDate = row.deliveryDate
      ? row.deliveryDate.replace(/\//g, '-')
      : undefined;

    const existing = repo.findByUniqueKey(slipNumber);
    if (existing) {
      // 既存レコードに現場名がなければ補完する
      if (!existing.raw_site_name) {
        const now = new Date().toISOString();
        getDb()
          .prepare(`UPDATE delivery_imports SET raw_site_name = ?, updated_at = ? WHERE id = ?`)
          .run(rawSiteName, now, existing.id);
        logger.info(`グリッド部分登録 現場名補完: ${slipNumber} id=${existing.id} site="${rawSiteName}"`);
      }
      return;
    }

    const siteMatch = matchSiteForDeliveryImport(rawSiteName);

    repo.createDeliveryImport({
      source_type:      'kaken_pdf',
      source_file_name: `${slipNumber}.pdf`,
      source_unique_key: slipNumber,
      delivery_date:    deliveryDate,
      raw_site_name:    rawSiteName,
      total_amount_in_tax: row.amount ?? undefined,
      matched_site_id:  siteMatch.matchedSiteId,
      matched_site_name: siteMatch.matchedSiteName,
      site_match_status: siteMatch.status,
      site_match_score:  siteMatch.matchScore,
      parse_status:     'partial',
      parse_confidence: 0.2,
    });
  } catch (err) {
    logger.error(`グリッド部分登録エラー: ${slipNumber} - ${(err as Error).message}`);
  }
}

// ============================================================
// resolve-site 承認フロー
// ============================================================

/**
 * 現場名の統合・確定処理
 */
export function resolveSite(deliveryImportId: number, input: ResolveSiteInput): void {
  const di = repo.findDeliveryImportById(deliveryImportId);
  if (!di) throw new Error(`delivery_import ${deliveryImportId} が見つかりません`);

  const db = getDb();

  db.transaction(() => {
    switch (input.action) {
      case 'match_existing': {
        if (!input.site_id) throw new Error('site_id が必要です');
        const site = sitesRepository.findById(input.site_id);
        if (!site) throw new Error(`site ${input.site_id} が見つかりません`);

        repo.updateDeliveryImport(deliveryImportId, {
          matched_site_id: site.id,
          matched_site_name: site.name,
          site_match_status: 'matched',
          site_match_score: 1.0,
        });
        repo.updateCandidateStatus(deliveryImportId, 'approved');

        // alias 登録オプション
        if (input.create_alias && di.raw_site_name) {
          _createAliasIfNeeded(di.raw_site_name, site.id);
        }
        break;
      }

      case 'create_alias': {
        if (!input.site_id) throw new Error('site_id が必要です');
        const site = sitesRepository.findById(input.site_id);
        if (!site) throw new Error(`site ${input.site_id} が見つかりません`);

        repo.updateDeliveryImport(deliveryImportId, {
          matched_site_id: site.id,
          matched_site_name: site.name,
          site_match_status: 'matched',
          site_match_score: 1.0,
        });
        repo.updateCandidateStatus(deliveryImportId, 'approved');

        if (di.raw_site_name) {
          _createAliasIfNeeded(di.raw_site_name, site.id);
        }
        break;
      }

      case 'keep_unmatched': {
        repo.updateDeliveryImport(deliveryImportId, {
          site_match_status: 'unmatched',
        });
        repo.updateCandidateStatus(deliveryImportId, 'rejected');
        break;
      }

      case 'ignore': {
        repo.updateDeliveryImport(deliveryImportId, {
          site_match_status: 'ignored',
        });
        repo.updateCandidateStatus(deliveryImportId, 'rejected');
        break;
      }
    }
  })();

  logger.info(`resolve-site: id=${deliveryImportId} action=${input.action}`);
}

/**
 * site_aliases にエイリアスを追加（既存でなければ）
 */
function _createAliasIfNeeded(aliasName: string, siteId: number): void {
  const normalized = normalizeSiteName(aliasName);
  const existing = sitesRepository.findAliasByNormalizedName(normalized);
  if (!existing) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO site_aliases (site_id, alias_name, normalized_alias, status, created_at, updated_at)
         VALUES (?, ?, ?, 'approved', ?, ?)`
      )
      .run(siteId, aliasName, normalized, now, now);
    logger.info(`site_alias 登録: "${aliasName}" → site_id=${siteId}`);
  }
}

// ============================================================
// 再解析
// ============================================================

/**
 * 保存済み raw_text から再解析する
 * パーサ改善後に再取込せずに再解析できる
 */
export async function reparseDeliveryImport(id: number): Promise<ImportPdfResult> {
  const di = repo.findDeliveryImportById(id);
  if (!di) throw new Error(`delivery_import ${id} が見つかりません`);
  if (!di.raw_text) throw new Error('raw_text が保存されていないため再解析できません');

  const knownSiteNames = repo.getRecentSiteNames(30);
  const geminiResult = await extractDeliverySlip(di.raw_text, knownSiteNames);
  const parseStatus = geminiResult.confidence >= 0.6 ? 'success' : 'partial';

  const db = getDb();
  const result = db.transaction(() => {
    repo.updateDeliveryImport(id, {
      parse_status: parseStatus,
      parse_confidence: geminiResult.confidence,
    });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE delivery_imports
       SET raw_site_name = ?, raw_person_name = ?, delivery_date = ?,
           total_amount_ex_tax = ?, total_tax = ?, total_amount_in_tax = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      geminiResult.site_name ?? null,
      geminiResult.person_name ?? null,
      geminiResult.delivery_date ?? null,
      geminiResult.total_amount_ex_tax ?? null,
      geminiResult.total_tax ?? null,
      geminiResult.total_amount_in_tax ?? null,
      now,
      id
    );

    db.prepare('DELETE FROM delivery_import_lines WHERE delivery_import_id = ?').run(id);
    const lines: DeliveryImportLine[] = [];
    for (let i = 0; i < geminiResult.materials.length; i++) {
      const mat = geminiResult.materials[i];
      const isFreight = /運賃|配送|送料|割増/.test(mat.name ?? '');
      const line = repo.insertDeliveryImportLine({
        delivery_import_id: id,
        line_no: i + 1,
        item_name_raw: mat.name,
        item_name_normalized: mat.name,
        spec_raw: mat.spec ?? null,
        quantity: mat.quantity ?? null,
        unit: mat.unit ?? null,
        unit_price: mat.unit_price ?? null,
        amount_ex_tax: mat.amount ?? null,
        tax_amount: null,
        amount_in_tax: null,
        is_freight: isFreight ? 1 : 0,
        is_misc_charge: 0,
        raw_line_text: null,
      });
      lines.push(line);
    }

    const updated = repo.findDeliveryImportById(id)!;
    const candidates = repo.findCandidatesByDeliveryImportId(id);
    return { deliveryImport: updated, lines, candidates };
  })();

  logger.info(`再解析完了: id=${id} lines=${result.lines.length} confidence=${geminiResult.confidence}`);

  return { ...result, warnings: geminiResult.warnings };
}

// ============================================================
// 一覧・詳細
// ============================================================

export function listDeliveryImports(
  query: DeliveryImportQuery
): PaginatedResult<DeliveryImportListItem> {
  return repo.findDeliveryImports(query);
}

export function getDeliveryImportById(id: number): DeliveryImportDetail | null {
  const di = repo.findDeliveryImportById(id);
  if (!di) return null;

  const lines = repo.findLinesByDeliveryImportId(id);
  const candidates = repo.findCandidatesByDeliveryImportId(id);

  return { ...di, lines, candidates, line_count: lines.length };
}

// ============================================================
// 未分類現場名
// ============================================================

export function getUnmatchedSites(): UnmatchedSiteGroup[] {
  return repo.findUnmatchedSiteGroups();
}

// ============================================================
// 集計
// ============================================================

export function getSummaryBySite(opts: {
  date_from?: string;
  date_to?: string;
  person_name?: string;
}): SiteSummaryRow[] {
  return repo.getSummaryBySite(opts);
}

export function getSummaryByItem(opts: {
  date_from?: string;
  date_to?: string;
}): ItemSummaryRow[] {
  return repo.getSummaryByItem(opts);
}

export function getSummaryByDate(opts: {
  date_from?: string;
  date_to?: string;
}): DateSummaryRow[] {
  return repo.getSummaryByDate(opts);
}

export function getSummaryByPerson(opts: {
  date_from?: string;
  date_to?: string;
}): PersonSummaryRow[] {
  return repo.getSummaryByPerson(opts);
}

export function getSiteItems(opts: {
  site_name: string;
  date_from?: string;
  date_to?: string;
}): repo.SiteItemSummaryRow[] {
  return repo.getSiteItems(opts);
}

// ============================================================
// AI 補助フック (Phase 4 向け)
// ============================================================

/**
 * AI補助による現場名推定
 * ENABLE_AI_SITE_INFERENCE=true の場合のみ動作
 * APIキー未設定の場合は null を返す（フォールバック）
 */
export async function inferSiteNameWithAI(
  _rawText: string
): Promise<string | null> {
  if (process.env.ENABLE_AI_SITE_INFERENCE !== 'true') return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // TODO: Phase 4 で実装
  // const { Anthropic } = await import('@anthropic-ai/sdk');
  // ...
  return null;
}
