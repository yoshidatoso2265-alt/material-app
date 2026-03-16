import { Router } from 'express';
import { sitesController } from './sites.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';

export const sitesRouter = Router();

// ============================================================
// 現場 CRUD
// ============================================================
sitesRouter.get('/', asyncHandler(sitesController.list.bind(sitesController)));
sitesRouter.post('/', requireAdmin, asyncHandler(sitesController.create.bind(sitesController)));
sitesRouter.get('/:id', asyncHandler(sitesController.getById.bind(sitesController)));
sitesRouter.put('/:id', requireAdmin, asyncHandler(sitesController.update.bind(sitesController)));

// ============================================================
// 現場別材料費
// ============================================================
sitesRouter.get('/:id/materials', asyncHandler(sitesController.getMaterials.bind(sitesController)));
sitesRouter.get('/:id/summary', asyncHandler(sitesController.getSummary.bind(sitesController)));

// ============================================================
// 表記ゆれ管理
// ============================================================

// エイリアス一覧・候補
// ※ /aliases より先に /aliases/candidates を登録（パス衝突防止）
sitesRouter.get(
  '/aliases/candidates',
  asyncHandler(sitesController.getAliasCandidates.bind(sitesController))
);
sitesRouter.get(
  '/aliases/pending',
  asyncHandler(sitesController.getPendingAliases.bind(sitesController))
);

// 正規化プレビュー
sitesRouter.get(
  '/normalize/preview',
  asyncHandler(sitesController.previewNormalized.bind(sitesController))
);

// 承認・却下（管理者のみ）
sitesRouter.post(
  '/aliases/:id/approve',
  requireAdmin,
  asyncHandler(sitesController.approveAlias.bind(sitesController))
);
sitesRouter.post(
  '/aliases/:id/reject',
  requireAdmin,
  asyncHandler(sitesController.rejectAlias.bind(sitesController))
);
