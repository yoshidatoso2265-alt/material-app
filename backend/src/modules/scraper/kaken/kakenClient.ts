/**
 * kakenClient - ブラウザライフサイクル管理
 *
 * - chromium.launch() / close() のラッパー
 * - 各ステップでのスクリーンショット + HTML 保存（saveArtifact）
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { logger } from '../../../utils/logger';

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? './storage';
export const SCREENSHOTS_DIR = path.join(STORAGE_BASE, 'screenshots');

export interface KakenSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/** ブラウザを起動してセッションを返す */
export async function launchBrowser(headless = false): Promise<KakenSession> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  logger.info(`Playwright: chromium launch (headless=${headless})`);

  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 150,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * スクリーンショット + HTML を保存して、スクリーンショットのパスを返す
 * （成功/失敗問わずデバッグ用に呼び出す）
 */
export async function saveArtifact(page: Page, label: string): Promise<string> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = Date.now();
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}-${ts}.png`);
  const htmlPath = path.join(SCREENSHOTS_DIR, `${label}-${ts}.html`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf-8');
    logger.info(`Artifact saved: ${screenshotPath}`);
  } catch (e) {
    logger.warn(`saveArtifact failed for label="${label}": ${(e as Error).message}`);
  }

  return screenshotPath;
}

/** ブラウザを安全にクローズ */
export async function closeBrowser(session: KakenSession): Promise<void> {
  try {
    await session.browser.close();
    logger.info('Playwright: browser closed');
  } catch (e) {
    logger.warn(`browser.close() error: ${(e as Error).message}`);
  }
}
