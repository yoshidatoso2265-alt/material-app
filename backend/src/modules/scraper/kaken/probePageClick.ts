/**
 * page.click() でダウンロードボタンをクリック（Playwright実マウスイベント）
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

  // 全ネットワークリクエストを追跡
  page.on('request', (req) => {
    if (req.method() === 'POST' || /pdf|download|Service02/i.test(req.url())) {
      console.log(`  REQ [${req.method()}]: ${req.url()}`);
      const pd = req.postData();
      if (pd && pd.length < 500) console.log(`    BODY: ${pd.slice(0, 200)}`);
    }
  });
  page.on('response', (res) => {
    if (/pdf|download|Service02/i.test(res.url()) || res.status() >= 400) {
      console.log(`  RES [${res.status()}]: ${res.url()}`);
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
  console.log('Logged in');

  // 納品書ページ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  // 全行選択（JS経由）
  await page.evaluate(() => {
    const cb = document.querySelector('input[name="selectAllCheckbox"]') as HTMLInputElement | null;
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(2000);

  const selectedVal = await page.inputValue('#vSELECTALL').catch(() => 'unknown');
  console.log('vSELECTALL value after select:', selectedVal);

  // page.click() でボタンをクリック（Playwright実マウスイベント）
  console.log('\nClicking #BTNDOWNLODFILES via page.click()...');
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.click('#BTNDOWNLODFILES', { force: true, timeout: 5000 }),
    ]);
    const filename = download.suggestedFilename();
    const dlUrl    = download.url();
    console.log(`✅ Download! filename=${filename} url=${dlUrl}`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    const buf = Buffer.concat(chunks);
    console.log(`  Size: ${buf.length}, magic: ${buf.slice(0,4).toString('hex')}`);
    const isPdf = buf[0]===0x25 && buf[1]===0x50;
    const isZip = buf[0]===0x50 && buf[1]===0x4B;
    console.log(`  Type: ${isPdf?'PDF':isZip?'ZIP':'UNKNOWN'}`);
    fs.writeFileSync(`storage/screenshots/${filename}`, buf);
    console.log(`  Saved to storage/screenshots/${filename}`);
  } catch (e) {
    console.log(`page.click download failed: ${(e as Error).message}`);

    // GeneXus スタイルのクリックを試みる
    console.log('\nTrying gx.evt.onclick() call...');
    try {
      const [download2] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        page.evaluate(() => {
          const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement;
          const gx = (window as { gx?: { evt?: { onclick?: (el: HTMLElement, ev: Event) => void } } }).gx;
          if (gx?.evt?.onclick) {
            gx.evt.onclick(btn, new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'gx.evt.onclick called';
          }
          // フォールバック: 実際のクリックイベントをdispatchEvent
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return 'dispatchEvent click';
        }),
      ]);
      const filename2 = download2.suggestedFilename();
      console.log(`✅ Download via gx! filename=${filename2}`);
    } catch (e2) {
      console.log(`gx.evt.onclick also failed: ${(e2 as Error).message}`);
    }
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
