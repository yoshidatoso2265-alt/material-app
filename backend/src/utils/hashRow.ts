/**
 * 取込行の重複判定ハッシュ生成
 *
 * 設計方針:
 *   - 純関数で実装（副作用なし・テスト容易）
 *   - ハッシュ対象フィールドと正規化ルールはこのファイルに集約する
 *   - 将来フィールドを追加・変更した場合は既存ハッシュが変わるため注意
 *     （DB全体の再計算が必要になる可能性あり）
 *
 * ハッシュ対象フィールド（この順番で連結・変更厳禁）:
 *   order_date, delivery_date, slip_number, raw_site_name,
 *   material_name, spec, quantity, unit, unit_price, amount
 *
 * 正規化ルール:
 *   - 文字列: trim() → toLowerCase()（全角スペースを半角に変換）
 *   - 数値:   toFixed(6) 形式（例: 1.0 → "1.000000"）
 *   - null / undefined: 空文字 "" として扱う
 *   - 日付: スラッシュをハイフンに統一（2024/01/15 → 2024-01-15）
 *
 * 連結方式: フィールドを "|" で区切り → SHA-256 → hex文字列（64文字）
 *
 * 例:
 *   "2024-01-15|2024-01-17|D-001|田中様邸|シリコン|4kg缶|2.000000|缶|3500.000000|7000.000000"
 *   → SHA-256 → "a3f8c2d1..."
 */

import { createHash } from 'crypto';

export interface HashableRow {
  order_date?: string | null;
  delivery_date?: string | null;
  slip_number?: string | null;
  raw_site_name?: string | null;
  material_name?: string | null;
  spec?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number | null;
}

/** 文字列フィールドの正規化 */
function normalizeStr(val: string | null | undefined): string {
  if (val == null) return '';
  return val
    .replace(/　/g, ' ') // 全角スペース→半角
    .trim()
    .toLowerCase();
}

/** 数値フィールドの正規化 */
function normalizeNum(val: number | null | undefined): string {
  if (val == null) return '';
  // 精度の問題を避けるため固定桁数で文字列化
  return val.toFixed(6);
}

/** 日付フィールドの正規化 */
function normalizeDate(val: string | null | undefined): string {
  if (val == null) return '';
  return val.trim().replace(/\//g, '-'); // YYYY/MM/DD → YYYY-MM-DD
}

/**
 * 取込行から source_row_hash を生成する
 * 重複判定に使用する（DB に保存し、インデックスで高速検索）
 */
export function generateSourceRowHash(row: HashableRow): string {
  const parts: string[] = [
    normalizeDate(row.order_date),
    normalizeDate(row.delivery_date),
    normalizeStr(row.slip_number),
    normalizeStr(row.raw_site_name),
    normalizeStr(row.material_name),
    normalizeStr(row.spec),
    normalizeNum(row.quantity),
    normalizeStr(row.unit),
    normalizeNum(row.unit_price),
    normalizeNum(row.amount),
  ];

  const input = parts.join('|');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
