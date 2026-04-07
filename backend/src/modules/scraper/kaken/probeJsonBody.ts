/**
 * BTNDOWNLODFILES の POST レスポンス JSON 本文を読む
 * + ALL responses を記録して download URL を発見する
 */
import { chromium } from 'playwright';
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

  // すべてのレスポンスを記録（GeneXus ダウンロード URL 探索用）
  page.on('response', async (res) => {
    const url = res.url();
    const ct  = res.headers()['content-type'] ?? '';
    const cd  = res.headers()['content-disposition'] ?? '';
    const method = res.request().method();

    // JSON レスポンスは全部本文を読む
    if (ct.includes('json') || ct.includes('text')) {
      try {
        const body = await res.text();
        console.log(`\n[${method}] ${res.status()} ${url}`);
        console.log(`  CT: ${ct}`);
        if (cd) console.log(`  CD: ${cd}`);
        console.log(`  BODY: ${body.slice(0, 2000)}`);
      } catch (e) { /* ignore */ }
    }

    // PDF/ZIP/binary レスポンス
    if (/pdf|zip|octet/i.test(ct) || /attachment/i.test(cd)) {
      console.log(`\n[BINARY] ${method} ${res.status()} ${url}`);
      console.log(`  CT: ${ct}  CD: ${cd}`);
      try {
        const buf = await res.body();
        console.log(`  size: ${buf.length}  magic: ${buf.slice(0,8).toString('hex')}`);
      } catch { /* ignore */ }
    }

    // URL に pdf/download/Service02 が含まれるもの全部
    if (/pdf|download|Service0[12]|dltoken|getfile/i.test(url)) {
      console.log(`\n[URL-MATCH] ${method} ${res.status()} ${url}`);
      console.log(`  CT: ${ct}  CD: ${cd}`);
    }
  });

  // ログイン
  console.log('--- Login ---');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((u) => !u.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in. URL:', page.url());

  // 納品書ページ
  console.log('--- Navigate to delivery page ---');
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // 1行目だけチェック（全選択より1行で確認）
  console.log('--- Selecting row 1 ---');
  const checked = await page.evaluate(() => {
    // 1行目チェックボックス
    const rows = document.querySelectorAll('input[type="checkbox"][name^="GridContainerDataV"]');
    console.log('checkboxes found:', rows.length);
    if (rows.length > 0) {
      const cb = rows[0] as HTMLInputElement;
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      cb.dispatchEvent(new Event('click', { bubbles: true }));
      return rows.length;
    }
    return 0;
  });
  console.log('Checkboxes:', checked);
  await page.waitForTimeout(2000);

  // ダウンロードボタン存在確認
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement | null;
    if (!btn) return null;
    return {
      tag: btn.tagName,
      type: (btn as HTMLInputElement).type,
      style: btn.getAttribute('style') ?? '',
      class: btn.className,
      visible: btn.offsetParent !== null,
      onclick: btn.getAttribute('onclick') ?? '',
      'data-gx-evt': btn.getAttribute('data-gx-evt') ?? '',
    };
  });
  console.log('\nBTNDOWNLODFILES info:', JSON.stringify(btnInfo, null, 2));

  // まず selectAllRows 相当: GeneXus の selectAllCheckbox
  console.log('\n--- selectAllRows via GeneXus ---');
  await page.evaluate(() => {
    // GeneXus grid の全選択
    const allCbs = document.querySelectorAll('input[type="checkbox"]');
    allCbs.forEach((cb) => {
      const el = cb as HTMLInputElement;
      if (!el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  await page.waitForTimeout(2000);

  // ダウンロードボタンをいくつかの方法でクリック
  console.log('\n--- Click BTNDOWNLODFILES (force) ---');
  const [dlPromise] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('#BTNDOWNLODFILES', { force: true, timeout: 5000 }).catch((e) => console.log('click err:', e.message)),
  ]);

  if (dlPromise) {
    console.log('Download event! filename:', dlPromise.suggestedFilename());
  } else {
    console.log('No download event after force click.');
  }

  await page.waitForTimeout(3000);

  // page.evaluate で gx.evt 直接発火を試す
  console.log('\n--- Trigger via GeneXus evt ---');
  const gxResult = await page.evaluate(() => {
    try {
      // GeneXus イベントシステムにアクセス
      const w = window as any;
      if (w.gx && w.gx.fn && w.gx.fn.getServerEventArgs) {
        const btn = document.querySelector('#BTNDOWNLODFILES') as HTMLElement;
        if (btn) {
          // GeneXus の標準イベント発火
          const evt = btn.getAttribute('data-gx-evt');
          console.log('gx-evt:', evt);
          if (w.gx.evt && w.gx.evt.onclick) {
            w.gx.evt.onclick(null, btn);
            return 'gx.evt.onclick called';
          }
        }
      }
      // GeneXus grid API
      if (w.gx && w.gx.grid) {
        return 'gx.grid exists: ' + JSON.stringify(Object.keys(w.gx.grid));
      }
      return 'no gx.evt';
    } catch (e: any) {
      return 'error: ' + e.message;
    }
  });
  console.log('gxResult:', gxResult);
  await page.waitForTimeout(3000);

  console.log('\n=== Done ===');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
