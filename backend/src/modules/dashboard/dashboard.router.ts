import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { asyncHandler } from '../../utils/asyncHandler';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/summary',
  asyncHandler(dashboardController.getSummary.bind(dashboardController))
);
