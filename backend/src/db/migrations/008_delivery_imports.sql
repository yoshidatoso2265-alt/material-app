-- 納品書取込ヘッダテーブル
-- PDF本文を解析して抽出したヘッダ情報を保存する
-- source_type: kaken_pdf / manual_pdf
-- site_match_status: matched=確定 / candidate=候補あり / unmatched=未分類 / ignored=無視

CREATE TABLE IF NOT EXISTS delivery_imports (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type         TEXT    NOT NULL DEFAULT 'kaken_pdf',
  source_file_name    TEXT,
  source_file_path    TEXT,
  raw_text            TEXT,              -- 再解析用に全文保存
  delivery_date       TEXT,             -- YYYY-MM-DD
  raw_orderer_name    TEXT,             -- ご発注者
  raw_site_name       TEXT,             -- PDF上の現場名候補（最有力1件）
  raw_person_name     TEXT,             -- 担当者候補
  matched_site_id     INTEGER,          -- 紐づけ確定した sites.id
  matched_site_name   TEXT,             -- 表示用確定現場名
  site_match_status   TEXT    NOT NULL DEFAULT 'unmatched'
                      CHECK(site_match_status IN ('matched','candidate','unmatched','ignored')),
  site_match_score    REAL,
  total_amount_ex_tax REAL,
  total_tax           REAL,
  total_amount_in_tax REAL,
  parse_status        TEXT    NOT NULL DEFAULT 'success'
                      CHECK(parse_status IN ('success','partial','failed')),
  parse_confidence    REAL,             -- 0.0〜1.0
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(matched_site_id) REFERENCES sites(id)
);

CREATE INDEX IF NOT EXISTS idx_di_delivery_date     ON delivery_imports(delivery_date);
CREATE INDEX IF NOT EXISTS idx_di_raw_site_name     ON delivery_imports(raw_site_name);
CREATE INDEX IF NOT EXISTS idx_di_raw_person_name   ON delivery_imports(raw_person_name);
CREATE INDEX IF NOT EXISTS idx_di_site_match_status ON delivery_imports(site_match_status);
CREATE INDEX IF NOT EXISTS idx_di_matched_site_id   ON delivery_imports(matched_site_id);
CREATE INDEX IF NOT EXISTS idx_di_created_at        ON delivery_imports(created_at DESC);
