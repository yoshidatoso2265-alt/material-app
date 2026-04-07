/**
 * imports リポジトリ
 *
 * 原則:
 *   - DBアクセスはこのファイルのみ（service/controller から直接DBを触らない）
 *   - 全クエリで deleted_at IS NULL を適用する（getActiveImports()等）
 *   - 集計対象条件は SQL コメントに明記する
 *
 * 集計対象条件（全集計クエリで共通）:
 *   mi.deleted_at IS NULL
 *   AND r.is_duplicate = 0
 *   AND r.has_error = 0
 *   AND r.amount IS NOT NULL
 */

import { getDb } from '../../db/client';
import {
  MaterialImport,
  MaterialImportRow,
  CreateImportInput,
  UpdateImportStatusInput,
  ImportQuery,
} from '../../types/import';
import { PaginatedResult } from '../../types/common';

type DbImport = MaterialImport;
type DbImportRow = MaterialImportRow;

export class ImportsRepository {
  private get db() {
    return getDb();
  }

  // ============================================================
  // material_imports CRUD
  // ============================================================

  createImport(input: CreateImportInput): MaterialImport {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO material_imports
           (filename, source_type, period_from, period_to, imported_by, started_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'processing')
         RETURNING *`
      )
      .get(
        input.filename,
        input.source_type ?? 'manual',
        input.period_from ?? null,
        input.period_to ?? null,
        input.imported_by ?? null,
        now
      ) as DbImport;
    return result;
  }

  updateImportStatus(id: number, updates: UpdateImportStatusInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE material_imports SET
           status = ?,
           row_count = COALESCE(?, row_count),
           error_count = COALESCE(?, error_count),
           duplicate_count = COALESCE(?, duplicate_count),
           raw_file_path = COALESCE(?, raw_file_path),
           finished_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(
        updates.status,
        updates.row_count ?? null,
        updates.error_count ?? null,
        updates.duplicate_count ?? null,
        updates.raw_file_path ?? null,
        updates.finished_at ?? now,
        id
      );
  }

  findById(id: number): MaterialImport | null {
    return (
      (this.db
        .prepare('SELECT * FROM material_imports WHERE id = ? AND deleted_at IS NULL')
        .get(id) as DbImport | undefined) ?? null
    );
  }

  /** 論理削除（deleted_at をセット） */
  softDelete(id: number): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE material_imports SET deleted_at = ?
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(now, id);
    return result.changes > 0;
  }

  findAll(query: ImportQuery): PaginatedResult<MaterialImport> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];

    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query.source_type) {
      conditions.push('source_type = ?');
      params.push(query.source_type);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as cnt FROM material_imports ${where}`)
        .get(...params) as { cnt: number }
    ).cnt;

    const data = this.db
      .prepare(
        `SELECT * FROM material_imports ${where}
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as DbImport[];

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ============================================================
  // material_import_rows CRUD
  // ============================================================

  insertRow(
    row: Omit<MaterialImportRow, 'id' | 'created_at'>
  ): MaterialImportRow {
    const result = this.db
      .prepare(
        `INSERT INTO material_import_rows
           (import_id, site_id, site_alias_id, raw_site_name,
            order_date, delivery_date, slip_number,
            material_name, spec, quantity, unit, unit_price, amount,
            supplier, row_index, source_row_hash,
            is_duplicate, duplicate_of_id, has_error, error_message,
            normalized_site_name, is_provisional_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         RETURNING *`
      )
      .get(
        row.import_id,
        row.site_id ?? null,
        row.site_alias_id ?? null,
        row.raw_site_name ?? null,
        row.order_date ?? null,
        row.delivery_date ?? null,
        row.slip_number ?? null,
        row.material_name,
        row.spec ?? null,
        row.quantity ?? null,
        row.unit ?? null,
        row.unit_price ?? null,
        row.amount ?? null,
        row.supplier ?? null,
        row.row_index ?? null,
        row.source_row_hash,
        row.is_duplicate,
        row.duplicate_of_id ?? null,
        row.has_error,
        row.error_message ?? null,
        row.normalized_site_name ?? null,
        row.is_provisional_name ?? 0
      ) as DbImportRow;
    return result;
  }

  findRowsByImportId(
    importId: number,
    query: { page?: number; limit?: number }
  ): PaginatedResult<MaterialImportRow> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, query.limit ?? 50);
    const offset = (page - 1) * limit;

    const total = (
      this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM material_import_rows WHERE import_id = ?'
        )
        .get(importId) as { cnt: number }
    ).cnt;

    const data = this.db
      .prepare(
        `SELECT * FROM material_import_rows
         WHERE import_id = ?
         ORDER BY row_index ASC
         LIMIT ? OFFSET ?`
      )
      .all(importId, limit, offset) as DbImportRow[];

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findErrorRowsByImportId(importId: number): MaterialImportRow[] {
    return this.db
      .prepare(
        `SELECT * FROM material_import_rows
         WHERE import_id = ? AND has_error = 1
         ORDER BY row_index ASC`
      )
      .all(importId) as DbImportRow[];
  }

  /** site_id を更新（エイリアス承認後に呼ばれる） */
  updateSiteIdByAliasId(aliasId: number, siteId: number): void {
    this.db
      .prepare(
        `UPDATE material_import_rows
         SET site_id = ?
         WHERE site_alias_id = ? AND site_id IS NULL`
      )
      .run(siteId, aliasId);
  }
}

export const importsRepository = new ImportsRepository();
