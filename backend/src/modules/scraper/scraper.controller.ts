import { Request, Response } from 'express';
import {
  runProbe as probeService,
  listArtifacts as listArtifactsService,
  getLastRunResult,
  runBackfill as runBackfillService,
  getRunHistory,
  runScraperWithHistory,
  formatDate,
} from './scraper.service';
import { asyncHandler } from '../../utils/asyncHandler';

/** POST /api/scraper/run — フル実行（ログイン〜DB保存） */
export const runScraper = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = req.body as {
    dateFrom?: string;
    dateTo?: string;
  };
  const result = await runScraperWithHistory('manual', { dateFrom, dateTo });
  res.json(result);
});

/** POST /api/scraper/probe — ログインして post-login HTML/SS を保存 */
export const runProbe = asyncHandler(async (_req: Request, res: Response) => {
  const result = await probeService();
  res.json(result);
});

/** GET /api/scraper/artifacts — 保存済みスクリーンショット一覧 */
export const listArtifacts = asyncHandler(async (_req: Request, res: Response) => {
  const files = listArtifactsService();
  res.json({ files });
});

/** GET /api/scraper/last-result — 最後の kaken_auto 取込結果 */
export const getLastResult = asyncHandler(async (_req: Request, res: Response) => {
  const result = getLastRunResult();
  res.json(result ?? null);
});

/** GET /api/scraper/history — 実行履歴一覧 */
export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const result = getRunHistory(limit);
  res.json(result);
});

/** POST /api/scraper/backfill — バックフィル実行 */
export const runBackfillHandler = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo, chunkDays } = req.body as {
    dateFrom?: string;
    dateTo?: string;
    chunkDays?: number;
  };
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const result = await runBackfillService({
    dateFrom: dateFrom ?? formatDate(sixMonthsAgo),
    dateTo: dateTo ?? formatDate(today),
    chunkDays: chunkDays ?? 7,
  });
  res.json(result);
});
