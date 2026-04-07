/**
 * delivery-imports コントローラー
 *
 * 責務:
 *   - HTTP リクエスト/レスポンス変換
 *   - バリデーション（最小限）
 *   - service 層への委譲
 *
 * 注意: asyncHandler に渡すため全関数を async にする
 */

import { Request, Response } from 'express';
import * as service from './delivery-imports.service';
import { DeliveryImportQuery, ResolveSiteInput } from './delivery-imports.types';

// ============================================================
// 一括更新（pdf_inbox スキャン）
// ============================================================

/**
 * POST /api/delivery-imports/update
 * 化研マテリアルの納品書一覧から未取込PDFを一括取込する
 */
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const dateFrom = req.body?.date_from as string | undefined;
    const result = await service.runKakenUpdate(dateFrom ? { dateFrom } : undefined);
    res.json({ data: result });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('KAKEN_LOGIN')) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: `更新エラー: ${msg}` });
    }
  }
}

/**
 * GET /api/delivery-imports/update-stream
 * SSE で進捗をリアルタイム配信しながら更新する
 */
export async function updateStream(req: Request, res: Response): Promise<void> {
  const dateFrom = req.query.date_from as string | undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // バッファをすぐにフラッシュしてクライアントに届ける
    if (typeof (res as any).flush === 'function') (res as any).flush();
  };

  try {
    const result = await service.runKakenUpdate({
      dateFrom,
      onProgress: (e) => send(e),
    });
    send({ type: 'done', result });
  } catch (err) {
    const msg = (err as Error).message;
    send({ type: 'error', message: msg });
  } finally {
    res.end();
  }
}

// ============================================================
// PDF 取込
// ============================================================

export async function uploadPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'PDFファイルが必要です' });
    return;
  }
  if (!file.originalname.toLowerCase().endsWith('.pdf') && file.mimetype !== 'application/pdf') {
    res.status(400).json({ error: 'PDFファイルのみ受け付けています' });
    return;
  }

  const result = await service.importPdfFile({
    buffer: file.buffer,
    originalName: file.originalname,
    importedBy: (req.headers['x-user-id'] as string) ?? undefined,
  });

  const statusCode = result.deliveryImport.parse_status === 'failed' ? 422 : 201;
  res.status(statusCode).json({
    data: {
      deliveryImport: result.deliveryImport,
      lines: result.lines,
      candidates: result.candidates,
      warnings: result.warnings,
    },
  });
}

// ============================================================
// 一覧
// ============================================================

export async function listDeliveryImports(req: Request, res: Response): Promise<void> {
  const query: DeliveryImportQuery = {
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
    person_name: req.query.person_name as string | undefined,
    site_id: req.query.site_id ? parseInt(req.query.site_id as string, 10) : undefined,
    raw_site_name: req.query.raw_site_name as string | undefined,
    no_site_name: req.query.no_site_name === 'true',
    item_name: req.query.item_name as string | undefined,
    unmatched_only: req.query.unmatched_only === 'true',
    parse_status: req.query.parse_status as DeliveryImportQuery['parse_status'],
    page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
  };

  const result = service.listDeliveryImports(query);
  res.json(result);
}

// ============================================================
// 詳細
// ============================================================

export async function getById(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: '無効な ID です' });
    return;
  }

  const detail = service.getDeliveryImportById(id);
  if (!detail) {
    res.status(404).json({ error: `delivery_import ${id} が見つかりません` });
    return;
  }

  res.json({ data: detail });
}

// ============================================================
// resolve-site
// ============================================================

export async function resolveSite(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: '無効な ID です' });
    return;
  }

  const { action, site_id, create_alias } = req.body as {
    action: ResolveSiteInput['action'];
    site_id?: number;
    create_alias?: boolean;
  };

  const validActions: ResolveSiteInput['action'][] = [
    'match_existing',
    'create_alias',
    'keep_unmatched',
    'ignore',
  ];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `action は ${validActions.join(' / ')} のいずれかです` });
    return;
  }

  service.resolveSite(id, { action, site_id, create_alias });
  res.json({ success: true, id, action });
}

// ============================================================
// 再解析
// ============================================================

export async function reparseById(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: '無効な ID です' });
    return;
  }

  const result = await service.reparseDeliveryImport(id);
  res.json({ data: result });
}

// ============================================================
// 未分類現場名
// ============================================================

export async function getUnmatchedSites(_req: Request, res: Response): Promise<void> {
  const groups = service.getUnmatchedSites();
  res.json({ data: groups, total: groups.length });
}

// ============================================================
// 集計
// ============================================================

export async function summaryBySite(req: Request, res: Response): Promise<void> {
  const opts = {
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
    person_name: req.query.person_name as string | undefined,
  };
  res.json({ data: service.getSummaryBySite(opts) });
}

export async function summaryByItem(req: Request, res: Response): Promise<void> {
  const opts = {
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
  };
  res.json({ data: service.getSummaryByItem(opts) });
}

export async function summaryByDate(req: Request, res: Response): Promise<void> {
  const opts = {
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
  };
  res.json({ data: service.getSummaryByDate(opts) });
}

export async function summaryByPerson(req: Request, res: Response): Promise<void> {
  const opts = {
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
  };
  res.json({ data: service.getSummaryByPerson(opts) });
}

export async function summarySiteItems(req: Request, res: Response): Promise<void> {
  const site_name = req.query.site_name as string | undefined;
  if (!site_name) {
    res.status(400).json({ error: 'site_name は必須です' });
    return;
  }
  const opts = {
    site_name,
    date_from: req.query.date_from as string | undefined,
    date_to: req.query.date_to as string | undefined,
  };
  res.json({ data: service.getSiteItems(opts) });
}
