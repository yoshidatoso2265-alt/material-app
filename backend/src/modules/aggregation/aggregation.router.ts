import { Router } from 'express';
import { listSiteAggregation, getSiteAggDetailHandler } from './aggregation.controller';

export const aggregationRouter = Router();

aggregationRouter.get('/sites', listSiteAggregation);
aggregationRouter.get('/sites/:siteName', getSiteAggDetailHandler);
