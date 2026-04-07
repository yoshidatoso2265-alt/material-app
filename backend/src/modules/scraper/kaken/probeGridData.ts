/**
 * グリッドデータの実際の内容を調査
 * npx ts-node src/modules/scraper/kaken/probeGridData.ts
 */
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL     = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const DELIVERY_URL  = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';
const loginId       = process.env.KAKEN_LOGIN_ID ?? '';
const password      = process.env.KAKEN_LOGIN_PASSWORD ?? '';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ログイン
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForURL((url) => !url.href.includes('gamexamplelogin'), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Logged in. URL:', page.url());

  // 納品書ページへ
  await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#vRPD_DELINOTEDATE', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('On delivery page');

  // グリッドデータ読取
  const rawValue = await page.inputValue('[name="GridContainerDataV"]').catch(() => '[]');
  const data = JSON.parse(rawValue) as string[][];
  console.log(`\nGrid rows: ${data.length}`);

  // 最初の3行を詳細表示
  data.slice(0, 3).forEach((row, i) => {
    console.log(`\n=== Row ${i} ===`);
    row.forEach((cell, j) => {
      if (cell) console.log(`  [${j}]: ${cell}`);
    });
  });

  // pdfPath (row[15]) を全行分表示
  console.log('\n=== pdfPath (row[15]) for all rows ===');
  data.forEach((row, i) => {
    console.log(`  ${i}: pdfFilename=${row[13]} | pdfPath=${row[15]}`);
  });

  // PDF を1件だけ試しにダウンロードして確認
  const testRow = data.find(row => row[15]);
  if (testRow) {
    const pdfPath = testRow[15];
    // const pdfFilename = testRow[13];
    console.log(`\n=== PDF download test ===`);
    console.log(`pdfPath raw: "${pdfPath}"`);

    // URL構築パターンを試す
    const KAKEN_BASE = 'https://invoice.kaken-material.co.jp';
    let fullUrl: string;
    if (pdfPath.startsWith('http')) {
      fullUrl = pdfPath;
    } else if (pdfPath.startsWith('/')) {
      fullUrl = `${KAKEN_BASE}${pdfPath}`;
    } else {
      fullUrl = `${KAKEN_BASE}/KakenMyPaperWeb/${pdfPath}`;
    }
    console.log(`Constructed URL: ${fullUrl}`);

    // 実際にダウンロードを試みる
    const resp = await page.context().request.get(fullUrl, {
      headers: { Referer: DELIVERY_URL },
      timeout: 15_000,
    });
    console.log(`HTTP status: ${resp.status()} ${resp.statusText()}`);
    if (resp.ok()) {
      const body = await resp.body();
      console.log(`Response size: ${body.length} bytes`);
      console.log(`First bytes (hex): ${Buffer.from(body.slice(0, 8)).toString('hex')}`);
    } else {
      // Content-Type を確認
      const ct = resp.headers()['content-type'];
      console.log(`Content-Type: ${ct}`);
      const text = await resp.text().catch(() => '');
      console.log(`Response text (first 300): ${text.slice(0, 300)}`);
    }
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
