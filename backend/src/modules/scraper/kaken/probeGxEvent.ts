/**
 * GeneXus ダウンロードイベントの正確な動作を解析
 * - XHR/fetch をインターセプトして POST ボディを確認
 * - window.location 変化を監視
 * - 新規タブ/window.open を監視
 * - GeneXus のサーバーイベント API を直接呼ぶ
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

  // 全リクエストを監視
  context.on('request', (req) => {
    if (req.method() === 'POST') {
      const url = req.url();
      if (!url.includes('gamexamplelogin') && !url.includes('gx-no-cache=17737380')) {
        const pdata = req.postData();
        console.log(`\n[REQ POST] ${url.slice(-80)}`);
        if (pdata) console.log(`  BODY: ${pdata.slice(0, 300)}`);
      }
    }
  });

  // 全レスポンスを監視
  context.on('response', async (res) => {
    if (res.status() >= 200 && res.status() < 400) {
      const url = res.url();
      const ct = res.headers()['content-type'] ?? '';
      const cd2 = res.headers()['content-disposition'] ?? '';
      if (/pdf|zip|octet|attachment/i.test(ct + cd2)) {
        console.log(`\n[BINARY RES] ${res.status()} ${url}`);
        console.log(`  CT: ${ct}  CD: ${cd2}`);
        try {
          const buf = await res.body();
          console.log(`  size: ${buf.length}  magic: ${buf.slice(0,8).toString('hex')}`);
          fs.writeFileSync('storage/screenshots/probe_gx_dl.bin', buf);
        } catch { /* ignore */ }
      }
    }
  });

  const page = await context.newPage();

  // XHR/fetch インターセプト + GeneXus API 確認用の init script
  await page.addInitScript(() => {
    // XHR をラップ
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method: string, url: string, ...rest: any[]) {
      (this as any).__xhrUrl = url;
      (this as any).__xhrMethod = method;
      return origOpen.apply(this, [method, url, ...rest] as any);
    };
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body: any) {
      const url = (this as any).__xhrUrl ?? '';
      const m   = (this as any).__xhrMethod ?? '';
      if (m === 'POST' && !url.includes('gx-no-cache=17737380')) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        console.log(`[XHR] POST ${url} | BODY: ${bodyStr?.slice(0, 300)}`);
      }
      return origSend.apply(this, [body] as any);
    };

    // window.open を監視
    const origOpen2 = window.open;
    window.open = function(url?: string | URL, ...rest: any[]) {
      console.log(`[window.open] ${url}`);
      return origOpen2.apply(window, [url, ...rest] as any);
    };

    // location.assign/replace を監視
    const origAssign = window.location.assign.bind(window.location);
    try {
      Object.defineProperty(window.location, 'assign', {
        value: (url: string) => { console.log(`[location.assign] ${url}`); origAssign(url); },
        writable: true,
      });
    } catch {}
  });

  // コンソールメッセージを出力
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('Bootstrap') && !text.includes('favicon') && !text.includes('gx-no-cache=17737380')) {
      console.log(`[CONSOLE] ${msg.type()}: ${text.slice(0, 200)}`);
    }
  });

  // 新しいページが開いた場合を監視
  context.on('page', (newPage) => {
    console.log(`[NEW PAGE] ${newPage.url()}`);
    newPage.on('request', (req) => {
      if (/pdf|download|Service/i.test(req.url())) {
        console.log(`[NEW PAGE REQ] ${req.method()} ${req.url()}`);
      }
    });
  });

  // ログイン
  console.log('=== Logging in ===');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in:', page.url().slice(-50));

  // 納品書ページ
  console.log('\n=== Navigate to delivery ===');
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // GeneXus グローバル API を確認
  const gxApi = await page.evaluate(() => {
    const w = window as any;
    const api: Record<string, string> = {};
    if (w.gx) {
      api['gx.keys'] = Object.keys(w.gx).join(', ');
      if (w.gx.fn) api['gx.fn.keys'] = Object.keys(w.gx.fn).join(', ');
      if (w.gx.evt) api['gx.evt.keys'] = Object.keys(w.gx.evt).join(', ');
    }
    return api;
  });
  console.log('\n=== GeneXus API ===\n', JSON.stringify(gxApi, null, 2));

  // 1行目だけ選択（GeneXus 流に直接 click）
  console.log('\n=== Select row 1 ===');
  await page.click('#vSELECTED_0001', { force: true, timeout: 5000 }).catch(e => console.log('sel err:', e.message));
  await page.waitForTimeout(2000);

  // BTNDOWNLODFILES の onClick ハンドラを確認
  const btnHandlers = await page.evaluate(() => {
    const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
    if (!btn) return 'NOT FOUND';

    // jQuery のイベントハンドラを取得
    const w = window as any;
    const $ = w.jQuery || w.$;
    let handlers = 'no jquery';
    if ($) {
      const evts = $._data ? $._data(btn, 'events') : null;
      if (evts) handlers = JSON.stringify(Object.keys(evts));
    }

    // GeneXus の内部ハンドラ
    const gxEvt = btn.getAttribute('data-gx-evt');
    const onclick = btn.getAttribute('onclick');
    const jsaction = btn.getAttribute('jsaction');

    return {
      'data-gx-evt': gxEvt,
      onclick,
      jsaction,
      jqHandlers: handlers,
      style: btn.getAttribute('style'),
      display: (window.getComputedStyle(btn) as any).display,
    };
  });
  console.log('\n=== BTNDOWNLODFILES handlers ===\n', JSON.stringify(btnHandlers, null, 2));

  // GeneXus の serverEvent API で直接イベント5を発火
  console.log('\n=== Try gx.fn.serverEvent(5) ===');
  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.evaluate(() => {
      const w = window as any;
      try {
        if (w.gx && w.gx.fn) {
          // いくつかの GeneXus API パターンを試す
          const fns = ['serverEvent', 'setServerEventNumber', 'doServerEvent', 'doSubmit'];
          for (const fn of fns) {
            if (typeof w.gx.fn[fn] === 'function') {
              console.log(`Calling gx.fn.${fn}(5)`);
              w.gx.fn[fn](5);
              break;
            }
          }
        }
        return 'done';
      } catch (e: any) { return 'err: ' + e.message; }
    }),
  ]);
  if (dl1) {
    console.log('*** Download after gx.fn.serverEvent! filename:', dl1.suggestedFilename());
  }
  await page.waitForTimeout(3000);

  // jQuery クリック
  console.log('\n=== Try jQuery trigger click ===');
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.evaluate(() => {
      const w = window as any;
      const $ = w.jQuery || w.$;
      const btn = document.querySelector('#BTNDOWNLODFILES');
      if ($ && btn) {
        console.log('Triggering jQuery click');
        $(btn).trigger('click');
        return 'jquery click';
      } else if (btn) {
        console.log('dispatchEvent click');
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return 'dispatch click';
      }
      return 'no btn';
    }),
  ]);
  if (dl2) {
    console.log('*** Download after jQuery click! filename:', dl2.suggestedFilename());
  }
  await page.waitForTimeout(3000);

  // GeneXus フォームを直接 submit
  console.log('\n=== Try direct form submit with event 5 ===');
  const [dl3] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.evaluate(() => {
      const w = window as any;
      try {
        // GeneXus の状態を取得してフォームを送信
        if (w.gx) {
          // gxstate (hidden) に event 5 を set して submit
          const form = document.querySelector('form') as HTMLFormElement | null;
          if (form) {
            // GXM_btn5 hidden field を追加
            const h = document.createElement('input');
            h.type = 'hidden';
            h.name = 'GXM_btn5';
            h.value = '1';
            form.appendChild(h);
            console.log('Submitting form with GXM_btn5=1');
            form.submit();
            return 'form submitted';
          }
        }
        return 'no form/gx';
      } catch (e: any) { return 'err: ' + e.message; }
    }),
  ]);
  if (dl3) {
    console.log('*** Download after form submit! filename:', dl3.suggestedFilename());
  }
  await page.waitForTimeout(3000);

  // 最後の試み: 伝票IDを使った直接URLアクセス
  console.log('\n=== Try direct URL patterns with delinoteID ===');
  const DELINOTE_ID = '7810040';
  const BASE = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb';
  const urlPatterns = [
    `${BASE}.rp_delinotetdlpdfw?RPD_DELINOTEID=${DELINOTE_ID}`,
    `${BASE}.rp_delinotetdl1www?RPD_DELINOTEID=${DELINOTE_ID}`,
    `${BASE}.rp_delinotetdloneww?RPD_DELINOTEID=${DELINOTE_ID}`,
    `${BASE}.rp_pdfdownload?id=${DELINOTE_ID}`,
    `https://invoice.kaken-material.co.jp/KakenMyPaperWeb/gxdownload?gxfileid=Service02/202603/NH_912625-20260313-7810040-_12927301.pdf`,
  ];

  for (const url of urlPatterns) {
    try {
      const res = await context.request.get(url, {
        headers: { Referer: DELIVERY_URL },
        timeout: 10_000,
      });
      const ct = res.headers()['content-type'] ?? '';
      const cd = res.headers()['content-disposition'] ?? '';
      console.log(`  [${res.status()}] ${url.slice(-60)}`);
      console.log(`    CT: ${ct}  CD: ${cd}`);
      if (res.ok() && /pdf|zip|octet/i.test(ct)) {
        const buf = await res.body();
        console.log(`    *** FOUND! size: ${buf.length}  magic: ${buf.slice(0,4).toString('hex')}`);
        fs.writeFileSync(`storage/screenshots/found_pdf_${DELINOTE_ID}.bin`, buf);
      } else if (res.ok()) {
        const text = await res.text();
        console.log(`    body: ${text.slice(0, 100)}`);
      }
    } catch (e: any) {
      console.log(`  [ERR] ${url.slice(-60)}: ${e.message}`);
    }
  }

  console.log('\n=== Done ===');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
