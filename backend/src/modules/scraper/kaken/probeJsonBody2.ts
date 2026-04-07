/**
 * BTNDOWNLODFILES POST レスポンス JSON 本文の特定
 * シンプル版: POST レスポンスの JSON だけ出力
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL    = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const DELIVERY_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';
const loginId      = process.env.KAKEN_LOGIN_ID ?? '';
const password     = process.env.KAKEN_LOGIN_PASSWORD ?? '';

let captureEnabled = false;
const captured: Array<{url: string; method: string; status: number; ct: string; cd: string; body: string}> = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context  = await browser.newContext({ acceptDownloads: true });
  const page     = await context.newPage();

  page.on('response', async (res) => {
    if (!captureEnabled) return;
    const url = res.url();
    const ct  = res.headers()['content-type'] ?? '';
    const cd  = res.headers()['content-disposition'] ?? '';
    const method = res.request().method();

    // POST レスポンスのみ
    if (method !== 'POST') return;

    try {
      const body = await res.text();
      const entry = { url, method, status: res.status(), ct, cd, body: body.slice(0, 2000) };
      captured.push(entry);
      console.log(`[POST] ${res.status()} ${url.slice(-60)}`);
      console.log(`  CT: ${ct}  CD: ${cd}`);
      console.log(`  BODY(${body.length}): ${body.slice(0, 500)}`);
    } catch { /* ignore */ }
  });

  // ログイン
  console.log('Logging in...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in:', page.url().slice(-40));

  // 納品書ページ
  console.log('Navigating to delivery page...');
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('On delivery page.');

  // キャプチャ開始（ログイン・ページ遷移の大量HTMLを除外）
  captureEnabled = true;

  // GeneXus grid の selectAll を探す
  const cbInfo = await page.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    return allInputs.map(el => ({
      id: el.id,
      name: (el as HTMLInputElement).name,
      class: el.className,
    }));
  });
  console.log('Checkboxes:', JSON.stringify(cbInfo, null, 2));

  // 選択処理: GeneXus の全行チェック
  await page.evaluate(() => {
    // selectAllCheckbox / GridContainerDataV 形式を試す
    const allCbs = document.querySelectorAll('input[type="checkbox"]');
    allCbs.forEach((cb) => {
      const el = cb as HTMLInputElement;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  });
  await page.waitForTimeout(2000);

  // ダウンロードボタン状態確認
  const btnState = await page.evaluate(() => {
    const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
    if (!btn) return 'NOT FOUND';
    return {
      style: btn.getAttribute('style') ?? '',
      class: btn.className,
      display: window.getComputedStyle(btn).display,
      'data-gx-evt': btn.getAttribute('data-gx-evt') ?? '',
    };
  });
  console.log('\nBTNDOWNLODFILES state:', JSON.stringify(btnState));

  // click force
  console.log('\nClicking BTNDOWNLODFILES (force)...');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('#BTNDOWNLODFILES', { force: true, timeout: 5000 }).catch(e => console.log('click err:', e.message)),
  ]);

  if (dl) {
    console.log('*** Download event! filename:', dl.suggestedFilename());
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => res());
      stream.on('error', rej);
    });
    const buf = Buffer.concat(chunks);
    console.log(`  size: ${buf.length}  magic: ${buf.slice(0,8).toString('hex')}`);
    fs.writeFileSync('storage/screenshots/probe_dl.bin', buf);
    console.log('  Saved to storage/screenshots/probe_dl.bin');
  } else {
    console.log('No download event.');
  }

  await page.waitForTimeout(3000);

  // 結果サマリー
  console.log('\n=== POST responses captured ===');
  captured.forEach((c, i) => {
    console.log(`[${i+1}] ${c.status} ${c.url.slice(-80)}`);
    console.log(`  CT: ${c.ct}`);
    console.log(`  BODY: ${c.body.slice(0, 300)}`);
    console.log('---');
  });

  // JSON 全量をファイルに保存
  fs.writeFileSync('storage/screenshots/probe_json_body.json', JSON.stringify(captured, null, 2));
  console.log('\nFull results saved to storage/screenshots/probe_json_body.json');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
