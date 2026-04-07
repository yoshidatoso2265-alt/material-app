/**
 * ログインボタンのJS動作を詳細調査
 * npx ts-node src/modules/scraper/kaken/probeLoginClick.ts
 */
import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
dotenv.config();

const LOGIN_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';
const loginId   = process.env.KAKEN_LOGIN_ID     ?? '';
const password  = process.env.KAKEN_LOGIN_PASSWORD ?? '';

(async () => {
  const browser = await chromium.launch({ headless: false }); // 目視確認のためheadless=false
  const page = await browser.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log('Page URL:', page.url());
  console.log('Title:', await page.title());

  // #BTNENTER の onclick 属性を確認
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('#BTNENTER') as HTMLElement | null;
    const form = document.querySelector('form') as HTMLFormElement | null;
    return {
      btnOnclick: btn?.getAttribute('onclick'),
      btnOuterHTML: btn?.outerHTML.slice(0, 200),
      formOnsubmit: form?.getAttribute('onsubmit'),
      formAction: form?.action,
      // GeneXus global functions
      hasGx: typeof (window as any).gx !== 'undefined',
    };
  });
  console.log('\n=== BTNENTER INFO ===');
  console.log(JSON.stringify(btnInfo, null, 2));

  // フォーム入力
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  console.log('\nForm filled. Trying Enter key...');

  // Enter キーでのフォーム送信を試みる
  await page.screenshot({ path: 'storage/screenshots/probe-before-submit.png' });

  // 方法1: Enterキー
  await page.press('#vUSERPASSWORD', 'Enter');
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

  const urlAfterEnter = page.url();
  console.log('URL after Enter:', urlAfterEnter);
  await page.screenshot({ path: 'storage/screenshots/probe-after-enter.png' });

  if (!urlAfterEnter.includes('gamexamplelogin')) {
    console.log('SUCCESS with Enter key!');
    await browser.close();
    return;
  }

  console.log('Enter key did not work. Trying JS form.submit()...');

  // 方法2: JS で form.submit()
  await page.fill('#vUSERNAME', loginId);
  await page.fill('#vUSERPASSWORD', password);
  await page.evaluate(() => {
    (document.querySelector('form') as HTMLFormElement)?.submit();
  });
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

  const urlAfterSubmit = page.url();
  console.log('URL after form.submit():', urlAfterSubmit);
  await page.screenshot({ path: 'storage/screenshots/probe-after-form-submit.png' });

  if (!urlAfterSubmit.includes('gamexamplelogin')) {
    console.log('SUCCESS with form.submit()!');
  } else {
    // エラーボックスを確認
    const errorText = await page.locator('#TABLELOGINERROR').textContent({ timeout: 2_000 }).catch(() => null);
    console.log('Still on login page. Error text:', errorText ?? '(none)');

    // ページ全体のテキストで認証エラーメッセージを確認
    const bodyText = await page.locator('body').textContent({ timeout: 2_000 }).catch(() => '');
    const errorSnippet = bodyText?.slice(0, 500);
    console.log('Body text snippet:', errorSnippet);
  }

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
