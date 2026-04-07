# material-cost-management / backend

塗装会社向け材料費管理システム バックエンド

---

## セットアップ

```bash
cd backend
cp .env.example .env   # 環境変数を設定
npm install
npm run dev            # 開発サーバー起動
```

ヘルスチェック:
```bash
curl http://localhost:3000/health
# → {"status":"ok","db":"connected",...}
```

---

## 環境変数

`.env.example` をコピーして `.env` を作成してください。

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `PORT` | サーバーポート | 3000 |
| `DB_PATH` | SQLite DBファイルパス | `./data/material.db` |
| `STORAGE_BASE_PATH` | CSV保存ルートパス | `./storage` |
| `CORS_ORIGINS` | 許可するオリジン（カンマ区切り） | `http://localhost:5173` |
| `UPLOAD_MAX_SIZE_BYTES` | アップロード上限 | 10485760 (10MB) |
| `KAKEN_LOGIN_ID` | 化研マテリアル ログインID（Phase 5以降） | - |
| `KAKEN_LOGIN_PASSWORD` | 化研マテリアル パスワード（Phase 5以降） | - |

**重要**: `KAKEN_LOGIN_PASSWORD` は `.env` ファイルにのみ記載し、
ソースコード・ログ・エラー出力・コミット履歴に含めないこと。

---

## storage/ 保存ルール

### ディレクトリ構造

```
storage/
├── csv_raw/           # 元CSVファイル（取込後も変更・削除しない）
│   └── YYYY-MM/       # 年月でディレクトリ分割
│       └── {import_id}_{YYYYMMDDHHmmss}_{source}_{filename}.csv
│
└── csv_normalized/    # 取込処理後の正規化済みデータ（JSON）
    └── YYYY-MM/
        └── {import_id}_normalized.json
```

### ファイル命名規則

**手動アップロード:**
```
3_20240115143022_manual_注文履歴202401.csv
↑id  ↑started_at   ↑source ↑サニタイズ済みファイル名（100文字上限）
```

**自動取得（Phase 5以降）:**
```
7_20240215090000_kaken_20240101-20240131.csv
                 ↑source ↑取得対象期間
```

### import_id との紐付け

`material_imports.raw_file_path` に相対パスを保存します：
```
csv_raw/2024-01/3_20240115143022_manual_order.csv
```

アプリ側での絶対パス解決:
```
path.join(STORAGE_BASE_PATH, import.raw_file_path)
```

### 再取込時の扱い

同一ファイルを再取込する場合:
1. 新しい `import_id` を発行（新規レコード作成）
2. 別ファイル名で csv_raw/ に保存（上書きしない）
3. `source_row_hash` で重複判定 → `is_duplicate` フラグで管理
4. 前回の import を論理削除（`deleted_at` をセット）

**元ファイルの原則:**
- `csv_raw/` のファイルは変更・削除しない
- 論理削除した import に対応するファイルも残す
- 監査証跡として永続保持

---

## source_row_hash 生成ルール

```
対象フィールド（この順番・変更厳禁）:
  order_date | delivery_date | slip_number | raw_site_name |
  material_name | spec | quantity | unit | unit_price | amount

正規化:
  - 文字列: trim() → toLowerCase()（全角スペース→半角）
  - 数値:   toFixed(6)（例: 1.0 → "1.000000"）
  - null:   空文字 ""
  - 日付:   / → - 変換（YYYY-MM-DD 統一）

連結: "|" 区切り → SHA-256 → hex（64文字）
```

実装: `src/utils/hashRow.ts`

---

## 集計対象条件

全ての材料費集計クエリで以下を適用すること：

```sql
JOIN material_imports mi ON mi.id = r.import_id
WHERE mi.deleted_at IS NULL   -- 論理削除されていない取込のみ
  AND r.is_duplicate = 0      -- 重複行を除外
  AND r.has_error = 0         -- エラー行を除外
  AND r.amount IS NOT NULL    -- 金額が存在する行のみ
```

- **現場別集計**: 上記 + `AND r.site_id IS NOT NULL`
- **未分類集計**: 上記 + `AND r.site_id IS NULL`

---

## 表記ゆれ統合フロー

```
CSV取込 → raw_site_name をそのまま保存
  ↓
siteNameNormalizer で normalized_alias を生成
  ↓
完全一致（score=1.0）？
  Yes → auto で site_id 自動紐づけ
  No  → pending でエイリアス登録（管理者確認待ち）
  ↓
AliasReviewPage（/alias-review）で管理者が確認
  ↓
[統合する] → approved → site_id 確定 → 集計に反映
[新規現場] → 新 site 作成 → approved
[保留]     → pending のまま
```

