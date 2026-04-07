-- 現場名マッチング候補テーブル
-- delivery_imports の raw_site_name に対して類似スコアで候補を保存する
-- status: pending=未処理 / approved=承認済み / rejected=却下
-- 承認時は delivery_imports.matched_site_id を更新し、
-- 必要に応じて site_aliases にも登録する

CREATE TABLE IF NOT EXISTS site_match_candidates (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_import_id    INTEGER NOT NULL,
  raw_site_name         TEXT    NOT NULL,
  candidate_site_id     INTEGER,
  candidate_site_name   TEXT,
  similarity_score      REAL,
  status                TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','approved','rejected')),
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(delivery_import_id) REFERENCES delivery_imports(id),
  FOREIGN KEY(candidate_site_id)  REFERENCES sites(id)
);

CREATE INDEX IF NOT EXISTS idx_smc_delivery_import_id ON site_match_candidates(delivery_import_id);
CREATE INDEX IF NOT EXISTS idx_smc_status             ON site_match_candidates(status);
CREATE INDEX IF NOT EXISTS idx_smc_raw_site_name      ON site_match_candidates(raw_site_name);
