/**
 * delivery-imports ルーター
 *
 * 注意: /unmatched-sites, /summary/* は /:id より前に登録すること（パス衝突防止）
 */

import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler';
import * as ctrl from './delivery-imports.controller';

export const deliveryImportsRouter = Router();

// multer: メモリストレージ（ファイルはサービス層で保存）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(new Error('PDFファイルのみ受け付けています'));
    }
  },
});

// ============================================================
// 一括更新（pdf_inbox スキャン） — /:id より先に登録
// ============================================================
deliveryImportsRouter.post('/update', asyncHandler(ctrl.update));
// SSEストリーム版（進捗リアルタイム配信）
deliveryImportsRouter.get('/update-stream', ctrl.updateStream);

// ============================================================
// PDF 取込
// ============================================================
deliveryImportsRouter.post(
  '/from-pdf',
  upload.single('file'),
  asyncHandler(ctrl.uploadPdf)
);

// ============================================================
// 集計 (/:id より先に登録)
// ============================================================
deliveryImportsRouter.get('/unmatched-sites', asyncHandler(ctrl.getUnmatchedSites));
deliveryImportsRouter.get('/summary/by-site',   asyncHandler(ctrl.summaryBySite));
deliveryImportsRouter.get('/summary/by-item',   asyncHandler(ctrl.summaryByItem));
deliveryImportsRouter.get('/summary/by-date',   asyncHandler(ctrl.summaryByDate));
deliveryImportsRouter.get('/summary/by-person',     asyncHandler(ctrl.summaryByPerson));
deliveryImportsRouter.get('/summary/site-items',   asyncHandler(ctrl.summarySiteItems));

// ============================================================
// 一覧
// ============================================================
deliveryImportsRouter.get('/', asyncHandler(ctrl.listDeliveryImports));

// ============================================================
// 個別操作（/:id 系）
// ============================================================
deliveryImportsRouter.get('/:id',             asyncHandler(ctrl.getById));
deliveryImportsRouter.post('/:id/resolve-site', asyncHandler(ctrl.resolveSite));
deliveryImportsRouter.post('/:id/reparse',      asyncHandler(ctrl.reparseById));
