/**
 * CSV行の正規化モジュール
 *
 * 化研マテリアルCSVの列名マッピングと値の正規化を行う。
 *
 * カラムマッピング設計方針:
 *   - 実際の化研マテリアルCSVのカラム名が確定したら COLUMN_MAP を更新する
 *   - 複数の候補名を配列で定義し、最初にマッチしたものを使用する
 *   - マッピングできなかった列はログに出力して後で確認できるようにする
 *
 * 日付正規化:
 *   - YYYY/MM/DD → YYYY-MM-DD
 *   - YYYY年MM月DD日 → YYYY-MM-DD
 *   - 和暦（令和・平成）は現時点では非対応（将来追加予定）
 *
 * 数値正規化:
 *   - カンマ区切り: "1,000" → 1000
 *   - 円マーク: "¥1,000" → 1000
 *   - 全角数字: "１２３" → 123
 */

import { RawCsvRow } from './csvParser';
import { logger } from '../../../utils/logger';

/** 正規化後の行データ */
export interface NormalizedRow {
  order_date: string | null;
  delivery_date: string | null;
  slip_number: string | null;
  raw_site_name: string | null;
  material_name: string;
  spec: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  supplier: string | null;
}

/** 正規化結果（エラー情報付き） */
export interface NormalizationResult {
  row: NormalizedRow;
  errors: string[];
  hasError: boolean;
}

/**
 * 内部フィールド名 → CSVカラム名候補
 *
 * 化研マテリアルCSVのカラム名が判明したら、
 * 配列の先頭に実際のカラム名を追加してください。
 *
 * ※ このマッピングはこのファイルに集約する
 */
const COLUMN_MAP: Record<keyof NormalizedRow, string[]> = {
  order_date:    ['注文日', '発注日', '受注日', 'order_date', '注文年月日'],
  delivery_date: ['納品日', '出荷日', '発送日', 'delivery_date', '納品年月日', '出荷年月日'],
  slip_number:   ['伝票番号', '伝票No', '伝票no', 'slip_number', '注文番号', '伝票ＮＯ'],
  raw_site_name: ['現場名', '工事名', '現場', 'site_name', '工事現場', '納入場所'],
  material_name: ['品名', '材料名', '商品名', 'material_name', '品目', '商品'],
  spec:          ['規格', '仕様', 'spec', '品番', '型番', '規格・仕様'],
  quantity:      ['数量', 'quantity', '注文数量', '発注数量'],
  unit:          ['単位', 'unit', '数量単位'],
  unit_price:    ['単価', '仕入単価', 'unit_price', '売単価', '仕入価格'],
  amount:        ['金額', '合計', '仕入金額', 'amount', '合計金額', '仕入合計'],
  supplier:      ['取引先', '仕入先', '業者名', 'supplier', 'メーカー', '仕入先名'],
};

/**
 * ヘッダー行から内部フィールド名への対応マップを作成する
 * 一度計算して再利用する（大量行処理の効率化）
 */
export function buildColumnMapping(headers: string[]): Map<keyof NormalizedRow, string | null> {
  const mapping = new Map<keyof NormalizedRow, string | null>();
  const unmappedHeaders: string[] = [...headers];

  for (const [field, candidates] of Object.entries(COLUMN_MAP)) {
    const matched = candidates.find((c) =>
      headers.some((h) => h.trim() === c || h.trim().toLowerCase() === c.toLowerCase())
    );
    if (matched) {
      // 実際のヘッダー名（大文字小文字を保持）を探す
      const actualHeader = headers.find(
        (h) => h.trim() === matched || h.trim().toLowerCase() === matched.toLowerCase()
      ) ?? matched;
      mapping.set(field as keyof NormalizedRow, actualHeader);
      const idx = unmappedHeaders.indexOf(actualHeader);
      if (idx >= 0) unmappedHeaders.splice(idx, 1);
    } else {
      mapping.set(field as keyof NormalizedRow, null);
    }
  }

  // マッピングできなかった列を警告ログ出力
  if (unmappedHeaders.length > 0) {
    logger.warn('CSV unmapped columns (review COLUMN_MAP)', { unmappedHeaders });
  }

  // マッピングできなかった必須フィールドを警告
  const requiredFields: Array<keyof NormalizedRow> = ['material_name'];
  for (const field of requiredFields) {
    if (!mapping.get(field)) {
      logger.warn(`Required CSV column not found: ${field}`, {
        candidates: COLUMN_MAP[field],
      });
    }
  }

  return mapping;
}

/** 値を行から取得（未マッピングの場合は null） */
function getVal(
  row: RawCsvRow,
  colName: string | null | undefined
): string | null {
  if (!colName) return null;
  const val = row[colName];
  if (val === undefined || val === null || val.trim() === '' || val === '-' || val === '－') {
    return null;
  }
  return val.trim();
}

/** 日付文字列を YYYY-MM-DD に正規化 */
function normalizeDate(val: string | null): string | null {
  if (!val) return null;

  // YYYY/MM/DD
  const slashMatch = val.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY-MM-DD（そのまま）
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

  // YYYY年MM月DD日
  const kanjiMatch = val.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (kanjiMatch) {
    const [, y, m, d] = kanjiMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(val)) {
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
  }

  // パース不能
  logger.warn('Cannot parse date', { val });
  return null;
}

/** 数値文字列を number に変換 */
function parseNumber(val: string | null): number | null {
  if (!val) return null;

  // 全角数字→半角
  const half = val
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')   // カンマ除去
    .replace(/[¥￥]/g, '')   // 円マーク除去
    .trim();

  const num = parseFloat(half);
  if (isNaN(num)) {
    logger.warn('Cannot parse number', { original: val, half });
    return null;
  }
  return num;
}

/**
 * 1行分の RawCsvRow を NormalizedRow に変換する
 *
 * @param rawRow    生のCSV行データ
 * @param colMap    buildColumnMapping() で作成したマッピング
 * @param rowIndex  CSV上の行番号（エラーメッセージ用）
 */
export function normalizeRow(
  rawRow: RawCsvRow,
  colMap: Map<keyof NormalizedRow, string | null>,
  rowIndex: number
): NormalizationResult {
  const errors: string[] = [];

  const materialNameRaw = getVal(rawRow, colMap.get('material_name'));
  if (!materialNameRaw) {
    errors.push(`Row ${rowIndex}: material_name (品名) が空です`);
  }

  const normalized: NormalizedRow = {
    order_date:    normalizeDate(getVal(rawRow, colMap.get('order_date'))),
    delivery_date: normalizeDate(getVal(rawRow, colMap.get('delivery_date'))),
    slip_number:   getVal(rawRow, colMap.get('slip_number')),
    raw_site_name: getVal(rawRow, colMap.get('raw_site_name')),
    material_name: materialNameRaw ?? '',
    spec:          getVal(rawRow, colMap.get('spec')),
    quantity:      parseNumber(getVal(rawRow, colMap.get('quantity'))),
    unit:          getVal(rawRow, colMap.get('unit')),
    unit_price:    parseNumber(getVal(rawRow, colMap.get('unit_price'))),
    amount:        parseNumber(getVal(rawRow, colMap.get('amount'))),
    supplier:      getVal(rawRow, colMap.get('supplier')),
  };

  return {
    row: normalized,
    errors,
    hasError: errors.length > 0,
  };
}
