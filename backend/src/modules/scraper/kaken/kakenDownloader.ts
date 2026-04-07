/**
 * kakenDownloader - ZIPダウンロード実行
 *
 * 【仕組み】
 * GeneXus は BTNDOWNLODFILES クリック時に AJAX POST を送信し、
 * レスポンスの gxCommands[{redirect:{url:...}}] でサーバー上の ZIP パスを返す。
 * Playwright の download イベントではなく AJAX レスポンスをインターセプトして
 * page.context().request.get() で ZIP をダウンロードする。
 */

import { Page, BrowserContext } from 'playwright';
import { readGridData } from './kakenNavigator';
import { logger } from '../../../utils/logger';

const SELECTORS = {
  downloadBtn: '#BTNDOWNLODFILES',
} as const;

/**
 * グリッドデータからCSVを生成して返す（ScraperPage用レガシー関数）
 *
 * @deprecated 新しいフローは downloadZipBuffer → extractPdfsFromZip を使う
 */
export async function downloadCsv(
  page: Page,
  _context: BrowserContext
): Promise<{ buffer: Buffer; filename: string }> {
  logger.info('Kaken: グリッドCSV生成...');
  const rows = await readGridData(page);
  if (rows.length === 0) {
    throw new Error('グリッドデータが空です');
  }
  const header = '納品日,伝票番号,現場名,品名,金額\n';
  const body = rows.map((r) => {
    const materialName = r.description || `${r.siteName} (${r.slipNumber})`;
    return [
      r.deliveryDate,
      r.slipNumber,
      `"${r.siteName.replace(/"/g, '""')}"`,
      `"${materialName.replace(/"/g, '""')}"`,
      r.amount ?? '',
    ].join(',');
  }).join('\n');
  const buffer = Buffer.from(header + body, 'utf-8');
  const filename = `kaken_grid_${Date.now()}.csv`;
  logger.info(`Kaken: グリッドCSV生成完了: ${rows.length} 行`);
  return { buffer, filename };
}

/**
 * 全行選択済みの状態でダウンロードボタンをクリックし、ZIPバッファを返す
 *
 * 【仕組み】
 * probeSinglePdf で確認済みのアプローチ:
 * - page.waitForEvent('download') と evaluate内 el.click() を Promise.all で同時実行
 * - Playwright の download イベントでファイルを直接取得する
 * - AJAX gxCommands.redirect 方式は環境によって動作しないため廃止
 *
 * ZIP・PDF どちらも返す可能性がある（複数行選択→ZIP、1行選択→PDF単体）
 */
export async function downloadZipBuffer(page: Page): Promise<{ buffer: Buffer; filename: string } | null> {
  logger.info('Kaken: ダウンロード開始（download イベント方式）...');

  const dlBtnExists = await page.locator(SELECTORS.downloadBtn).count() > 0;
  if (!dlBtnExists) {
    logger.warn('Kaken: BTNDOWNLODFILES が DOM に存在しません');
    return null;
  }

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300_000 }),
      page.evaluate(() => {
        const el = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
        if (el) {
          el.click();
        } else {
          console.warn('BTNDOWNLODFILES not found in evaluate');
        }
      }),
    ]);

    const filename = download.suggestedFilename() || `kaken_${Date.now()}.zip`;
    logger.info(`Kaken: ダウンロードイベント捕捉: ${filename}`);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
    }
    const buffer = Buffer.concat(chunks);
    logger.info(`Kaken: ダウンロード完了: ${filename} (${buffer.length} bytes, magic: ${buffer.slice(0, 4).toString('hex')})`);

    // ZIP (PK) または PDF (%PDF) であれば有効とみなす
    const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4B;
    const isPdf = buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;

    if (isZip || isPdf) {
      return { buffer, filename };
    }

    logger.warn(`Kaken: 予期しないファイル形式 (magic: ${buffer.slice(0, 4).toString('hex')})`);
    return null;
  } catch (e) {
    logger.warn(`Kaken: ダウンロードエラー: ${(e as Error).message}`);
    return null;
  }
}

/**
 * ZIPバッファからPDFエントリを全て抽出して返す
 * adm-zip が利用不可の場合は空配列を返す
 */
export function extractPdfsFromZip(zipBuffer: Buffer): Array<{ name: string; buffer: Buffer }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries() as Array<{ entryName: string; getData(): Buffer }>;
    const pdfs: Array<{ name: string; buffer: Buffer }> = [];
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().endsWith('.pdf')) {
        const data = entry.getData();
        // PDF マジックバイト確認
        if (data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
          pdfs.push({ name: entry.entryName, buffer: data });
          logger.info(`Kaken: ZIP内PDF: ${entry.entryName} (${data.length} bytes)`);
        }
      }
    }
    return pdfs;
  } catch {
    logger.warn('Kaken: adm-zip が利用できません。PDF抽出をスキップします。');
    return [];
  }
}

