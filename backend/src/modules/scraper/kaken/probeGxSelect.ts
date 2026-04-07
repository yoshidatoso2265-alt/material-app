/**
 * GeneXus: 正しい行選択 → ダウンロードボタン クリック
 * 1. evaluate で jQuery trigger click を使う（viewport 外対応）
 * 2. ダウンロードボタンが visible になるまで待つ
 * 3. jQuery trigger click でダウンロードイベント発火
 * 4. POST レスポンスを全量キャプチャ
 */
import { chromium, Response } from 'playwright';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL    = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const DELIVERY_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';
const loginId      = process.env.KAKEN_LOGIN_ID ?? '';
const password     = process.env.KAKEN_LOGIN_PASSWORD ?? '';

// POST レスポンスをキャプチャ
const postResponses: Array<{url: string; ct: string; body: string; rawBuf?: Buffer}> = [];
let capturePost = false;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context  = await browser.newContext({ acceptDownloads: true });

  context.on('response', async (res: Response) => {
    if (!capturePost) return;
    if (res.request().method() !== 'POST') return;

    const url = res.url();
    const ct  = res.headers()['content-type'] ?? '';
    const cd  = res.headers()['content-disposition'] ?? '';

    try {
      if (/pdf|zip|octet/i.test(ct) || /attachment/i.test(cd)) {
        const buf = await res.body();
        console.log(`\n[BINARY POST RESP] ${res.status()} ${url.slice(-70)}`);
        console.log(`  CT: ${ct}  size: ${buf.length}  magic: ${buf.slice(0,8).toString('hex')}`);
        postResponses.push({ url, ct, body: '', rawBuf: buf });
        fs.writeFileSync('storage/screenshots/probe_dl_resp.bin', buf);
        console.log('  *** Saved to probe_dl_resp.bin ***');
      } else {
        const body = await res.text();
        console.log(`\n[POST RESP] ${res.status()} ${url.slice(-70)}`);
        console.log(`  CT: ${ct}  CD: ${cd}`);
        console.log(`  BODY(${body.length}): ${body.slice(0, 500)}`);
        postResponses.push({ url, ct, body });
      }
    } catch { /* ignore */ }
  });

  const page = await context.newPage();

  // コンソールログ
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[GX]')) console.log(`[CONSOLE] ${t}`);
  });

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in:', page.url().slice(-50));

  // 納品書ページ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vSELECTED_0001', { timeout: 20_000, state: 'attached' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('On delivery page.');

  capturePost = true;

  // 行1を jQuery trigger でクリック（viewport 外でも動く）
  console.log('\n=== Select row 1 via jQuery trigger ===');
  const sel1Result = await page.evaluate(() => {
    const w = window as any;
    const $ = w.jQuery || w.$;
    const cb = document.querySelector('#vSELECTED_0001');
    if (!cb) return 'NOT FOUND';
    if ($) {
      console.log('[GX] jQuery trigger click on vSELECTED_0001');
      $(cb).trigger('click');
      return 'jquery trigger';
    } else {
      console.log('[GX] dispatchEvent on vSELECTED_0001');
      cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 'dispatch';
    }
  });
  console.log('Select result:', sel1Result);
  await page.waitForTimeout(3000);

  // ボタンの display を確認
  const btnDisplay = await page.evaluate(() => {
    const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
    if (!btn) return 'NOT FOUND';
    return {
      computed: window.getComputedStyle(btn).display,
      style: btn.getAttribute('style'),
      class: btn.className,
    };
  });
  console.log('\nBTN display after select:', JSON.stringify(btnDisplay));

  // ダウンロードボタンを jQuery trigger click
  console.log('\n=== Click BTNDOWNLODFILES via jQuery trigger ===');
  const [dlEvent] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
    page.evaluate(() => {
      const w = window as any;
      const $ = w.jQuery || w.$;
      const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
      if (!btn) { console.log('[GX] BTNDOWNLODFILES NOT FOUND'); return 'not found'; }
      console.log('[GX] btn display:', window.getComputedStyle(btn).display);
      if ($) {
        console.log('[GX] jQuery trigger click on BTNDOWNLODFILES');
        $(btn).trigger('click');
        return 'jquery click';
      }
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 'dispatch click';
    }),
  ]);

  if (dlEvent) {
    console.log('\n*** DOWNLOAD EVENT! filename:', dlEvent.suggestedFilename());
    const stream = await dlEvent.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => res());
      stream.on('error', rej);
    });
    const buf = Buffer.concat(chunks);
    console.log(`size: ${buf.length}  magic: ${buf.slice(0,8).toString('hex')}`);
    fs.writeFileSync('storage/screenshots/probe_download.bin', buf);
    console.log('Saved to probe_download.bin');
  } else {
    console.log('No download event.');
  }

  await page.waitForTimeout(5000);

  // POST レスポンスが GeneXus ダウンロードURLを持っているか確認
  console.log('\n=== POST responses captured ===');
  for (const [i, r] of postResponses.entries()) {
    console.log(`\n[${i+1}] ${r.url.slice(-70)}`);
    console.log(`  CT: ${r.ct}`);
    if (r.rawBuf) {
      console.log(`  BINARY: ${r.rawBuf.length} bytes  magic: ${r.rawBuf.slice(0,8).toString('hex')}`);
    } else {
      // JSON を解析してみる
      let parsed: any = null;
      try { parsed = JSON.parse(r.body); } catch { /* not json */ }
      if (parsed) {
        // GeneXus AJAX レスポンスのフィールドを確認
        const keys = Object.keys(parsed);
        console.log(`  JSON keys: ${keys.join(', ')}`);
        // gxCommands や gxEvents, gxRedirect などを探す
        for (const k of ['gxCommands', 'gxEvents', 'gxRedirect', 'redirect', 'url', 'filename', 'token', 'fileToken', 'gxFileId', 'gxDownloadToken']) {
          if (parsed[k] !== undefined) {
            console.log(`  ${k}: ${JSON.stringify(parsed[k]).slice(0, 200)}`);
          }
        }
        // gxValues の中にダウンロードURL的なものがないか
        if (parsed.gxValues) {
          for (const v of parsed.gxValues) {
            for (const [k, val] of Object.entries(v)) {
              if (k !== 'CmpContext' && k !== 'IsMasterPage') {
                const valStr = JSON.stringify(val).slice(0, 100);
                if (/url|pdf|download|token|file/i.test(k) || /http|pdf|\.pdf|Service/i.test(valStr)) {
                  console.log(`  gxValues.${k}: ${valStr}`);
                }
              }
            }
          }
        }
        if (parsed.gxProps) {
          for (const p of parsed.gxProps) {
            for (const [k, val] of Object.entries(p)) {
              if (k !== 'CmpContext' && k !== 'IsMasterPage') {
                console.log(`  gxProps.${k}: ${JSON.stringify(val).slice(0, 100)}`);
              }
            }
          }
        }
      } else {
        console.log(`  BODY: ${r.body.slice(0, 300)}`);
      }
    }
  }

  // フルJSONをファイル保存
  fs.writeFileSync('storage/screenshots/probe_gx_select_resp.json', JSON.stringify(postResponses.map(r => ({
    url: r.url,
    ct: r.ct,
    body: r.rawBuf ? `[BINARY ${r.rawBuf.length} bytes]` : r.body,
  })), null, 2));
  console.log('\nSaved full results to probe_gx_select_resp.json');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
