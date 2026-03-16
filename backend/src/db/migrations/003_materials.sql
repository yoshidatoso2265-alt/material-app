-- 003_materials.sql
-- 材料マスター（将来: 材料カタログ・仕入先価格管理）
--
-- MVP では material_import_rows から材料名を参照するため
-- このテーブルは現時点では最小構成のみ定義する。
-- 将来的に材料の統一コード管理・単価マスター化に使用する。

CREATE TABLE IF NOT EXISTS materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,   -- 材料名（正規化済み）
  spec          TEXT,            -- 規格
  unit          TEXT,            -- 単位
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);
