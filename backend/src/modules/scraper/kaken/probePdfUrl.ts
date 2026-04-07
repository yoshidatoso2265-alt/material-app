/**
 * 実際のPDFダウンロードURLをネットワーク傍受で確認
 */
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL    = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const DELIVERY_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';
const KAKEN_BASE   = 'https://invoice.kaken-material.co.jp';
const loginId      = process.env.KAKEN_LOGIN_ID ?? '';
const password     = process.env.KAKEN_LOGIN_PASSWORD ?? '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ネットワークリクエストを全部ログ
  const pdfRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('.pdf') || url.includes('Service02') || url.includes('download') || url.includes('pdf')) {
      console.log(`REQ [${req.method()}]: ${url}`);
      pdfRequests.push(url);
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('.pdf') || url.includes('Service02') || url.includes('download')) {
      console.log(`RES [${res.status()}]: ${url}`);
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

  // pdfPath を取得して URLパターンを全部試す
  const rawValue = await page.inputValue('[name="GridContainerDataV"]').catch(() => '[]');
  const data = JSON.parse(rawValue) as string[][];
  const testRow = data[1]; // Row 1: レジデンス２８
  const pdfPath = testRow[15];
  console.log('\npdfPath:', pdfPath);

  // 試すURL候補
  const urlCandidates = [
    `${KAKEN_BASE}/KakenMyPaperWeb/${pdfPath}`,
    `${KAKEN_BASE}/${pdfPath}`,
    `${KAKEN_BASE}/KakenMyPaperWeb/servlet/${pdfPath}`,
  ];

  for (const url of urlCandidates) {
    const resp = await page.context().request.get(url, {
      headers: { Referer: DELIVERY_URL },
      timeout: 10_000,
    }).catch((e) => ({ status: () => -1, statusText: () => String(e), ok: () => false, body: async () => Buffer.alloc(0), headers: () => ({}) }));

    const status = resp.status();
    const ok = resp.ok ? resp.ok() : false;
    console.log(`\nURL: ${url}`);
    console.log(`  Status: ${status}`);
    if (ok) {
      const body = await resp.body();
      console.log(`  Size: ${body.length}`);
      console.log(`  First bytes: ${Buffer.from(body.slice(0, 4)).toString('hex')}`);
      console.log('  ✅ PDF accessible!');
    }
  }

  // ページHTML中の PDF リンクを全部探す
  console.log('\n=== PDF links in page HTML ===');
  const pdfLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*=".pdf"], a[href*="Service02"]'))
      .map(el => (el as HTMLAnchorElement).href)
  );
  pdfLinks.slice(0, 10).forEach(l => console.log(' ', l));

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
