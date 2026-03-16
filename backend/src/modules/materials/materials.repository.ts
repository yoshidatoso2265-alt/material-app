/**
 * materials リポジトリ
 *
 * 集計対象条件（全クエリで適用）:
 *   mi.deleted_at IS NULL
 *   AND r.is_duplicate = 0
 *   AND r.has_error = 0
 *   AND r.amount IS NOT NULL
 *
 * site_id が NULL の行は「未分類」として別集計に出せるようにする
 */

import { getDb } from '../../db/client';
import { MaterialFilter, MaterialListItem } from '../../types/material';
import { PaginatedResult } from '../../types/common';

/** 集計対象の基本条件（SQL断片） */
const AGGREGATE_BASE = `
  JOIN material_imports mi ON mi.id = r.import_id
  WHERE mi.deleted_at IS NULL
    AND r.is_duplicate = 0
    AND r.has_error = 0
    AND r.amount IS NOT NULL
`;

export class MaterialsRepository {
  private get db() {
    return getDb();
  }

  /**
   * 材料一覧（集計対象条件 + 検索フィルタ）
   *
   * search: 材料名・raw_site_name・伝票番号のフリーワード検索
   */
  findAll(filter: MaterialFilter): PaginatedResult<MaterialListItem> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(200, filter.limit ?? 50);
    const offset = (page - 1) * limit;

    const extraConditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.search) {
      extraConditions.push(
        `(r.material_name LIKE ? OR r.raw_site_name LIKE ? OR r.slip_number LIKE ?)`
      );
      const q = `%${filter.search}%`;
      params.push(q, q, q);
    }
    if (filter.site_id !== undefined) {
      extraConditions.push('r.site_id = ?');
      params.push(filter.site_id);
    }
    if (filter.date_from) {
      extraConditions.push("COALESCE(r.order_date, r.delivery_date) >= ?");
      params.push(filter.date_from);
    }
    if (filter.date_to) {
      extraConditions.push("COALESCE(r.order_date, r.delivery_date) <= ?");
      params.push(filter.date_to);
    }
    if (filter.import_id !== undefined) {
      extraConditions.push('r.import_id = ?');
      params.push(filter.import_id);
    }

    const extra =
      extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : '';

    const total = (
      this.db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM material_import_rows r
           ${AGGREGATE_BASE} ${extra}`
        )
        .get(...params) as { cnt: number }
    ).cnt;

    const data = this.db
      .prepare(
        `SELECT
           r.id,
           r.import_id,
           r.site_id,
           s.name as site_name,
           r.raw_site_name,
           r.order_date,
           r.delivery_date,
           r.slip_number,
           r.material_name,
           r.spec,
           r.quantity,
           r.unit,
           r.unit_price,
           r.amount,
           r.supplier,
           mi.filename as import_filename,
           mi.imported_at
         FROM material_import_rows r
         LEFT JOIN sites s ON s.id = r.site_id
         ${AGGREGATE_BASE} ${extra}
         ORDER BY COALESCE(r.order_date, r.delivery_date) DESC, r.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as MaterialListItem[];

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findById(id: number): MaterialListItem | null {
    return (
      (this.db
        .prepare(
          `SELECT
             r.id,
             r.import_id,
             r.site_id,
             s.name as site_name,
             r.raw_site_name,
             r.order_date,
             r.delivery_date,
             r.slip_number,
             r.material_name,
             r.spec,
             r.quantity,
             r.unit,
             r.unit_price,
             r.amount,
             r.supplier,
             mi.filename as import_filename,
             mi.imported_at
           FROM material_import_rows r
           LEFT JOIN sites s ON s.id = r.site_id
           JOIN material_imports mi ON mi.id = r.import_id
           WHERE r.id = ? AND mi.deleted_at IS NULL`
        )
        .get(id) as MaterialListItem | undefined) ?? null
    );
  }
}

export const materialsRepository = new MaterialsRepository();
