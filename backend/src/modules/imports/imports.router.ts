import { Router } from 'express';
import multer from 'multer';
import { importsController } from './imports.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';

// メモリストレージ（import_id 取得後に正式パスへ保存）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_BYTES ?? '10485760', 10),
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.csv')
    ) {
      cb(null, true);
    } else {
      cb(new Error('CSVファイルのみアップロード可能です'));
    }
  },
});

export const importsRouter = Router();

// CSV アップロード取込
importsRouter.post(
  '/upload',
  upload.single('file'),
  asyncHandler(importsController.upload.bind(importsController))
);

// 取込履歴一覧
importsRouter.get('/', asyncHandler(importsController.list.bind(importsController)));

// 取込詳細
importsRouter.get(
  '/:id',
  asyncHandler(importsController.getById.bind(importsController))
);

// 取込明細一覧
importsRouter.get(
  '/:id/rows',
  asyncHandler(importsController.getRows.bind(importsController))
);

// エラー行一覧
importsRouter.get(
  '/:id/errors',
  asyncHandler(importsController.getErrors.bind(importsController))
);

// 論理削除（管理者のみ）
importsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(importsController.softDelete.bind(importsController))
);
