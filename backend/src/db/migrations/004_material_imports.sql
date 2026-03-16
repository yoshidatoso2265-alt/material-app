-- 004_material_imports.sql
-- CSV取込バッチ（1回の取込 = 1レコード）
--
-- 論理削除方針:
--   - deleted_at IS NULL → 有効な取込（集計対象）
--   - deleted_at IS NOT NULL → 論理削除済み（集計・一覧から除外）
--   - 物理削除は行わない（監査証跡・storage のファイルも残す）
--   - 関連する material_import_rows は import_id JOIN + deleted_at IS NULL でフィルタ
--
-- 処理時間管理:
--   - started_at: 取込処理開始日時
--   - finished_at: 完了または失敗日時
--   - imported_at: レコード作成日時（INSERT時刻）
--   - 処理時間 = finished_at - started_at で計算可能

CREATE TABLE IF NOT EXISTS material_imports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  filename        TEXT NOT NULL,     -- 元CSVファイル名（オリジナル）
  raw_file_path   TEXT,              -- storage/csv_raw/ 以下の相対パス
                                     -- 例: csv_raw/2024-01/3_20240115143022_manual_order.csv
  source_type     TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source_type IN (
                    'manual',       -- 手動アップロード
                    'kaken_auto'    -- 化研マテリアル自動取得（Phase 5以降）
                  )),
  period_from     TEXT,              -- 取得対象期間 開始 (YYYY-MM-DD)
  period_to       TEXT,              -- 取得対象期間 終了 (YYYY-MM-DD)
  row_count       INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK (status IN (
                    'processing',  -- 処理中
                    'completed',   -- 正常完了（エラー0）
                    'partial',     -- 一部エラーで完了
                    'failed'       -- 全体失敗
                  )),
  started_at      TEXT,              -- 取込処理開始日時
  finished_at     TEXT,              -- 取込処理完了日時（失敗含む）
  imported_at     TEXT NOT NULL DEFAULT (datetime('now')),  -- レコード作成日時
  imported_by     TEXT,              -- 取込実行者（将来の認証連携用）
  deleted_at      TEXT DEFAULT NULL  -- 論理削除日時（NULL = 有効）
);

CREATE INDEX IF NOT EXISTS idx_imports_status      ON material_imports(status);
CREATE INDEX IF NOT EXISTS idx_imports_deleted_at  ON material_imports(deleted_at);
CREATE INDEX IF NOT EXISTS idx_imports_started_at  ON material_imports(started_at);
CREATE INDEX IF NOT EXISTS idx_imports_source_type ON material_imports(source_type);
