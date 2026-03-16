import { sitesRepository } from './sites.repository';
import { importsRepository } from '../imports/imports.repository';
import { normalizeSiteName } from '../../utils/siteNameNormalizer';
import { findSimilarSites } from '../../utils/siteNameMatcher';
import { createError } from '../../middleware/errorHandler';
import {
  Site,
  SiteAlias,
  CreateSiteInput,
  UpdateSiteInput,
  SiteQuery,
  ApproveAliasInput,
  RejectAliasInput,
} from '../../types/site';
import { PaginatedResult } from '../../types/common';

class SitesService {
  // ============================================================
  // 現場 CRUD
  // ============================================================

  createSite(input: CreateSiteInput): Site {
    if (!input.name?.trim()) {
      throw createError('現場名は必須です', 400);
    }
    return sitesRepository.create(input);
  }

  updateSite(id: number, input: UpdateSiteInput): Site {
    const site = sitesRepository.update(id, input);
    if (!site) throw createError('現場が見つかりません', 404);
    return site;
  }

  getSiteById(id: number): Site {
    const site = sitesRepository.findById(id);
    if (!site) throw createError('現場が見つかりません', 404);
    return site;
  }

  getSites(query: SiteQuery): PaginatedResult<Site> {
    return sitesRepository.findAll(query);
  }

  // ============================================================
  // 現場別材料費
  // ============================================================

  getSiteMaterials(
    siteId: number,
    opts: { dateFrom?: string; dateTo?: string; page?: number; limit?: number }
  ) {
    sitesRepository.findById(siteId); // 存在チェック（例外は findById 呼び元で管理）
    return sitesRepository.findSiteMaterials(siteId, opts);
  }

  getSiteSummary(siteId: number, opts: { dateFrom?: string; dateTo?: string }) {
    const site = sitesRepository.findById(siteId);
    if (!site) throw createError('現場が見つかりません', 404);
    const summary = sitesRepository.getSiteSummary(siteId, opts);
    return { site, ...summary };
  }

  // ============================================================
  // 表記ゆれ管理
  // ============================================================

  getPendingAliases(): SiteAlias[] {
    return sitesRepository.findPendingAliases();
  }

  /**
   * エイリアスを承認して site_id を確定する
   * 承認後: 同一 alias_id で登録されている import_rows の site_id を更新
   */
  approveAlias(aliasId: number, input: ApproveAliasInput): SiteAlias {
    const alias = sitesRepository.findAliasById(aliasId);
    if (!alias) throw createError('エイリアスが見つかりません', 404);
    if (alias.status === 'approved') {
      throw createError('このエイリアスは既に承認済みです', 400);
    }

    const site = sitesRepository.findById(input.site_id);
    if (!site) throw createError('統合先の現場が見つかりません', 404);

    const updated = sitesRepository.approveAlias(aliasId, input);
    if (!updated) throw createError('承認処理に失敗しました', 500);

    // 同一エイリアスに紐づく import_rows の site_id を更新
    importsRepository.updateSiteIdByAliasId(aliasId, input.site_id);

    return updated;
  }

  /**
   * エイリアスを却下する
   * new_site_name が指定された場合: 新規現場を作成して承認
   */
  rejectAlias(aliasId: number, input: RejectAliasInput): { alias: SiteAlias; newSite?: Site } {
    const alias = sitesRepository.findAliasById(aliasId);
    if (!alias) throw createError('エイリアスが見つかりません', 404);

    if (input.new_site_name) {
      // 新規現場として登録して承認
      const newSite = sitesRepository.create({ name: input.new_site_name });
      const approvedAlias = sitesRepository.approveAlias(aliasId, {
        site_id: newSite.id,
        reviewed_by: input.reviewed_by,
      });
      importsRepository.updateSiteIdByAliasId(aliasId, newSite.id);
      return { alias: approvedAlias!, newSite };
    }

    const updated = sitesRepository.rejectAlias(aliasId, input.reviewed_by);
    if (!updated) throw createError('却下処理に失敗しました', 500);
    return { alias: updated };
  }

  /**
   * エイリアス候補一覧（類似サイト情報付き）
   */
  getAliasCandidates(): Array<SiteAlias & { candidates: ReturnType<typeof findSimilarSites> }> {
    const pending = sitesRepository.findPendingAliases();
    const allSites = sitesRepository.findAllForMatching();

    return pending.map((alias) => {
      const candidates = findSimilarSites(alias.normalized_alias, allSites);
      return { ...alias, candidates };
    });
  }

  /** normalized_name を取得（alias_name 入力時のプレビュー用） */
  previewNormalizedName(name: string): string {
    return normalizeSiteName(name);
  }
}

export const sitesService = new SitesService();
