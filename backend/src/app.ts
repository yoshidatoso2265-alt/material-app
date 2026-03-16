import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// ルーター（各モジュール）
import { importsRouter } from './modules/imports/imports.router';
import { sitesRouter } from './modules/sites/sites.router';
import { materialsRouter } from './modules/materials/materials.router';
import { dashboardRouter } from './modules/dashboard/dashboard.router';

export function createApp(): express.Application {
  const app = express();

  // ============================================================
  // CORS
  // ============================================================
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  // ============================================================
  // ボディパーサー
  // ============================================================
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ============================================================
  // リクエストログ（開発環境のみ詳細）
  // ============================================================
  app.use((req, _res, next) => {
    logger.debug(`→ ${req.method} ${req.path}`);
    next();
  });

  // ============================================================
  // ヘルスチェック（認証不要）
  // ============================================================
  app.get('/health', (_req, res) => {
    const { getDb } = require('./db/client');
    let dbStatus = 'unknown';
    try {
      getDb().prepare('SELECT 1').get();
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: dbStatus,
      env: process.env.NODE_ENV ?? 'development',
    });
  });

  // ============================================================
  // API ルーター登録
  // ============================================================
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/sites', sitesRouter);
  app.use('/api/materials', materialsRouter);

  // ============================================================
  // 404 / エラーハンドラー（必ず最後に登録）
  // ============================================================
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
