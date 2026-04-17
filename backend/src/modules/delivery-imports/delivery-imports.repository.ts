/**
 * delivery-imports リポジトリ
 *
 * 原則:
 *   - DB アクセスはこのファイルのみ（service/controller から直接 DB を触らない）
 *   - 材料名（item_name_raw）は変換・統合しない
 *   - 現場名マッチングの確定は delivery_imports.matched_site_id で行う
 */

import { getDb } from '../../db/client';
import { PaginatedResult } from '../../types/common';
import {
  DeliveryImport,
  DeliveryImportLine,
  DeliveryImportListItem,
  DeliveryImportQuery,
  SiteMatchCandidate,
  SiteSummaryRow,
  ItemSummaryRow,
  DateSummaryRow,
  PersonSummaryRow,
  UnmatchedSiteGroup,
} from './delivery-imports.types';

// ============================================================
// delivery_imports CRUD
// ============================================================

export function createDeliveryImport(input: {
  source_type?: string;
  source_file_name?: string;
  source_file_path?: string;
  source_unique_key?: string;
  raw_text?: string;
  delivery_date?: string;
  raw_orderer_name?: string;
  raw_site_name?: string;
  raw_person_name?: string;
  matched_site_id?: number;
  matched_site_name?: string;
  site_match_status?: 'matched' | 'candidate' | 'unmatched' | 'ignored';
  site_match_score?: number;
  total_amount_ex_tax?: number;
  total_tax?: number;
  total_amount_in_tax?: number;
  parse_status?: 'success' | 'partial' | 'failed';
  parse_confidence?: number;
}): DeliveryImport {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO delivery_imports
         (source_type, source_file_name, source_file_path, source_unique_key, raw_text,
          delivery_date, raw_orderer_name, raw_site_name, raw_person_name,
          matched_site_id, matched_site_name, site_match_status, site_match_score,
          total_amount_ex_tax, total_tax, total_amount_in_tax,
          parse_status, parse_confidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`
    )
    .get(
      input.source_type ?? 'kaken_pdf',
      input.source_file_name ?? null,
      input.source_file_path ?? null,
      input.source_unique_key ?? null,
      input.raw_text ?? null,
      input.delivery_date ?? null,
      input.raw_orderer_name ?? null,
      input.raw_site_name ?? null,
      input.raw_person_name ?? null,
      input.matched_site_id ?? null,
      input.matched_site_name ?? null,
      input.site_match_status ?? 'unmatched',
      input.site_match_score ?? null,
      input.total_amount_ex_tax ?? null,
      input.total_tax ?? null,
      input.total_amount_in_tax ?? null,
      input.parse_status ?? 'success',
      input.parse_confidence ?? null
    ) as DeliveryImport;
}

/**
 * source_unique_key（SHA-256）で既存レコードを検索
 * 重複チェックに使用
 */
export function findByUniqueKey(key: string): DeliveryImport | null {
  return (
    (getDb()
      .prepare('SELECT * FROM delivery_imports WHERE source_unique_key = ?')
      .get(key) as DeliveryImport | undefined) ?? null
  );
}

export function updateDeliveryImport(
  id: number,
  updates: Partial<{
    matched_site_id: number | null;
    matched_site_name: string | null;
    site_match_status: 'matched' | 'candidate' | 'unmatched' | 'ignored';
    site_match_score: number | null;
    parse_status: 'success' | 'partial' | 'failed';
    parse_confidence: number | null;
  }>
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [now];

  if ('matched_site_id' in updates) {
    sets.push('matched_site_id = ?');
    params.push(updates.matched_site_id ?? null);
  }
  if ('matched_site_name' in updates) {
    sets.push('matched_site_name = ?');
    params.push(updates.matched_site_name ?? null);
  }
  if ('site_match_status' in updates) {
    sets.push('site_match_status = ?');
    params.push(updates.site_match_status!);
  }
  if ('site_match_score' in updates) {
    sets.push('site_match_score = ?');
    params.push(updates.site_match_score ?? null);
  }
  if ('parse_status' in updates) {
    sets.push('parse_status = ?');
    params.push(updates.parse_status!);
  }
  if ('parse_confidence' in updates) {
    sets.push('parse_confidence = ?');
    params.push(updates.parse_confidence ?? null);
  }

  db.prepare(`UPDATE delivery_imports SET ${sets.join(', ')} WHERE id = ?`).run(
    ...params,
    id
  );
}

export function findDeliveryImportById(id: number): DeliveryImport | null {
  return (
    (getDb()
      .prepare('SELECT * FROM delivery_imports WHERE id = ?')
      .get(id) as DeliveryImport | undefined) ?? null
  );
}

export function findDeliveryImports(query: DeliveryImportQuery): PaginatedResult<DeliveryImportListItem> {
  const db = getDb();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, query.limit ?? 20);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number | boolean)[] = [];

  if (query.date_from) {
    conditions.push('delivery_date >= ?');
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push('delivery_date <= ?');
    params.push(query.date_to);
  }
  if (query.person_name) {
    conditions.push('raw_person_name LIKE ?');
    params.push(`%${query.person_name}%`);
  }
  if (query.no_site_name) {
    conditions.push('(raw_site_name IS NULL OR raw_site_name = \'\')');
  } else if (query.raw_site_name) {
    conditions.push('(raw_site_name LIKE ? OR matched_site_name LIKE ?)');
    params.push(`%${query.raw_site_name}%`, `%${query.raw_site_name}%`);
  }
  if (query.site_id) {
    conditions.push('matched_site_id = ?');
    params.push(query.site_id);
  }
  if (query.unmatched_only) {
    conditions.push("site_match_status IN ('candidate','unmatched')");
  }
  if (query.parse_status) {
    conditions.push('parse_status = ?');
    params.push(query.parse_status);
  }
  if (query.item_name) {
    conditions.push(
      'EXISTS (SELECT 1 FROM delivery_import_lines dil WHERE dil.delivery_import_id = di.id AND dil.item_name_raw LIKE ?)'
    );
    params.push(`%${query.item_name}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM delivery_imports di ${where}`)
      .get(...params) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `SELECT di.*,
              (SELECT COUNT(*) FROM delivery_import_lines dil WHERE dil.delivery_import_id = di.id) as line_count,
              (SELECT GROUP_CONCAT(item_name_raw, '||')
               FROM (SELECT item_name_raw FROM delivery_import_lines
                     WHERE delivery_import_id = di.id
                       AND item_name_raw IS NOT NULL
                       AND is_freight = 0
                       AND is_misc_charge = 0
                       AND LENGTH(item_name_raw) >= 3
                     LIMIT 3)) as top_items_raw
       FROM delivery_imports di
       ${where}
       ORDER BY di.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as (DeliveryImportListItem & { top_items_raw?: string })[];

  const data: DeliveryImportListItem[] = rows.map((row) => ({
    ...row,
    top_items: row.top_items_raw
      ? row.top_items_raw.split('||').filter(Boolean)
      : [],
    top_items_raw: undefined,
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ============================================================
// delivery_import_lines CRUD
// ============================================================

export function insertDeliveryImportLine(
  line: Omit<DeliveryImportLine, 'id' | 'created_at'>
): DeliveryImportLine {
  return getDb()
    .prepare(
      `INSERT INTO delivery_import_lines
         (delivery_import_id, line_no, item_name_raw, item_name_normalized,
          spec_raw, quantity, unit, unit_price,
          amount_ex_tax, tax_amount, amount_in_tax,
          is_freight, is_misc_charge, raw_line_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`
    )
    .get(
      line.delivery_import_id,
      line.line_no,
      line.item_name_raw ?? null,
      line.item_name_normalized ?? null,
      line.spec_raw ?? null,
      line.quantity ?? null,
      line.unit ?? null,
      line.unit_price ?? null,
      line.amount_ex_tax ?? null,
      line.tax_amount ?? null,
      line.amount_in_tax ?? null,
      line.is_freight,
      line.is_misc_charge,
      line.raw_line_text ?? null
    ) as DeliveryImportLine;
}

export function findLinesByDeliveryImportId(deliveryImportId: number): DeliveryImportLine[] {
  return getDb()
    .prepare(
      `SELECT * FROM delivery_import_lines
       WHERE delivery_import_id = ?
       ORDER BY line_no ASC`
    )
    .all(deliveryImportId) as DeliveryImportLine[];
}

// ============================================================
// site_match_candidates CRUD
// ============================================================

export function insertSiteMatchCandidate(input: {
  delivery_import_id: number;
  raw_site_name: string;
  candidate_site_id?: number;
  candidate_site_name?: string;
  similarity_score?: number;
}): SiteMatchCandidate {
  return getDb()
    .prepare(
      `INSERT INTO site_match_candidates
         (delivery_import_id, raw_site_name, candidate_site_id, candidate_site_name, similarity_score)
       VALUES (?,?,?,?,?)
       RETURNING *`
    )
    .get(
      input.delivery_import_id,
      input.raw_site_name,
      input.candidate_site_id ?? null,
      input.candidate_site_name ?? null,
      input.similarity_score ?? null
    ) as SiteMatchCandidate;
}

export function findCandidatesByDeliveryImportId(deliveryImportId: number): SiteMatchCandidate[] {
  return getDb()
    .prepare(
      `SELECT * FROM site_match_candidates
       WHERE delivery_import_id = ? AND status = 'pending'
       ORDER BY similarity_score DESC`
    )
    .all(deliveryImportId) as SiteMatchCandidate[];
}

export function updateCandidateStatus(
  deliveryImportId: number,
  status: 'approved' | 'rejected'
): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE site_match_candidates
       SET status = ?, updated_at = ?
       WHERE delivery_import_id = ? AND status = 'pending'`
    )
    .run(status, now, deliveryImportId);
}

// ============================================================
// 未分類現場名集計
// ============================================================

export function findUnmatchedSiteGroups(): UnmatchedSiteGroup[] {
  const db = getDb();

  const groups = db
    .prepare(
      `SELECT raw_site_name, COUNT(*) as import_count
       FROM delivery_imports
       WHERE site_match_status IN ('candidate','unmatched')
         AND raw_site_name IS NOT NULL
       GROUP BY raw_site_name
       ORDER BY import_count DESC, raw_site_name ASC`
    )
    .all() as Array<{ raw_site_name: string; import_count: number }>;

  return groups.map((g) => {
    const candidates = db
      .prepare(
        `SELECT smc.*
         FROM site_match_candidates smc
         JOIN delivery_imports di ON di.id = smc.delivery_import_id
         WHERE di.raw_site_name = ? AND smc.status = 'pending'
         GROUP BY smc.candidate_site_id
         ORDER BY smc.similarity_score DESC
         LIMIT 5`
      )
      .all(g.raw_site_name) as SiteMatchCandidate[];

    return {
      raw_site_name: g.raw_site_name,
      import_count: g.import_count,
      candidates,
    };
  });
}

/** 過去N日以内の既存現場名リストを返す（Geminiマッチング用） */
export function getRecentSiteNames(withinDays = 30): string[] {
  const since = new Date();
  since.setDate(since.getDate() - withinDays);
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT COALESCE(matched_site_name, raw_site_name) as site_name
       FROM delivery_imports
       WHERE delivery_date >= ?
         AND (raw_site_name IS NOT NULL OR matched_site_name IS NOT NULL)
         AND parse_status != 'failed'
       ORDER BY site_name`
    )
    .all(sinceStr) as { site_name: string }[];
  return rows.map(r => r.site_name).filter(Boolean);
}

// ============================================================
// 集計クエリ
// ============================================================

export function getSummaryBySite(opts: {
  date_from?: string;
  date_to?: string;
  person_name?: string;
}): SiteSummaryRow[] {
  const conditions: string[] = ["di.parse_status != 'failed'"];
  const params: (string | number)[] = [];

  if (opts.date_from) { conditions.push('di.delivery_date >= ?'); params.push(opts.date_from); }
  if (opts.date_to) { conditions.push('di.delivery_date <= ?'); params.push(opts.date_to); }
  if (opts.person_name) { conditions.push('di.raw_person_name LIKE ?'); params.push(`%${opts.person_name}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  return getDb()
    .prepare(
      `SELECT
         site_name,
         SUM(total_amount) as total_amount,
         COUNT(*) as import_count,
         MAX(last_date) as last_delivery_date,
         SUM(item_count) as item_count,
         SUM(unmatched) as unmatched_count
       FROM (
         SELECT
           COALESCE(di.matched_site_name, di.raw_site_name, '現場未分類') as site_name,
           COALESCE(di.total_amount_in_tax, di.total_amount_ex_tax, 0) as total_amount,
           di.delivery_date as last_date,
           (SELECT COUNT(*) FROM delivery_import_lines dil
            WHERE dil.delivery_import_id = di.id
              AND dil.is_freight = 0 AND dil.is_misc_charge = 0
              AND dil.item_name_raw IS NOT NULL) as item_count,
           CASE WHEN di.site_match_status IN ('unmatched','candidate') THEN 1 ELSE 0 END as unmatched
         FROM delivery_imports di
         ${where}
       ) sub
       GROUP BY site_name
       ORDER BY total_amount DESC`
    )
    .all(...params) as SiteSummaryRow[];
}

export function getSummaryByItem(opts: {
  date_from?: string;
  date_to?: string;
}): ItemSummaryRow[] {
  const conditions: string[] = [
    "di.parse_status != 'failed'",
    'dil.item_name_raw IS NOT NULL',
    'dil.is_freight = 0',
    'dil.is_misc_charge = 0',
  ];
  const params: (string | number)[] = [];

  if (opts.date_from) { conditions.push('di.delivery_date >= ?'); params.push(opts.date_from); }
  if (opts.date_to) { conditions.push('di.delivery_date <= ?'); params.push(opts.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  return getDb()
    .prepare(
      `SELECT
         dil.item_name_raw,
         COALESCE(SUM(dil.amount_ex_tax), 0) as total_amount_ex_tax,
         ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 0.1) as total_tax,
         ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 1.1) as total_amount_in_tax,
         CASE WHEN COUNT(DISTINCT dil.unit) <= 1 THEN SUM(dil.quantity) ELSE NULL END as total_qty,
         CASE WHEN COUNT(DISTINCT dil.unit) = 1  THEN MAX(dil.unit)     ELSE NULL END as unit,
         CASE WHEN SUM(dil.quantity) > 0
              THEN ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 1.0 / SUM(dil.quantity), 0)
              ELSE NULL END as avg_unit_price,
         COUNT(*) as delivery_count,
         COUNT(DISTINCT COALESCE(di.matched_site_name, di.raw_site_name)) as site_count,
         MIN(di.delivery_date) as first_delivery_date,
         MAX(di.delivery_date) as last_delivery_date
       FROM delivery_import_lines dil
       JOIN delivery_imports di ON di.id = dil.delivery_import_id
       ${where}
       GROUP BY dil.item_name_raw
       ORDER BY total_amount_in_tax DESC`
    )
    .all(...params) as ItemSummaryRow[];
}

export function getSummaryByDate(opts: {
  date_from?: string;
  date_to?: string;
}): DateSummaryRow[] {
  const conditions: string[] = ["parse_status != 'failed'", 'delivery_date IS NOT NULL'];
  const params: (string | number)[] = [];

  if (opts.date_from) { conditions.push('delivery_date >= ?'); params.push(opts.date_from); }
  if (opts.date_to) { conditions.push('delivery_date <= ?'); params.push(opts.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  return getDb()
    .prepare(
      `SELECT
         delivery_date,
         COALESCE(SUM(total_amount_in_tax), SUM(total_amount_ex_tax), 0) as total_amount,
         COUNT(*) as import_count
       FROM delivery_imports
       ${where}
       GROUP BY delivery_date
       ORDER BY delivery_date DESC`
    )
    .all(...params) as DateSummaryRow[];
}

export function getSummaryByPerson(opts: {
  date_from?: string;
  date_to?: string;
}): PersonSummaryRow[] {
  const conditions: string[] = [
    "parse_status != 'failed'",
    'raw_person_name IS NOT NULL',
  ];
  const params: (string | number)[] = [];

  if (opts.date_from) { conditions.push('delivery_date >= ?'); params.push(opts.date_from); }
  if (opts.date_to) { conditions.push('delivery_date <= ?'); params.push(opts.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  return getDb()
    .prepare(
      `SELECT
         raw_person_name,
         COALESCE(SUM(total_amount_in_tax), SUM(total_amount_ex_tax), 0) as total_amount,
         COUNT(*) as import_count
       FROM delivery_imports
       ${where}
       GROUP BY raw_person_name
       ORDER BY total_amount DESC`
    )
    .all(...params) as PersonSummaryRow[];
}

export interface SiteItemSummaryRow {
  item_name: string;
  spec: string | null;
  total_qty: number | null;
  unit: string | null;
  avg_unit_price: number | null;
  total_amount_ex_tax: number;
  total_tax: number;
  total_amount_in_tax: number;
  delivery_count: number;
  is_freight: number;
  is_misc_charge: number;
  first_delivery_date: string | null;
  last_delivery_date: string | null;
}

export function getSiteItems(opts: {
  site_name: string;
  date_from?: string;
  date_to?: string;
}): SiteItemSummaryRow[] {
  const conditions: string[] = [
    "COALESCE(di.matched_site_name, di.raw_site_name, '現場未分類') = ?",
    "di.parse_status != 'failed'",
  ];
  const params: (string | number)[] = [opts.site_name];

  if (opts.date_from) { conditions.push('di.delivery_date >= ?'); params.push(opts.date_from); }
  if (opts.date_to)   { conditions.push('di.delivery_date <= ?'); params.push(opts.date_to); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  return getDb()
    .prepare(
      `SELECT
         COALESCE(dil.item_name_normalized, dil.item_name_raw) AS item_name,
         dil.spec_raw AS spec,
         CASE WHEN COUNT(DISTINCT dil.unit) <= 1 THEN SUM(dil.quantity) ELSE NULL END AS total_qty,
         CASE WHEN COUNT(DISTINCT dil.unit) = 1  THEN MAX(dil.unit)     ELSE NULL END AS unit,
         CASE WHEN SUM(dil.quantity) > 0
              THEN ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 1.0 / SUM(dil.quantity), 0)
              ELSE NULL END AS avg_unit_price,
         COALESCE(SUM(dil.amount_ex_tax), 0) AS total_amount_ex_tax,
         ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 0.1) AS total_tax,
         ROUND(COALESCE(SUM(dil.amount_ex_tax), 0) * 1.1) AS total_amount_in_tax,
         COUNT(*) AS delivery_count,
         dil.is_freight,
         dil.is_misc_charge,
         MIN(di.delivery_date) AS first_delivery_date,
         MAX(di.delivery_date) AS last_delivery_date
       FROM delivery_import_lines dil
       JOIN delivery_imports di ON di.id = dil.delivery_import_id
       ${where}
       GROUP BY
         COALESCE(dil.item_name_normalized, dil.item_name_raw),
         dil.spec_raw,
         dil.is_freight,
         dil.is_misc_charge
       ORDER BY dil.is_freight ASC, dil.is_misc_charge ASC, total_amount_ex_tax DESC`
    )
    .all(...params) as SiteItemSummaryRow[];
}
