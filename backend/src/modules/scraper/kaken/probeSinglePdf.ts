/**
 * 個別PDF取得: 1行選択 → BTNDOWNLODFILES → download イベントキャプチャ
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

  // 全ネットワークリクエストを記録
  page.on('request', req => {
    if (/pdf|Service02|download|PDF/i.test(req.url())) {
      console.log(`  REQ [${req.method()}] ${req.url()}`);
    }
  });
  page.on('response', res => {
    if (/pdf|Service02|download|PDF/i.test(res.url())) {
      console.log(`  RES [${res.status()}] ${res.url()}`);
    }
  });

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((url) => !url.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in:', page.url());

  // 納品書ページ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Row 1（レジデンス２８）の個別チェックボックスを選択
  // グリッドの行チェックボックス: #vSELECTED_0002 (2行目 = row index 1)
  // checkboxSelector removed
  const checkboxes = await page.locator('[id^="vSELECTED_"]').all();
  console.log(`\nFound ${checkboxes.length} row checkboxes`);

  // 最初の行を選択
  if (checkboxes.length > 0) {
    const cb = checkboxes[1]; // index 1 = Row 1 (レジデンス２８)
    const cbId = await cb.getAttribute('id');
    console.log(`Selecting checkbox: ${cbId}`);
    await cb.click();
    await page.waitForTimeout(1000);
  }

  // ダウンロードボタンクリック → downloadイベントをキャプチャ
  console.log('\nClicking BTNDOWNLODFILES and waiting for download...');
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => {
        const el = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
        if (el) {
          console.log('BTNDOWNLODFILES found, clicking...');
          el.click();
        } else {
          console.log('BTNDOWNLODFILES NOT found');
        }
      }),
    ]);

    const filename = download.suggestedFilename();
    console.log(`\n✅ Download event captured!`);
    console.log(`  Filename: ${filename}`);
    console.log(`  URL: ${download.url()}`);

    // バッファに読み込む
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);
    console.log(`  Size: ${buffer.length} bytes`);
    console.log(`  First bytes (hex): ${buffer.slice(0, 8).toString('hex')}`);

    // 保存
    fs.writeFileSync(`storage/screenshots/test_download_${filename}`, buffer);
    console.log(`  Saved to storage/screenshots/test_download_${filename}`);

  } catch (e) {
    console.log(`\nNo download event: ${(e as Error).message}`);

    // ダウンロードボタンの現在の状態を確認
    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
      return {
        exists: !!btn,
        display: btn ? getComputedStyle(btn).display : 'N/A',
        disabled: btn?.getAttribute('disabled'),
        onclick: btn?.getAttribute('onclick'),
        outerHTML: btn?.outerHTML.slice(0, 200),
      };
    });
    console.log('BTNDOWNLODFILES state:', JSON.stringify(btnInfo, null, 2));
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
