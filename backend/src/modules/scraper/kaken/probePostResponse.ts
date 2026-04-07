/**
 * ダウンロードPOSTのレスポンス内容を詳細確認
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL    = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const DELIVERY_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';
const loginId      = process.env.KAKEN_LOGIN_ID ?? '';
const password     = process.env.KAKEN_LOGIN_PASSWORD ?? '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context  = await browser.newContext({ acceptDownloads: true });
  const page     = await context.newPage();

  // POSTレスポンスを全て記録
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('rp_delinote') || url.includes('Service02') || /pdf|download/i.test(url)) {
      const ct = res.headers()['content-type'] ?? 'N/A';
      const cd = res.headers()['content-disposition'] ?? 'N/A';
      const cl = res.headers()['content-length'] ?? 'N/A';
      console.log(`\nRES [${res.status()}] ${url}`);
      console.log(`  content-type: ${ct}`);
      console.log(`  content-disposition: ${cd}`);
      console.log(`  content-length: ${cl}`);

      // PDFやZIPならバッファ取得
      if (/pdf|zip|octet/i.test(ct) || /attachment/i.test(cd)) {
        try {
          const buf = await res.body();
          console.log(`  body size: ${buf.length}`);
          console.log(`  magic: ${buf.slice(0,8).toString('hex')}`);
          if (buf.length > 100) {
            fs.writeFileSync('storage/screenshots/probe_download_response.bin', buf);
            console.log('  Saved to probe_download_response.bin');
          }
        } catch (e) {
          console.log(`  body error: ${(e as Error).message}`);
        }
      }
    }
  });

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // 納品書ページ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  // 全選択
  await page.evaluate(() => {
    const cb = document.querySelector('input[name="selectAllCheckbox"]') as HTMLInputElement | null;
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(2000);

  console.log('Clicking download button...');
  // 複数の方法で試す
  await page.click('#BTNDOWNLODFILES', { force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(5000);

  console.log('\nDone.');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
