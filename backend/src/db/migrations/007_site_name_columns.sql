-- material_import_rows に正規化済み現場名と暫定品名フラグを追加
-- normalized_site_name: raw_site_name を正規化したもの（集計・検索用）
-- is_provisional_name: 1 = 品名がグリッドから自動合成された暫定値（明細なし）

ALTER TABLE material_import_rows ADD COLUMN normalized_site_name TEXT;
ALTER TABLE material_import_rows ADD COLUMN is_provisional_name  INTEGER NOT NULL DEFAULT 0;

-- 既存データのバックフィルは TS 側で行うため、ここでは NULL のままにする

CREATE INDEX IF NOT EXISTS idx_mir_normalized_site_name
  ON material_import_rows(normalized_site_name);
