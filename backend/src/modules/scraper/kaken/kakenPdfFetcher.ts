/**
 * kakenPdfFetcher - 納品書PDFを個別ダウンロード
 *
 * Playwright の認証済みセッション（BrowserContext）を利用して
 * 各伝票に紐づく PDF を直接取得する。
 *
 * 【PDF パスについて】
 * グリッドデータ row[15] の pdf_path は GeneXus サーバー側のパス。
 * 形式例:
 *   - 相対パス: "KakenMyPaperWeb/servlet/com.kakenmypaperweb.pdf?..."
 *   - ルートパス: "/KakenMyPaperWeb/..."
 *   - フルURL: "https://invoice.kaken-material.co.jp/..."
 *
 * セッションクッキーを引き継いだ APIRequest.get() で認証済みダウンロードを行う。
 */

import { Page } from 'playwright';
import { logger } from '../../../utils/logger';

const KAKEN_BASE = 'https://invoice.kaken-material.co.jp';
const DELIVERY_URL =
  'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';

/**
 * pdf_path から PDF バッファを取得する
 *
 * @param page  ログイン済みの Playwright Page
 * @param pdfPath  グリッドデータの row[15] 値
 * @param pdfFilename  ログ用ファイル名（row[13]）
 * @returns PDF バイト列。取得失敗時は null
 */
export async function downloadPdfByPath(
  page: Page,
  pdfPath: string,
  pdfFilename = 'unknown.pdf'
): Promise<Buffer | null> {
  if (!pdfPath || pdfPath.trim() === '') {
    logger.warn(`Kaken PDF: pdfPath が空のためスキップ: ${pdfFilename}`);
    return null;
  }

  // フル URL を構築
  // グリッドの pdfPath は GeneXus のサーバーサイドファイルパス
  // 例: "Service02/202603/NH_912625-20260314-7812939-_12927301.pdf"
  // → gxdownload エンドポイント経由でダウンロード
  let fullUrl: string;
  if (pdfPath.startsWith('http')) {
    fullUrl = pdfPath;
  } else if (pdfPath.startsWith('/')) {
    // 絶対パス → gxdownload 経由
    fullUrl = `${KAKEN_BASE}/KakenMyPaperWeb/gxdownload?gxfileid=${encodeURIComponent(pdfPath.replace(/^\//, ''))}`;
  } else if (pdfPath.includes('Service') || pdfPath.endsWith('.pdf')) {
    // GeneXus サーバーファイルパス形式 → gxdownload 経由
    fullUrl = `${KAKEN_BASE}/KakenMyPaperWeb/gxdownload?gxfileid=${encodeURIComponent(pdfPath)}`;
  } else {
    // フォールバック: 従来の直接パス
    fullUrl = `${KAKEN_BASE}/KakenMyPaperWeb/${pdfPath}`;
  }

  logger.info(`Kaken PDF: ダウンロード開始: ${pdfFilename} → ${fullUrl}`);

  try {
    // Playwright の APIRequestContext は現在のセッションクッキーを引き継ぐ
    const response = await page.context().request.get(fullUrl, {
      headers: {
        Referer: DELIVERY_URL,
        Accept: 'application/pdf,application/octet-stream,*/*',
      },
      timeout: 45_000,
    });

    if (!response.ok()) {
      logger.warn(
        `Kaken PDF: HTTP ${response.status()} ${response.statusText()}: ${fullUrl}`
      );
      return null;
    }

    const bodyBytes = await response.body();

    // PDF マジックバイト確認 ("%PDF" = 0x25 0x50 0x44 0x46)
    if (
      bodyBytes.length < 4 ||
      bodyBytes[0] !== 0x25 ||
      bodyBytes[1] !== 0x50 ||
      bodyBytes[2] !== 0x44 ||
      bodyBytes[3] !== 0x46
    ) {
      logger.warn(
        `Kaken PDF: PDF ではないレスポンス (${bodyBytes.length} bytes, ` +
        `先頭: ${Buffer.from(bodyBytes.slice(0, 8)).toString('hex')}): ${fullUrl}`
      );
      return null;
    }

    const buffer = Buffer.from(bodyBytes);
    logger.info(
      `Kaken PDF: ダウンロード完了: ${pdfFilename} (${buffer.length} bytes)`
    );
    return buffer;
  } catch (e) {
    logger.warn(
      `Kaken PDF: ダウンロードエラー: ${pdfFilename} [${fullUrl}] - ${(e as Error).message}`
    );
    return null;
  }
}
