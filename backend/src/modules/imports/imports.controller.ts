import { Request, Response } from 'express';
import { importsService } from './imports.service';
import { createError } from '../../middleware/errorHandler';
import { CsvEncoding } from './csv/csvParser';

class ImportsController {
  /**
   * POST /api/imports/upload
   * CSVファイルをアップロードして取り込む
   *
   * multipart/form-data:
   *   file: CSVファイル
   *   encoding?: 'utf8' | 'shift_jis' | 'cp932' (default: 'utf8')
   */
  async upload(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw createError('ファイルが指定されていません', 400);
    }

    const encoding = (req.body.encoding as CsvEncoding) ?? 'utf8';
    const validEncodings: CsvEncoding[] = ['utf8', 'shift_jis', 'cp932'];
    if (!validEncodings.includes(encoding)) {
      throw createError(
        `encoding は ${validEncodings.join(' / ')} のいずれかを指定してください`,
        400
      );
    }

    const result = await importsService.uploadCsv({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      encoding,
      importedBy: req.body.imported_by,
    });

    res.status(201).json({ success: true, data: result });
  }

  /**
   * GET /api/imports
   * 取込履歴一覧
   */
  async list(req: Request, res: Response): Promise<void> {
    const { page, limit, status, source_type } = req.query;
    const result = importsService.getImports({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      status: status as string | undefined,
      source_type: source_type as string | undefined,
    });
    res.json({ success: true, data: result });
  }

  /**
   * GET /api/imports/:id
   * 取込詳細
   */
  async getById(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const record = importsService.getImportById(id);
    if (!record) throw createError('取込記録が見つかりません', 404);
    res.json({ success: true, data: record });
  }

  /**
   * GET /api/imports/:id/rows
   * 取込明細一覧
   */
  async getRows(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { page, limit } = req.query;
    const result = importsService.getImportRows(id, {
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  }

  /**
   * GET /api/imports/:id/errors
   * エラー行一覧
   */
  async getErrors(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const errors = importsService.getImportErrors(id);
    res.json({ success: true, data: errors });
  }

  /**
   * DELETE /api/imports/:id
   * 論理削除（集計・一覧から除外）
   */
  async softDelete(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const deleted = importsService.softDeleteImport(id);
    if (!deleted) throw createError('取込記録が見つかりません', 404);
    res.json({ success: true, message: '取込記録を削除しました' });
  }
}

export const importsController = new ImportsController();