**安全設計**: スコアが 1.0（完全一致）の場合のみ自動紐づけ。
それ以外は必ず管理者確認が必要。

---

## PoC 制約事項

- **グリッドフォールバック**: 化研マテリアルポータルは PDF 専用のため、CSVダウンロードではなくグリッド直読みにフォールバックします（`kaken_grid_` プレフィックスのファイル名）。
- **20行制限**: グリッドは最大20行しか表示されないため、期間が長い場合は全件取得できません。
- **暫定品名**: グリッドフォールバック時は品名が「現場名 (伝票番号)」形式で自動生成されます（`is_provisional_name = 1`）。
- **クライアントサイド日付フィルタ**: サーバーサイドの日付フィルタが動作しないため、取得後にJavaScriptで再フィルタします。

## 自動取得スケジュール

`node-cron` を使って毎日 06:00 (Asia/Tokyo) に自動実行されます。

`SCRAPER_CRON` 環境変数でスケジュールを変更できます：

```
# 毎日 08:00
SCRAPER_CRON=0 8 * * *

# 平日 07:30
SCRAPER_CRON=30 7 * * 1-5
```

各実行は `scraper_runs` テーブルに記録され、`GET /api/scraper/history` で取得できます。

## バックフィル API

過去データを一括取込する場合：

```bash
# デフォルト（過去6ヶ月、7日単位）
POST /api/scraper/backfill

# カスタム期間
POST /api/scraper/backfill
Content-Type: application/json
{
  "dateFrom": "2025-09-01",
  "dateTo": "2026-03-17",
  "chunkDays": 7
}
```

## データベーススキーマ概要

### `material_imports`
CSVインポートバッチ（1レコード = 1取込）。ステータス・行数・期間を管理。

### `material_import_rows`
インポートされたCSVの明細行。主要カラム：
- `raw_site_name`: CSVの現場名
- `normalized_site_name`: 現場名の正規化済み文字列（migration 007追加）
- `is_provisional_name`: グリッドフォールバック時の自動生成品名フラグ（migration 007追加）
- `is_duplicate`: 重複行フラグ
- `has_error`: パースエラーフラグ
- `source_row_hash`: 重複検出用 SHA-256 ハッシュ

### `sites`
現場マスター。`raw_site_name` の正規化一致で `material_import_rows` と紐づけ。

### `scraper_runs`
スクレイパー実行履歴。`run_type` は `auto` / `manual` / `backfill`。

### `material_site_aliases`
現場名の表記ゆれ候補（管理者承認待ち）。

## API 一覧

```
GET  /health

GET  /api/dashboard/summary

GET  /api/sites
POST /api/sites
GET  /api/sites/:id
PUT  /api/sites/:id
GET  /api/sites/:id/materials
GET  /api/sites/:id/summary
GET  /api/sites/aliases/pending
GET  /api/sites/aliases/candidates
POST /api/sites/aliases/:id/approve
POST /api/sites/aliases/:id/reject
GET  /api/sites/normalize/preview

GET  /api/materials
GET  /api/materials/:id

GET  /api/imports
POST /api/imports/upload
GET  /api/imports/:id
GET  /api/imports/:id/rows
GET  /api/imports/:id/errors
DELETE /api/imports/:id

POST /api/scraper/run
POST /api/scraper/probe
GET  /api/scraper/artifacts
GET  /api/scraper/last-result
GET  /api/scraper/history?limit=20
POST /api/scraper/backfill

GET  /api/aggregation/sites
GET  /api/aggregation/sites/:siteName
```

---

## 将来対応予定

- **Phase 5**: 化研マテリアル自動取得（Playwright）
  - `KAKEN_LOGIN_ID` / `KAKEN_LOGIN_PASSWORD` の設定が必要
  - `src/modules/integrations/kaken/` に実装予定

- **PostgreSQL 移行**:
  - `src/db/client.ts` の接続部分を差し替え
  - `REAL` → `DECIMAL(10,3)` / `DECIMAL(12,2)` へのマイグレーション

- **認証実装**（Phase 6）:
  - `src/middleware/auth.ts` の `requireAuth` / `requireAdmin` を実装
  - router 側のコードは変更不要
