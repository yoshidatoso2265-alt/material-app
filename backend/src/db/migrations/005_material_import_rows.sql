-- 005_material_import_rows.sql
-- CSV取込明細（1行 = 1材料納品レコード）
--
-- ============================================================
-- 集計対象条件（全クエリで必ず適用すること）
-- ============================================================
--   JOIN material_imports mi ON mi.id = r.import_id
--   WHERE mi.deleted_at IS NULL   -- 論理削除されていない取込のみ
--     AND r.is_duplicate = 0      -- 重複行を除外
--     AND r.has_error = 0         -- エラー行を除外
--     AND r.amount IS NOT NULL    -- 金額が存在する行のみ
--
-- 現場別集計（確定済みのみ）:  上記 + AND r.site_id IS NOT NULL
-- 未分類集計（要確認）:        上記 + AND r.site_id IS NULL
-- ============================================================
--
-- source_row_hash 生成ルール（hashRow.ts で実装）:
--   対象フィールド（この順番で連結）:
--     order_date, delivery_date, slip_number, raw_site_name,
--     material_name, spec, quantity, unit, unit_price, amount
--
--   正規化:
--     - 文字列: trim() → toLowerCase()（全角スペース→半角）
--     - 数値:   toFixed(6) 形式（例: 1.0 → "1.000000"）
--     - null/undefined: 空文字 "" として扱う
--     - 日付: YYYY-MM-DD 形式（/ → - 変換）
--
--   連結: "|" 区切り → SHA-256 → hex 文字列（64文字）
--
--   重複判定:
--     - UNIQUE制約は設けない（重複を記録し is_duplicate フラグで管理）
--     - 論理削除済みimportに属するhashは「既存」として扱わない
--     - どの取込で重複したか duplicate_of_id で追跡可能
--
-- 数値型注記:
--   SQLite:     REAL（浮動小数点）で保存
--   PostgreSQL: quantity → DECIMAL(10,3)
--               unit_price / amount → DECIMAL(12,2) に変更すること
--               （db/client.ts 切替時に合わせてマイグレーション実施）

CREATE TABLE IF NOT EXISTS material_import_rows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id       INTEGER NOT NULL REFERENCES material_imports(id),
  site_id         INTEGER REFERENCES sites(id),        -- NULL = 現場未解決
  site_alias_id   INTEGER REFERENCES site_aliases(id), -- 紐づいたエイリアス
  raw_site_name   TEXT,          -- CSV上の生の現場名（変更不可・原本保持）

  order_date      TEXT,          -- 注文日 (YYYY-MM-DD)
  delivery_date   TEXT,          -- 納品日 (YYYY-MM-DD)
  slip_number     TEXT,          -- 伝票番号

  material_name   TEXT NOT NULL,
  spec            TEXT,          -- 規格

  -- 数値型: SQLite=REAL / PostgreSQL移行時=DECIMAL
  quantity        REAL,          -- 数量   (PG: DECIMAL(10,3))
  unit            TEXT,          -- 単位
  unit_price      REAL,          -- 単価   (PG: DECIMAL(12,2))
  amount          REAL,          -- 金額   (PG: DECIMAL(12,2))

  supplier        TEXT,          -- 取引先
  row_index       INTEGER,       -- CSV上の行番号（0始まり）

  -- 重複判定ハッシュ
  source_row_hash TEXT NOT NULL, -- SHA-256 hex（正規化後フィールドの連結）
                                 -- UNIQUE制約なし（重複記録のため）

  is_duplicate    INTEGER NOT NULL DEFAULT 0,  -- 1 = 重複行（集計除外）
  duplicate_of_id INTEGER,                     -- 重複元の material_import_rows.id

  has_error       INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- source_row_hash: UNIQUEにしない（重複を記録するため）
CREATE INDEX IF NOT EXISTS idx_rows_source_row_hash ON material_import_rows(source_row_hash);
CREATE INDEX IF NOT EXISTS idx_rows_import_id        ON material_import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_rows_site_id          ON material_import_rows(site_id);
CREATE INDEX IF NOT EXISTS idx_rows_order_date       ON material_import_rows(order_date);
CREATE INDEX IF NOT EXISTS idx_rows_delivery_date    ON material_import_rows(delivery_date);
CREATE INDEX IF NOT EXISTS idx_rows_slip_number      ON material_import_rows(slip_number);
CREATE INDEX IF NOT EXISTS idx_rows_is_duplicate     ON material_import_rows(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_rows_has_error        ON material_import_rows(has_error);
CREATE INDEX IF NOT EXISTS idx_rows_material_name    ON material_import_rows(material_name);
