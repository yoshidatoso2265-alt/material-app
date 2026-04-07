/**
 * 現場名ベース集計サービス
 *
 * sites マスターへの紐付けに依存せず、raw_site_name（または normalized_site_name）
 * で GROUP BY して集計する。PoC データでも動作することを優先。
 */

import { getDb } from '../../db/client';

/** 集計対象の基本 JOIN + WHERE */
const AGG_BASE = `
  FROM material_import_rows r
  JOIN material_imports mi ON mi.id = r.import_id
  WHERE mi.deleted_at IS NULL
    AND r.is_duplicate = 0
    AND r.has_error = 0
    AND r.amount IS NOT NULL
`;

export interface SiteAggRow {
  raw_site_name: string;
  display_name: string;     // raw_site_name || '現場未分類'
  total_amount: number;
  row_count: number;
  slip_count: number;       // distinct slip_number count
  last_delivery_date: string | null;
  avg_amount: number;
}

export interface SiteAggDetail {
  display_name: string;
  total_amount: number;
  row_count: number;
  slip_count: number;
  last_delivery_date: string | null;
  monthly: Array<{ month: string; amount: number; count: number }>;
  rows: Array<{
    id: number;
    delivery_date: string | null;
    order_date: string | null;
    slip_number: string | null;
    material_name: string;
    amount: number;
    source_type: string;
    is_provisional_name: number;
  }>;
}

export function getSiteAggregation(opts: {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): SiteAggRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | null)[] = [];

  if (opts.dateFrom) {
    conditions.push("COALESCE(r.order_date, r.delivery_date) >= ?");
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    conditions.push("COALESCE(r.order_date, r.delivery_date) <= ?");
    params.push(opts.dateTo);
  }

  const extra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      COALESCE(r.raw_site_name, '') as raw_site_name,
      COALESCE(r.raw_site_name, '現場未分類') as display_name,
      COALESCE(SUM(r.amount), 0) as total_amount,
      COUNT(*) as row_count,
      COUNT(DISTINCT r.slip_number) as slip_count,
      MAX(COALESCE(r.delivery_date, r.order_date)) as last_delivery_date,
      COALESCE(AVG(r.amount), 0) as avg_amount
    ${AGG_BASE} ${extra}
    GROUP BY COALESCE(r.raw_site_name, '')
    ORDER BY total_amount DESC
  `).all(...params) as SiteAggRow[];

  if (opts.search) {
    const q = opts.search.toLowerCase();
    return rows.filter(r => r.display_name.toLowerCase().includes(q));
  }
  return rows;
}

export function getSiteAggDetail(
  rawSiteName: string,
  opts: { dateFrom?: string; dateTo?: string }
): SiteAggDetail {
  const db = getDb();
  const isUnclassified = rawSiteName === '' || rawSiteName === '現場未分類';
  const siteCondition = isUnclassified
    ? '(r.raw_site_name IS NULL OR r.raw_site_name = \'\')'
    : 'r.raw_site_name = ?';
  const siteParam = isUnclassified ? [] : [rawSiteName];

  const conditions: string[] = [];
  const params: (string)[] = [...siteParam];

  if (opts.dateFrom) {
    conditions.push("COALESCE(r.order_date, r.delivery_date) >= ?");
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    conditions.push("COALESCE(r.order_date, r.delivery_date) <= ?");
    params.push(opts.dateTo);
  }

  const extra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  // Summary
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(r.amount), 0) as total_amount,
      COUNT(*) as row_count,
      COUNT(DISTINCT r.slip_number) as slip_count,
      MAX(COALESCE(r.delivery_date, r.order_date)) as last_delivery_date
    ${AGG_BASE} AND ${siteCondition} ${extra}
  `).get(...params) as { total_amount: number; row_count: number; slip_count: number; last_delivery_date: string | null };

  // Monthly breakdown
  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', COALESCE(r.delivery_date, r.order_date)) as month,
      COALESCE(SUM(r.amount), 0) as amount,
      COUNT(*) as count
    ${AGG_BASE} AND ${siteCondition} ${extra}
      AND COALESCE(r.delivery_date, r.order_date) IS NOT NULL
    GROUP BY month
    ORDER BY month ASC
  `).all(...params) as Array<{ month: string; amount: number; count: number }>;

  // Detail rows
  const rows = db.prepare(`
    SELECT
      r.id,
      r.delivery_date,
      r.order_date,
      r.slip_number,
      r.material_name,
      r.amount,
      mi.source_type,
      COALESCE(r.is_provisional_name, 0) as is_provisional_name
    ${AGG_BASE} AND ${siteCondition} ${extra}
    ORDER BY COALESCE(r.delivery_date, r.order_date) DESC, r.id DESC
    LIMIT 200
  `).all(...params) as SiteAggDetail['rows'];

  return {
    display_name: isUnclassified ? '現場未分類' : rawSiteName,
    total_amount: summary.total_amount,
    row_count: summary.row_count,
    slip_count: summary.slip_count,
    last_delivery_date: summary.last_delivery_date,
    monthly,
    rows,
  };
}
