-- スクレイパー実行履歴テーブル
-- run_type: auto=自動(cron) / manual=手動 / backfill=バックフィル
-- status: running=実行中 / completed=完了 / failed=失敗

CREATE TABLE IF NOT EXISTS scraper_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_type       TEXT    NOT NULL CHECK(run_type IN ('auto','manual','backfill')),
  status         TEXT    NOT NULL DEFAULT 'running'
                         CHECK(status IN ('running','completed','failed')),
  date_from      TEXT,
  date_to        TEXT,
  fetched_count  INTEGER DEFAULT 0,
  inserted_count INTEGER DEFAULT 0,
  skipped_count  INTEGER DEFAULT 0,
  mode           TEXT,
  error_message  TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at ON scraper_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_run_type   ON scraper_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status     ON scraper_runs(status);
