/**
 * ログインページDOMプローブ（一時調査用）
 * npx ts-node src/modules/scraper/kaken/probeLogin.ts
 */
import { chromium } from 'playwright';

const LOGIN_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to:', LOGIN_URL);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);

  console.log('URL after load:', page.url());
  console.log('Title:', await page.title());

  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      cls: el.className.slice(0, 80),
    }))
  );
  console.log('\n=== INPUTS ===');
  console.log(JSON.stringify(inputs, null, 2));

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, input[type="submit"]')).map((el) => ({
      tag: el.tagName,
      id: el.id,
      type: (el as HTMLInputElement).type ?? '',
      text: el.textContent?.trim().slice(0, 80),
      cls: el.className.slice(0, 80),
    }))
  );
  console.log('\n=== BUTTONS ===');
  console.log(JSON.stringify(buttons, null, 2));

  const forms = await page.evaluate(() =>
    Array.from(document.querySelectorAll('form')).map((f) => ({
      id: f.id,
      action: f.action,
      method: f.method,
      cls: f.className,
    }))
  );
  console.log('\n=== FORMS ===');
  console.log(JSON.stringify(forms, null, 2));

  await page.screenshot({ path: 'storage/screenshots/probe-login-dom.png' });
  console.log('\nScreenshot: storage/screenshots/probe-login-dom.png');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
