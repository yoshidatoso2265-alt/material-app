/**
 * imports サービス
 *
 * CSV取込のメインロジック:
 *   1. material_imports レコードを作成（processing）
 *   2. ファイルを storage/csv_raw/ に保存
 *   3. CSV解析・正規化
 *   4. 重複判定
 *   5. 現場名マッチング（alias 解決）
 *   6. DB挿入
 *   7. ステータス更新（completed / partial / failed）
 *   8. 正規化データを storage/csv_normalized/ に保存
 */

import fs from 'fs';
import path from 'path';
import { importsRepository } from './imports.repository';
import { sitesRepository } from '../sites/sites.repository';
import { parseCsvBuffer, CsvEncoding } from './csv/csvParser';
import {
  buildColumnMapping,
  normalizeRow,
  NormalizedRow,
} from './csv/csvNormalizer';
import { checkDuplicate } from './csv/duplicateDetector';
import { normalizeSiteName } from '../../utils/siteNameNormalizer';
import { findSimilarSites, EXACT_MATCH_SCORE } from '../../utils/siteNameMatcher';
import { getDb } from '../../db/client';
import { logger } from '../../utils/logger';
import {
  MaterialImport,
  ImportQuery,
} from '../../types/import';
import { PaginatedResult } from '../../types/common';

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? './storage';

/** 保存ファイル名のサニタイズ（英数字・ハイフン・アンダースコア以外を _ に置換） */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '_').slice(0, 100);
}

/** csv_raw/ の保存パスを生成 */
function buildRawFilePath(importId: number, originalFilename: string): string {
  const now = new Date();
  const yyyyMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ts = now
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss
  const safe = sanitizeFilename(originalFilename);
  return path.join('csv_raw', yyyyMM, `${importId}_${ts}_manual_${safe}`);
}

export interface UploadCsvInput {
  buffer: Buffer;
  originalFilename: string;
  encoding?: CsvEncoding;
  importedBy?: string;
}

export interface ImportResult {
  importId: number;
  rowCount: number;
  errorCount: number;
  duplicateCount: number;
  status: string;
  errors: string[];
}

class ImportsService {
  /**
   * CSVファイルを取り込む（メインフロー）
   */
  async uploadCsv(input: UploadCsvInput): Promise<ImportResult> {
    const errors: string[] = [];

    // Step 1: material_imports レコードを作成
    const importRecord = importsRepository.createImport({
      filename: input.originalFilename,
      source_type: 'manual',
      imported_by: input.importedBy,
    });
    const importId = importRecord.id;

    logger.info(`Import started: id=${importId} file=${input.originalFilename}`);

    try {
      // Step 2: ファイルを storage/csv_raw/ に保存
      const relativePath = buildRawFilePath(importId, input.originalFilename);
      const absolutePath = path.join(STORAGE_BASE, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, input.buffer);
      logger.info(`Raw CSV saved: ${absolutePath}`);

      // Step 3: CSV解析
      const rawRows = parseCsvBuffer(input.buffer, { encoding: input.encoding });
      if (rawRows.length === 0) {
        importsRepository.updateImportStatus(importId, {
          status: 'failed',
          row_count: 0,
          error_count: 0,
          duplicate_count: 0,
          raw_file_path: relativePath,
        });
        return { importId, rowCount: 0, errorCount: 0, duplicateCount: 0, status: 'failed', errors: ['CSVが空です'] };
      }

      // カラムマッピングを1回だけ構築
      const headers = Object.keys(rawRows[0]);
      const colMap = buildColumnMapping(headers);

      // Step 4: 既存サイト一覧を取得（類似度比較用）
      const allSites = sitesRepository.findAllForMatching();

      const db = getDb();
      let rowCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      const normalizedRecords: Array<{ rowIndex: number; row: NormalizedRow }> = [];

      // Step 5-6: トランザクション内で全行を処理
      const insertAll = db.transaction(() => {
        for (let i = 0; i < rawRows.length; i++) {
          const rawRow = rawRows[i];

          // 正規化
          const { row: normalized, errors: rowErrors, hasError } = normalizeRow(rawRow, colMap, i);

          // 重複チェック
          const dupCheck = checkDuplicate(db, {
            order_date: normalized.order_date,
            delivery_date: normalized.delivery_date,
            slip_number: normalized.slip_number,
            raw_site_name: normalized.raw_site_name,
            material_name: normalized.material_name,
            spec: normalized.spec,
            quantity: normalized.quantity,
            unit: normalized.unit,
            unit_price: normalized.unit_price,
            amount: normalized.amount,
          });

          if (dupCheck.isDuplicate) {
            duplicateCount++;
          }

          // 現場名マッチング
          let siteId: number | null = null;
          let siteAliasId: number | null = null;

          if (normalized.raw_site_name) {
            const aliasResult = this.resolveAlias(
              normalized.raw_site_name,
              allSites,
              db
            );
            siteId = aliasResult.siteId;
            siteAliasId = aliasResult.aliasId;
          }

          // DB挿入
          importsRepository.insertRow({
            import_id: importId,
            site_id: siteId,
            site_alias_id: siteAliasId,
            raw_site_name: normalized.raw_site_name,
            order_date: normalized.order_date,
            delivery_date: normalized.delivery_date,
            slip_number: normalized.slip_number,
            material_name: normalized.material_name,
            spec: normalized.spec,
            quantity: normalized.quantity,
            unit: normalized.unit,
            unit_price: normalized.unit_price,
            amount: normalized.amount,
            supplier: normalized.supplier,
            row_index: i,
            source_row_hash: dupCheck.sourceRowHash,
            is_duplicate: dupCheck.isDuplicate ? 1 : 0,
            duplicate_of_id: dupCheck.duplicateOfId,
            has_error: hasError ? 1 : 0,
            error_message: rowErrors.join('; ') || null,
          });

          rowCount++;
          if (hasError) errorCount++;
          if (!hasError) normalizedRecords.push({ rowIndex: i, row: normalized });

          if (rowErrors.length > 0) {
            errors.push(...rowErrors);
          }
        }
      });

      insertAll();

      // Step 7: ステータス更新
      const status: MaterialImport['status'] =
        errorCount === 0 ? 'completed' : rowCount > errorCount ? 'partial' : 'failed';

      importsRepository.updateImportStatus(importId, {
        status,
        row_count: rowCount,
        error_count: errorCount,
        duplicate_count: duplicateCount,
        raw_file_path: relativePath,
      });

      // Step 8: 正規化データを JSON で保存
      this.saveNormalizedJson(importId, normalizedRecords);

      logger.info(
        `Import completed: id=${importId} rows=${rowCount} errors=${errorCount} duplicates=${duplicateCount} status=${status}`
      );

      return { importId, rowCount, errorCount, duplicateCount, status, errors };
    } catch (err) {
      logger.error(`Import failed: id=${importId}`, err);
      importsRepository.updateImportStatus(importId, { status: 'failed' });
      throw err;
    }
  }

