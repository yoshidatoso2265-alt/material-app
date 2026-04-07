/**
 * ダッシュボードサービス
 *
 * 集計対象条件（全クエリで適用）:
 *   mi.deleted_at IS NULL
 *   AND r.is_duplicate = 0
 *   AND r.has_error = 0
 *   AND r.amount IS NOT NULL
 *
 * 現場別集計: 上記 + r.site_id IS NOT NULL
 * 未分類集計: 上記 + r.site_id IS NULL
 */

import { getDb } from '../../db/client';
import { DashboardSummary, SummaryQuery } from '../../types/dashboard';

/** 月初・月末を YYYY-MM-DD で返す */
function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  const from = new Date(y, m, 1);
  const to = new Date(y, m + 1, 0); // 月末

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

class DashboardService {
  private get db() {
    return getDb();
  }

  getSummary(query: SummaryQuery = {}): DashboardSummary {
    const period = query.date_from && query.date_to
      ? { from: query.date_from, to: query.date_to }
      : getCurrentMonthRange();

    const dateCondition = `
      AND COALESCE(r.order_date, r.delivery_date) >= '${period.from}'
      AND COALESCE(r.order_date, r.delivery_date) <= '${period.to}'
    `;

    const baseCondition = `
      JOIN material_imports mi ON mi.id = r.import_id
      WHERE mi.deleted_at IS NULL
        AND r.is_duplicate = 0
        AND r.has_error = 0
        AND r.amount IS NOT NULL
    `;

    // 当月集計（全体）
    const currentMonth = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(r.amount), 0) as total,
           COUNT(DISTINCT r.site_id) as siteCount,
           COUNT(*) as rowCount
         FROM material_import_rows r
         ${baseCondition}
         ${dateCondition}`
      )
      .get() as { total: number; siteCount: number; rowCount: number };

    // 現場別ランキング TOP5（site_id 確定済みのみ）
    const topSites = this.db
      .prepare(
        `SELECT
           r.site_id,
           s.name as site_name,
           COALESCE(SUM(r.amount), 0) as total_amount,
           COUNT(*) as row_count
         FROM material_import_rows r
         LEFT JOIN sites s ON s.id = r.site_id
         JOIN material_imports mi ON mi.id = r.import_id
         WHERE mi.deleted_at IS NULL
           AND r.is_duplicate = 0
           AND r.has_error = 0
           AND r.amount IS NOT NULL
           AND r.site_id IS NOT NULL
         ${dateCondition}
         GROUP BY r.site_id, s.name
         ORDER BY total_amount DESC
         LIMIT 5`
      )
      .all() as DashboardSummary['topSites'];

    // 最近のCSV取込（5件）
    const recentImports = this.db
      .prepare(
        `SELECT id, filename, row_count, status, started_at, imported_at
         FROM material_imports
         WHERE deleted_at IS NULL
         ORDER BY started_at DESC
         LIMIT 5`
      )
      .all() as DashboardSummary['recentImports'];

    // pending エイリアス件数
    const pendingAliasCount = (
      this.db
        .prepare("SELECT COUNT(*) as cnt FROM site_aliases WHERE status = 'pending'")
        .get() as { cnt: number }
    ).cnt;

    // 未分類（site_id IS NULL）集計
    const unclassified = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(r.amount), 0) as amount,
           COUNT(*) as rowCount
         FROM material_import_rows r
         ${baseCondition}
         ${dateCondition}
           AND r.site_id IS NULL`
      )
      .get() as { amount: number; rowCount: number };

    return {
      currentMonth: {
        total: currentMonth.total,
        siteCount: currentMonth.siteCount,
        rowCount: currentMonth.rowCount,
        period,
      },
      topSites,
      recentImports,
      pendingAliasCount,
      unclassified,
    };
  }
}

export const dashboardService = new DashboardService();
