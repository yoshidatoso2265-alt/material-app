-- 納品書明細テーブル
-- PDF本文の明細行を1行1レコードとして保存する
-- 材料名は統合しない（item_name_raw を正とする）
-- item_name_normalized は検索用正規化のみ（統合・マージは禁止）
-- is_freight: 運賃・配送料フラグ
-- is_misc_charge: 小口割増・手数料フラグ

CREATE TABLE IF NOT EXISTS delivery_import_lines (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_import_id    INTEGER NOT NULL,
  line_no               INTEGER NOT NULL,
  item_name_raw         TEXT,              -- 材料名（原文）※統合しない
  item_name_normalized  TEXT,             -- 検索用正規化（表示には使わない）
  spec_raw              TEXT,              -- 規格容量（原文）
  quantity              REAL,
  unit                  TEXT,
  unit_price            REAL,
  amount_ex_tax         REAL,
  tax_amount            REAL,
  amount_in_tax         REAL,
  is_freight            INTEGER NOT NULL DEFAULT 0,
  is_misc_charge        INTEGER NOT NULL DEFAULT 0,
  raw_line_text         TEXT,              -- 元行テキスト（再解析用）
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(delivery_import_id) REFERENCES delivery_imports(id)
);

CREATE INDEX IF NOT EXISTS idx_dil_delivery_import_id   ON delivery_import_lines(delivery_import_id);
CREATE INDEX IF NOT EXISTS idx_dil_item_name_raw        ON delivery_import_lines(item_name_raw);
CREATE INDEX IF NOT EXISTS idx_dil_item_name_normalized ON delivery_import_lines(item_name_normalized);
