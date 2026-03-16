-- 002_site_aliases.sql
-- 現場エイリアス（表記ゆれ管理）
--
-- 設計方針:
--   - alias_name: CSV上の生の表記（変更不可・監査・表示用）
--   - normalized_alias: 正規化済み表記（比較・候補抽出の主入力）
--
-- 表記ゆれ判定ルール（アプリ層 siteNameMatcher.ts で実装）:
--   - 完全一致（normalized_alias 同士）: status='auto' で自動紐づけ
--   - 類似度 0.7以上: status='pending' で管理者確認待ち
--   - 類似度 0.7未満: status='pending' で新規候補として提示
--
-- status 遷移:
--   pending → approved (管理者承認 → site_id 確定)
--   pending → rejected (管理者却下 → 別現場として登録)
--   rejected → pending (再評価。レコード再利用、新規作成しない)
--   auto (完全一致自動紐づけ。管理者確認スキップ)
--
-- alias_name 単体 UNIQUE を使わない理由:
--   - 却下後の再評価・ルール変更後の再処理に対応するため
--   - 代わりに「approved 状態では alias_name が一意」を部分インデックスで保証
--
-- アプリ層の補足制約（aliasService.ts に実装）:
--   - 同一 alias_name で pending が複数存在しないよう upsert 制御
--   - rejected を再度 pending に戻す場合は既存レコードを更新（新規作成しない）

CREATE TABLE IF NOT EXISTS site_aliases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id          INTEGER REFERENCES sites(id),   -- NULL = 未統合
  alias_name       TEXT NOT NULL,                  -- CSV上の生の表記（表示・監査用）
  normalized_alias TEXT NOT NULL DEFAULT '',       -- 正規化済み表記（比較・候補抽出の主入力）
  confidence       REAL,                           -- 類似スコア 0.0〜1.0（auto=1.0, 手動=NULL）
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',   -- 候補検出済み・管理者未確認
                     'approved',  -- 管理者承認済み → site_id 確定
                     'rejected',  -- 管理者却下（別現場として分離）
                     'auto'       -- 完全一致で自動紐づけ
                   )),
  reviewed_at      TEXT,
  reviewed_by      TEXT,                           -- 将来の認証連携用
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- approved 状態では alias_name が一意（部分インデックス）
-- SQLite 3.8.0+ / PostgreSQL 両対応
CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_approved_unique
  ON site_aliases(alias_name) WHERE status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_auto_unique
  ON site_aliases(alias_name) WHERE status = 'auto';

CREATE INDEX IF NOT EXISTS idx_aliases_alias_name      ON site_aliases(alias_name);
CREATE INDEX IF NOT EXISTS idx_aliases_normalized      ON site_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_aliases_status          ON site_aliases(status);
CREATE INDEX IF NOT EXISTS idx_aliases_site_id         ON site_aliases(site_id);
