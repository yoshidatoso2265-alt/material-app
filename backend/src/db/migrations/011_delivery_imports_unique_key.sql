-- 納品書の重複取込防止用ユニークキー（PDF内容のSHA-256ハッシュ）
ALTER TABLE delivery_imports ADD COLUMN source_unique_key TEXT;

-- NULL を除くユニーク制約（SQLite の部分インデックスで実現）
CREATE UNIQUE INDEX idx_di_source_unique_key
  ON delivery_imports(source_unique_key)
  WHERE source_unique_key IS NOT NULL;
