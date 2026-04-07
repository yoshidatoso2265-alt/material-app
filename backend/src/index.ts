/**
 * エントリーポイント
 *
 * 起動順序:
 *   1. dotenv で .env を読み込む
 *   2. DBマイグレーションを実行
 *   3. Expressサーバーを起動
 */

import 'dotenv/config';
import { runMigrations } from './db/migrate';
import { createApp } from './app';
import { logger } from './utils/logger';
import { closeDb } from './db/client';
import { startScheduler } from './scheduler';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

function ensureStorageDirs(): void {
  const base = process.env.STORAGE_BASE_PATH ?? './storage';
  const dirs = [
    path.join(base, 'csv_raw'),
    path.join(base, 'csv_normalized'),
    path.join(base, 'screenshots'),
    path.join(base, 'pdf_raw'),
    path.join(base, 'pdf_inbox'),  // 手動配置PDF の取込受け箱
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Storage directory created: ${dir}`);
    }
  }
}

async function main(): Promise<void> {
  // ストレージディレクトリの確保
  ensureStorageDirs();

  // DBマイグレーション
  logger.info('Running database migrations...');
  runMigrations();

  // スケジューラー起動
  startScheduler();

  // Expressアプリ作成・起動
  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });

  // Playwright スクレイピングは長時間かかるためタイムアウトを延長（20分）
  server.timeout = 20 * 60 * 1000;
  server.keepAliveTimeout = 20 * 60 * 1000;

  // グレースフルシャットダウン
  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      closeDb();
      logger.info('Server closed');
      process.exit(0);
    });
    // 強制終了タイムアウト（10秒）
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal error on startup', err);
  process.exit(1);
});
