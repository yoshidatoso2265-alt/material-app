/**
 * sites リポジトリ
 *
 * 原則:
 *   - normalized_name は sites.name 保存時に必ず生成して同時保存する
 *   - normalized_alias は site_aliases の alias_name 保存時に必ず生成する
 *   - 比較・候補抽出は normalized_name / normalized_alias を主入力にする
 *   - alias_name / name は表示・監査用として使用する
 */

import { getDb } from '../../db/client';
import { normalizeSiteName } from '../../utils/siteNameNormalizer';
import {
  Site,
  SiteAlias,
  CreateSiteInput,
  UpdateSiteInput,
  SiteQuery,
  ApproveAliasInput,
} from '../../types/site';
import { PaginatedResult } from '../../types/common';

type DbSite = Site;
type DbAlias = SiteAlias;

export class SitesRepository {
  private get db() {
    return getDb();
  }

  // ============================================================
  // sites CRUD
  // ============================================================

  create(input: CreateSiteInput): Site {
    const normalizedName = normalizeSiteName(input.name);
    const now = new Date().toISOString();

    return this.db
      .prepare(
        `INSERT INTO sites (name, normalized_name, site_code, customer_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(
        input.name,
        normalizedName,
        input.site_code ?? null,
        input.customer_id ?? null,
        now,
        now
      ) as DbSite;
  }

  update(id: number, input: UpdateSiteInput): Site | null {
    const current = this.findById(id);
    if (!current) return null;

    const newName = input.name ?? current.name;
    // name が変わった場合は normalized_name を再生成する
    const normalizedName =
      input.name !== undefined ? normalizeSiteName(newName) : current.normalized_name;

    return this.db
      .prepare(
        `UPDATE sites
         SET name = ?,
             normalized_name = ?,
             site_code = COALESCE(?, site_code),
             status = COALESCE(?, status),
             customer_id = COALESCE(?, customer_id),
             updated_at = datetime('now')
         WHERE id = ?
         RETURNING *`
      )
      .get(
        newName,
        normalizedName,
        input.site_code ?? null,
        input.status ?? null,
        input.customer_id ?? null,
        id
      ) as DbSite | undefined ?? null;
  }

  findById(id: number): Site | null {
    return (
      (this.db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as DbSite | undefined) ?? null
    );
  }

  findAll(query: SiteQuery): PaginatedResult<Site> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query.search) {
      conditions.push('(name LIKE ? OR normalized_name LIKE ?)');
      params.push(`%${query.search}%`, `%${query.search}%`);
    }
    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (
      this.db.prepare(`SELECT COUNT(*) as cnt FROM sites ${where}`).get(...params) as {
        cnt: number;
      }
    ).cnt;

    const data = this.db
      .prepare(
        `SELECT * FROM sites ${where}
         ORDER BY name ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as DbSite[];

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** マッチング用に全サイトを取得（normalized_name 付き） */
  findAllForMatching(): Array<{
    siteId: number;
    siteName: string;
    normalizedName: string;
  }> {
    const rows = this.db
      .prepare("SELECT id, name, normalized_name FROM sites WHERE status = 'active'")
      .all() as DbSite[];
    return rows.map((r) => ({
      siteId: r.id,
      siteName: r.name,
      normalizedName: r.normalized_name,
    }));
  }

  findByNormalizedName(normalizedName: string): Site | null {
    return (
      (this.db
        .prepare('SELECT * FROM sites WHERE normalized_name = ? LIMIT 1')
        .get(normalizedName) as DbSite | undefined) ?? null
    );
  }

  // ============================================================
  // site_aliases CRUD
  // ============================================================

  findPendingAliases(): SiteAlias[] {
    return this.db
      .prepare(
        `SELECT sa.*, s.name as site_name
         FROM site_aliases sa
         LEFT JOIN sites s ON s.id = sa.site_id
         WHERE sa.status = 'pending'
         ORDER BY sa.created_at ASC`
      )
      .all() as DbAlias[];
  }

  findAliasById(id: number): SiteAlias | null {
    return (
      (this.db
        .prepare('SELECT * FROM site_aliases WHERE id = ?')
        .get(id) as DbAlias | undefined) ?? null
    );
  }

  findAliasByNormalizedName(normalizedAlias: string): SiteAlias | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM site_aliases
           WHERE normalized_alias = ? AND status IN ('approved', 'auto')
           LIMIT 1`
        )
        .get(normalizedAlias) as DbAlias | undefined) ?? null
    );
  }

  /** エイリアスを承認して site_id を確定する */
  approveAlias(aliasId: number, input: ApproveAliasInput): SiteAlias | null {
    const now = new Date().toISOString();
    return (
      (this.db
        .prepare(
          `UPDATE site_aliases
           SET site_id = ?,
               status = 'approved',
               reviewed_at = ?,
               reviewed_by = ?
           WHERE id = ?
           RETURNING *`
        )
        .get(input.site_id, now, input.reviewed_by ?? null, aliasId) as DbAlias | undefined) ??
      null
    );
  }

  /** エイリアスを却下する（rejected → 後で再評価可能） */
  rejectAlias(aliasId: number, reviewedBy?: string): SiteAlias | null {
    const now = new Date().toISOString();
    return (
      (this.db
        .prepare(
          `UPDATE site_aliases
           SET status = 'rejected',
               site_id = NULL,
               reviewed_at = ?,
               reviewed_by = ?
           WHERE id = ?
           RETURNING *`
        )
        .get(now, reviewedBy ?? null, aliasId) as DbAlias | undefined) ?? null
    );
  }

  /** 現場別の材料費明細（集計対象条件を適用） */
  findSiteMaterials(
    siteId: number,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    }
  ): PaginatedResult<Record<string, unknown>> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, opts.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions = [
      'r.site_id = ?',
      'mi.deleted_at IS NULL',
      'r.is_duplicate = 0',
      'r.has_error = 0',
      'r.amount IS NOT NULL',
    ];
    const params: (string | number)[] = [siteId];

    if (opts.dateFrom) {
      conditions.push("COALESCE(r.order_date, r.delivery_date) >= ?");
      params.push(opts.dateFrom);
    }
    if (opts.dateTo) {
      conditions.push("COALESCE(r.order_date, r.delivery_date) <= ?");
      params.push(opts.dateTo);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const total = (
      this.db
        .prepare(
          `SELECT COUNT(*) as cnt
           FROM material_import_rows r
           JOIN material_imports mi ON mi.id = r.import_id
           ${where}`
        )
        .get(...params) as { cnt: number }
    ).cnt;

    const data = this.db
      .prepare(
        `SELECT r.*, mi.filename as import_filename, mi.imported_at
         FROM material_import_rows r
         JOIN material_imports mi ON mi.id = r.import_id
         ${where}
         ORDER BY COALESCE(r.order_date, r.delivery_date) DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** 現場別集計（集計対象条件を適用） */
  getSiteSummary(
    siteId: number,
    opts: { dateFrom?: string; dateTo?: string }
  ): { total_amount: number; row_count: number } {
    const conditions = [
      'r.site_id = ?',
      'mi.deleted_at IS NULL',
      'r.is_duplicate = 0',
      'r.has_error = 0',
      'r.amount IS NOT NULL',
    ];
    const params: (string | number)[] = [siteId];

    if (opts.dateFrom) {
      conditions.push("COALESCE(r.order_date, r.delivery_date) >= ?");
      params.push(opts.dateFrom);
    }
    if (opts.dateTo) {
      conditions.push("COALESCE(r.order_date, r.delivery_date) <= ?");
      params.push(opts.dateTo);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    return this.db
      .prepare(
        `SELECT COALESCE(SUM(r.amount), 0) as total_amount,
                COUNT(*) as row_count
         FROM material_import_rows r
         JOIN material_imports mi ON mi.id = r.import_id
         ${where}`
      )
      .get(...params) as { total_amount: number; row_count: number };
  }
}

export const sitesRepository = new SitesRepository();
