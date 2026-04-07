import { Router } from 'express';
import { runScraper, runProbe, listArtifacts, getLastResult, getHistory, runBackfillHandler } from './scraper.controller';

export const scraperRouter = Router();

scraperRouter.post('/run', runScraper);
scraperRouter.post('/probe', runProbe);
scraperRouter.get('/artifacts', listArtifacts);
scraperRouter.get('/last-result', getLastResult);
scraperRouter.get('/history', getHistory);
scraperRouter.post('/backfill', runBackfillHandler);
