import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { getSiteAggregation, getSiteAggDetail } from './aggregation.service';

/** GET /api/aggregation/sites */
export const listSiteAggregation = asyncHandler(async (req: Request, res: Response) => {
  const { search, date_from, date_to } = req.query as Record<string, string | undefined>;
  const data = getSiteAggregation({ search, dateFrom: date_from, dateTo: date_to });
  res.json({ data, total: data.length });
});

/** GET /api/aggregation/sites/:siteName */
export const getSiteAggDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const rawSiteName = decodeURIComponent(req.params.siteName);
  const { date_from, date_to } = req.query as Record<string, string | undefined>;
  const data = getSiteAggDetail(rawSiteName, { dateFrom: date_from, dateTo: date_to });
  res.json(data);
});
