/**
 * CSVパーサー
 *
 * 対応エンコーディング:
 *   - UTF-8（デフォルト）
 *   - Shift-JIS / CP932（化研マテリアルCSVは Shift-JIS が多い）
 *
 * iconv-lite を使用してバッファをデコードしてから csv-parse に渡す。
 * エンコーディングは呼び出し元（importsService）が判断して指定する。
 */

import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';

export type CsvEncoding = 'utf8' | 'shift_jis' | 'cp932';

export interface RawCsvRow {
  [key: string]: string;
}

export interface CsvParseOptions {
  encoding?: CsvEncoding;
  delimiter?: string;
  fromLine?: number; // ヘッダー行より前に余分な行がある場合に指定
}

/**
 * Buffer から CSV を解析して生の行データを返す
 *
 * @param buffer   アップロードされたファイルバッファ
 * @param options  パースオプション（エンコーディング等）
 * @returns        ヘッダーをキーとした行オブジェクトの配列
 */
export function parseCsvBuffer(
  buffer: Buffer,
  options: CsvParseOptions = {}
): RawCsvRow[] {
  const encoding = options.encoding ?? 'utf8';

  // iconv-lite でデコード
  // Shift-JIS / cp932 の場合は明示的に変換
  const icovEncoding = encoding === 'shift_jis' ? 'Shift_JIS' : encoding;
  const content = iconv.decode(buffer, icovEncoding);

  const rows = parse(content, {
    columns: true,           // 1行目をヘッダーとして使用
    skip_empty_lines: true,
    trim: true,
    delimiter: options.delimiter ?? ',',
    from_line: options.fromLine ?? 1,
    relax_column_count: true, // 列数が合わない行もエラーにしない
    bom: true,               // BOM があれば除去
  }) as RawCsvRow[];

  return rows;
}

/** CSVのヘッダー行を取得する（カラムマッピング確認用） */
export function extractHeaders(buffer: Buffer, options: CsvParseOptions = {}): string[] {
  const encoding = options.encoding ?? 'utf8';
  const icovEncoding = encoding === 'shift_jis' ? 'Shift_JIS' : encoding;
  const content = iconv.decode(buffer, icovEncoding);

  const rows = parse(content, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    delimiter: options.delimiter ?? ',',
    bom: true,
    to_line: 1, // 1行目のみ取得
  }) as string[][];

  return rows[0] ?? [];
}
