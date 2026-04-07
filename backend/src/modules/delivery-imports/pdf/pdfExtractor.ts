/**
 * PDF テキスト抽出
 *
 * 責務:
 *   - PDFファイルからテキストを抽出する
 *   - スキャン画像PDFは抽出不可（parse_status='failed' で返す）
 *   - OCR は将来この層に差し込む（現状は pdf-parse のみ）
 *
 * 設計方針:
 *   - ファイルパス または Buffer から抽出できる
 *   - 上位層（service）はこのファイルの実装詳細を知らなくてよい
 */

import fs from 'fs';
// pdf-parse v2 は PDFParse クラスを export する
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  success: boolean;
  error?: string;
}

/**
 * ファイルパスから PDF テキストを抽出する
 */
export async function extractPdfText(filePath: string): Promise<PdfExtractResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    return await extractPdfTextFromBuffer(buffer);
  } catch (err) {
    return {
      text: '',
      pageCount: 0,
      success: false,
      error: `ファイル読み込みエラー: ${(err as Error).message}`,
    };
  }
}

/**
 * Buffer から PDF テキストを抽出する
 */
export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    // pdf-parse v2: PDFParse クラスに data として Uint8Array を渡す
    const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
    const data = await parser.getText();
    const text = (data.text as string) ?? '';

    // テキストがほぼ空 = スキャン画像PDFの可能性
    if (text.trim().length < 20) {
      return {
        text,
        pageCount: data.pages?.length ?? 0,
        success: false,
        error: 'テキストが抽出できませんでした（スキャン画像PDFの可能性があります）',
      };
    }

    return {
      text,
      pageCount: data.pages?.length ?? 0,
      success: true,
    };
  } catch (err) {
    return {
      text: '',
      pageCount: 0,
      success: false,
      error: `PDF解析エラー: ${(err as Error).message}`,
    };
  }
}