  /**
   * 現場名エイリアスを解決する
   * - 完全一致（normalized_alias）→ auto / approved のエイリアスを使用
   * - 類似あり → pending で候補を登録
   * - 一致なし → pending で新規候補として登録
   *
   * 安全設計: スコアが 1.0（完全一致）の場合のみ自動紐づけ
   */
  private resolveAlias(
    rawSiteName: string,
    allSites: Array<{ siteId: number; siteName: string; normalizedName: string }>,
    db: ReturnType<typeof getDb>
  ): { siteId: number | null; aliasId: number | null } {
    const normalizedAlias = normalizeSiteName(rawSiteName);

    // 既存エイリアスを検索（approved / auto のみ）
    const existingApproved = db
      .prepare(
        `SELECT id, site_id FROM site_aliases
         WHERE normalized_alias = ? AND status IN ('approved', 'auto')
         LIMIT 1`
      )
      .get(normalizedAlias) as { id: number; site_id: number } | undefined;

    if (existingApproved) {
      return {
        siteId: existingApproved.site_id,
        aliasId: existingApproved.id,
      };
    }

    // 既存 pending エイリアスを確認（重複登録防止）
    const existingPending = db
      .prepare(
        `SELECT id FROM site_aliases
         WHERE alias_name = ? AND status = 'pending'
         LIMIT 1`
      )
      .get(rawSiteName) as { id: number } | undefined;

    if (existingPending) {
      // 既に pending 登録済み → site_id は未確定のまま
      return { siteId: null, aliasId: existingPending.id };
    }

    // 類似度チェック
    const candidates = findSimilarSites(normalizedAlias, allSites);
    const topCandidate = candidates[0];

    if (topCandidate && topCandidate.score >= EXACT_MATCH_SCORE) {
      // 完全一致 → auto 紐づけ（最も慎重な自動化のみ）
      const aliasResult = db
        .prepare(
          `INSERT INTO site_aliases
             (alias_name, normalized_alias, confidence, status, site_id)
           VALUES (?, ?, ?, 'auto', ?)
           RETURNING id, site_id`
        )
        .get(rawSiteName, normalizedAlias, 1.0, topCandidate.siteId) as {
          id: number;
          site_id: number;
        };
      return { siteId: aliasResult.site_id, aliasId: aliasResult.id };
    }

    // pending として登録（管理者確認待ち）
    const confidence = topCandidate?.score ?? null;
    const pendingAlias = db
      .prepare(
        `INSERT INTO site_aliases
           (alias_name, normalized_alias, confidence, status, site_id)
         VALUES (?, ?, ?, 'pending', NULL)
         RETURNING id`
      )
      .get(rawSiteName, normalizedAlias, confidence) as { id: number };

    return { siteId: null, aliasId: pendingAlias.id };
  }

  private saveNormalizedJson(
    importId: number,
    records: Array<{ rowIndex: number; row: NormalizedRow }>
  ): void {
    try {
      const now = new Date();
      const yyyyMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const dir = path.join(STORAGE_BASE, 'csv_normalized', yyyyMM);
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, `${importId}_normalized.json`);
      const content = {
        import_id: importId,
        processed_at: now.toISOString(),
        row_count: records.length,
        rows: records,
      };
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf-8');
      logger.info(`Normalized JSON saved: ${filePath}`);
    } catch (err) {
      // 正規化JSONの保存失敗はエラーにしない（取込自体は成功扱い）
      logger.warn('Failed to save normalized JSON', err);
    }
  }

  // ============================================================
  // 一覧・詳細
  // ============================================================

  getImports(query: ImportQuery): PaginatedResult<MaterialImport> {
    return importsRepository.findAll(query);
  }

  getImportById(id: number): MaterialImport | null {
    return importsRepository.findById(id);
  }

  getImportRows(importId: number, query: { page?: number; limit?: number }) {
    return importsRepository.findRowsByImportId(importId, query);
  }

  getImportErrors(importId: number) {
    return importsRepository.findErrorRowsByImportId(importId);
  }

  softDeleteImport(id: number): boolean {
    return importsRepository.softDelete(id);
  }
}

export const importsService = new ImportsService();
