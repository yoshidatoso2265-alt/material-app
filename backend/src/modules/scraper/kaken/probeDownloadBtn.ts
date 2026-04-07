/**
 * BTNDOWNLODFILES で全件ダウンロードし、形式を確認する
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

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in');

  // 納品書ページ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  // 全行選択（JS経由）
  const selectResult = await page.evaluate(() => {
    const cb = document.querySelector('input[name="selectAllCheckbox"]') as HTMLInputElement | null;
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      return 'selectAllCheckbox changed';
    }
    const hidden = document.querySelector('#vSELECTALL') as HTMLElement | null;
    if (hidden) { hidden.click(); return 'vSELECTALL clicked'; }
    return 'nothing found';
  });
  console.log('Select all:', selectResult);
  await page.waitForTimeout(2000);

  // BTNDOWNLODFILES をJS経由でクリック
  console.log('Clicking download button...');
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => {
        const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
        console.log('btn:', btn?.id, btn ? getComputedStyle(btn).display : 'not found');
        if (btn) btn.click();
      }),
    ]);

    const filename = download.suggestedFilename();
    const dlUrl    = download.url();
    console.log(`\n✅ Download captured!`);
    console.log(`  Filename: ${filename}`);
    console.log(`  Download URL: ${dlUrl}`);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);
    console.log(`  Size: ${buf.length} bytes`);
    console.log(`  Magic (hex): ${buf.slice(0, 8).toString('hex')}`);

    const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
    console.log(`  Type: ${isPdf ? 'PDF' : isZip ? 'ZIP' : 'UNKNOWN'}`);

    fs.writeFileSync(`storage/screenshots/${filename}`, buf);
    console.log(`  Saved: storage/screenshots/${filename}`);

  } catch (e) {
    console.log(`No download event: ${(e as Error).message}`);

    // BTNDOWNLODFILES の状態確認
    const info = await page.evaluate(() => {
      const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
      return {
        exists: !!btn,
        display: btn ? getComputedStyle(btn).display : 'N/A',
        visibility: btn ? getComputedStyle(btn).visibility : 'N/A',
        outerHTML: btn?.outerHTML.slice(0, 300),
      };
    });
    console.log('Button state:', JSON.stringify(info, null, 2));
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
