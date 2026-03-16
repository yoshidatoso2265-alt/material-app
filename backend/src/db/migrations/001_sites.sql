-- 001_sites.sql
-- 現場マスター
--
-- 将来 shared-core に昇格予定（labor-management / customer-inspection との共通マスター化）
-- その際、このテーブルを参照する全テーブルの FK はそのまま使用可能
--
-- normalized_name 設計方針:
--   - sites.name 保存時に必ず siteNameNormalizer.ts で生成して同時保存
--   - 既存データ更新時も再生成する（アプリ層で保証）
--   - 表記ゆれ候補抽出・類似度比較の主入力として使用
--   - 正規化ルール: 敬称除去・法人格除去・全角→半角・記号除去・トリム
--   - 例: 「田中様邸」→「田中」 / 「株式会社田中建設」→「田中建設」

CREATE TABLE IF NOT EXISTS sites (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  site_code       TEXT UNIQUE,           -- 現場コード（例: SITE-2024-001）将来自動採番予定
  name            TEXT NOT NULL,         -- 管理者が確定した正式現場名
  normalized_name TEXT NOT NULL DEFAULT '', -- 正規化済み名称（検索・類似度比較に使用）
                                         -- DEFAULT '' は既存データ保護用。アプリ層で常に生成する
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'closed', 'unknown')),
  customer_id     INTEGER,               -- 将来: customers テーブル FK（未実装）
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_normalized_name ON sites(normalized_name);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
