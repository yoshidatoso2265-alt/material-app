import { Router } from 'express';
import { materialsController } from './materials.controller';
import { asyncHandler } from '../../utils/asyncHandler';

export const materialsRouter = Router();

materialsRouter.get('/', asyncHandler(materialsController.list.bind(materialsController)));
materialsRouter.get('/:id', asyncHandler(materialsController.getById.bind(materialsController)));
