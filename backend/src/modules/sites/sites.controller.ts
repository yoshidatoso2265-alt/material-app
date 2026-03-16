import { Request, Response } from 'express';
import { sitesService } from './sites.service';
import { createError } from '../../middleware/errorHandler';

class SitesController {
  // ============================================================
  // 現場 CRUD
  // ============================================================

  async list(req: Request, res: Response): Promise<void> {
    const { search, status, page, limit } = req.query;
    const result = sitesService.getSites({
      search: search as string | undefined,
      status: status as 'active' | 'closed' | 'unknown' | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const site = sitesService.getSiteById(id);
    res.json({ success: true, data: site });
  }

  async create(req: Request, res: Response): Promise<void> {
    const { name, site_code, customer_id } = req.body;
    if (!name) throw createError('現場名は必須です', 400);
    const site = sitesService.createSite({ name, site_code, customer_id });
    res.status(201).json({ success: true, data: site });
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const site = sitesService.updateSite(id, req.body);
    res.json({ success: true, data: site });
  }

  // ============================================================
  // 現場別材料費
  // ============================================================

  async getMaterials(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { date_from, date_to, page, limit } = req.query;
    const result = sitesService.getSiteMaterials(id, {
      dateFrom: date_from as string | undefined,
      dateTo: date_to as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  }

  async getSummary(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { date_from, date_to } = req.query;
    const result = sitesService.getSiteSummary(id, {
      dateFrom: date_from as string | undefined,
      dateTo: date_to as string | undefined,
    });
    res.json({ success: true, data: result });
  }

  // ============================================================
  // 表記ゆれ管理
  // ============================================================

  async getPendingAliases(_req: Request, res: Response): Promise<void> {
    const aliases = sitesService.getPendingAliases();
    res.json({ success: true, data: aliases });
  }

  async getAliasCandidates(_req: Request, res: Response): Promise<void> {
    const candidates = sitesService.getAliasCandidates();
    res.json({ success: true, data: candidates });
  }

  async approveAlias(req: Request, res: Response): Promise<void> {
    const aliasId = parseInt(req.params.id, 10);
    const { site_id, reviewed_by } = req.body;
    if (!site_id) throw createError('統合先の site_id は必須です', 400);
    const alias = sitesService.approveAlias(aliasId, { site_id, reviewed_by });
    res.json({ success: true, data: alias });
  }

  async rejectAlias(req: Request, res: Response): Promise<void> {
    const aliasId = parseInt(req.params.id, 10);
    const { reviewed_by, new_site_name } = req.body;
    const result = sitesService.rejectAlias(aliasId, { reviewed_by, new_site_name });
    res.json({ success: true, data: result });
  }

  async previewNormalized(req: Request, res: Response): Promise<void> {
    const { name } = req.query;
    if (!name) throw createError('name は必須です', 400);
    const normalized = sitesService.previewNormalizedName(name as string);
    res.json({ success: true, data: { original: name, normalized } });
  }
}

export const sitesController = new SitesController();
