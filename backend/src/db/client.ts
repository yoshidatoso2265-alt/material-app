/**
 * DB接続モジュール
 *
 * 現在: better-sqlite3（同期API）を使用
 * 将来 PostgreSQL に移行する場合:
 *   1. このファイルの getDb() を pg/postgres クライアントに差し替え
 *   2. repository 層のメソッドを async/await に変更
 *   3. REAL → DECIMAL(12,2) / DECIMAL(10,3) への型マイグレーションを実施
 *
 * repository 層以外はこのファイルを直接参照しないこと
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'material.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // DBディレクトリが存在しない場合は作成
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    logger.info(`DB directory created: ${dbDir}`);
  }

  _db = new Database(DB_PATH);

  // WAL モード: 読み書き並列性向上（将来のPG移行前提でも有効）
  _db.pragma('journal_mode = WAL');
  // 外部キー制約を有効化
  _db.pragma('foreign_keys = ON');

  logger.info(`SQLite connected: ${DB_PATH}`);
  return _db;
}

/** テスト・シャットダウン用 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    logger.info('SQLite connection closed');
  }
}
