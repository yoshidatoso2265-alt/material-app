/**
 * DBマイグレーション実行
 *
 * migrations/ ディレクトリ内の .sql ファイルをファイル名順に実行する。
 * schema_migrations テーブルで実行済みのバージョンを管理し、
 * 未実行のものだけを適用する（冪等性）。
 */

import fs from 'fs';
import path from 'path';
import { getDb } from './client';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      executed_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function getExecutedVersions(): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[];
  return new Set(rows.map((r) => r.version));
}

function recordVersion(version: string): void {
  const db = getDb();
  db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
}

export function runMigrations(): void {
  ensureMigrationsTable();
  const executedVersions = getExecutedVersions();

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 001_, 002_, ... の順番で実行

  let applied = 0;

  for (const file of sqlFiles) {
    if (executedVersions.has(file)) {
      logger.debug(`Migration already applied: ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      const db = getDb();
      // トランザクション内で実行（失敗時はロールバック）
      db.exec(sql);
      recordVersion(file);
      logger.info(`Migration applied: ${file}`);
      applied++;
    } catch (err) {
      logger.error(`Migration failed: ${file}`, err);
      throw new Error(`Migration failed at ${file}: ${(err as Error).message}`);
    }
  }

  if (applied === 0) {
    logger.info('All migrations already up to date');
  } else {
    logger.info(`${applied} migration(s) applied`);
  }
}

// 直接実行時（npm run migrate）
if (require.main === module) {
  // eslint では require.main 直接実行の場合のみ dotenv を読む
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
  runMigrations();
  logger.info('Migration complete');
  process.exit(0);
}
