import { Request, Response } from 'express';
import { materialsService } from './materials.service';

class MaterialsController {
  /**
   * GET /api/materials
   * 材料一覧（検索・フィルタ・ページング）
   *
   * クエリパラメータ:
   *   search     フリーワード（材料名・現場名・伝票番号）
   *   site_id    現場IDで絞り込み
   *   date_from  開始日 YYYY-MM-DD
   *   date_to    終了日 YYYY-MM-DD
   *   import_id  取込IDで絞り込み
   *   page       ページ番号（デフォルト: 1）
   *   limit      件数（デフォルト: 50、最大: 200）
   */
  async list(req: Request, res: Response): Promise<void> {
    const { search, site_id, date_from, date_to, import_id, page, limit } = req.query;
    const result = materialsService.getAll({
      search: search as string | undefined,
      site_id: site_id ? parseInt(site_id as string, 10) : undefined,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      import_id: import_id ? parseInt(import_id as string, 10) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  }

  /**
   * GET /api/materials/:id
   * 材料詳細
   */
  async getById(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const item = materialsService.getById(id);
    res.json({ success: true, data: item });
  }
}

export const materialsController = new MaterialsController();
