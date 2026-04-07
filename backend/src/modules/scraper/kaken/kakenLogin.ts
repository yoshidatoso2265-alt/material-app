/**
 * kakenLogin - 化研マテリアル会員サイトへのログイン
 *
 * 【DOM構造確認済み (2026-03-17 probe)】
 *   - ログインページURL: .../gamexamplelogin（wwpbaseobjects.home からリダイレクト）
 *   - ユーザー名: #vUSERNAME  (type="text", placeholder="メールアドレス")
 *   - パスワード: #vUSERPASSWORD (type="password")
 *   - ログインボタン: #BTNENTER (type="button", GeneXus JSイベント)
 *   - エラー表示: #TABLELOGINERROR
 *   - フォームaction: .../gamexamplelogin (POST)
 *
 * 【成功判定方針】
 *   - ログイン後に URL が gamexamplelogin から離れたら成功
 *   - 離れない場合（15秒タイムアウト）は失敗扱いでエラーを投げる
 *   - #TABLELOGINERROR が表示されたら認証失敗エラーを投げる
 *
 * 【旧実装の問題点】
 *   - waitForSelector(detached) が15秒タイムアウト後に例外を投げず続行
 *   - 結果として未ログイン状態なのに「ログイン完了」として返っていた
 */

import { Page } from 'playwright';
import { saveArtifact } from './kakenClient';
import { logger } from '../../../utils/logger';

// wwpbaseobjects.home → gamexamplelogin へリダイレクトされる
export const LOGIN_URL =
  'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.wwpbaseobjects.home';

// ログインページを識別するURL断片
const LOGIN_PAGE_PATTERN = 'gamexamplelogin';

const SELECTORS = {
  // 優先順: id → name → type → placeholder
  loginId:  '#vUSERNAME',       // type="text", placeholder="メールアドレス"
  password: '#vUSERPASSWORD',   // type="password"
  submit:   '#BTNENTER',        // type="button"（GeneXus JSイベント）
  errorBox: '#TABLELOGINERROR',
  // ログイン後ページ（納品書）の固有要素
  postLoginElem: '#vRPD_DELINOTEDATE, #BTNDOWNLODFILES, [name="GridContainerDataV"]',
} as const;

export async function login(
  page: Page,
  loginId: string,
  password: string
): Promise<void> {

  // ── Step 1: ログインページへアクセス（リダイレクト先も含め安定待機）──
  logger.info('Kaken: ログインページへアクセス中...');
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // GeneXus アプリはリダイレクト後に JS で追加描画するため少し待つ
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  } catch (e) {
    const ss = await saveArtifact(page, 'error-goto-login');
    throw new Error(
      `ログインページへのアクセスに失敗しました。\nURL: ${LOGIN_URL}\n` +
      `スクリーンショット: ${ss}\n原因: ${(e as Error).message}`
    );
  }

  const currentUrl = page.url();
  logger.info(`Kaken: 遷移後URL: ${currentUrl}`);

  // ── Step 2: ログイン済み判定 ──
  // ログインページURL でなければすでに認証済みとみなす
  const isOnLoginPage = currentUrl.includes(LOGIN_PAGE_PATTERN);
  if (!isOnLoginPage) {
    logger.info(`Kaken: ログインページではない（${currentUrl}）。ログイン済みとみなします。`);
    await saveArtifact(page, 'probe-already-logged-in');
    return;
  }

  // ── Step 3: フォーム要素確認 ──
  const loginFieldVisible = await page
    .locator(SELECTORS.loginId)
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!loginFieldVisible) {
    const ss = await saveArtifact(page, 'error-login-form-missing');
    throw new Error(
      `ログインフォームが見つかりません（セレクタ: ${SELECTORS.loginId}）。\n` +
      `現在URL: ${currentUrl}\nスクリーンショット: ${ss}`
    );
  }

  // ── Step 4: フォーム入力 ──
  logger.info('Kaken: ログインフォームへ入力中...');
  try {
    await page.fill(SELECTORS.loginId, loginId);
    await page.fill(SELECTORS.password, password);
    // 入力値確認（パスワードは長さのみ）
    const filledId = await page.inputValue(SELECTORS.loginId);
    const filledPw = await page.inputValue(SELECTORS.password);
    logger.info(
      `Kaken: 入力確認 loginId="${filledId}" password=${'*'.repeat(filledPw.length)}`
    );
  } catch (e) {
    const ss = await saveArtifact(page, 'error-login-form-fill');
    throw new Error(
      `ログインフォームへの入力に失敗しました。\nスクリーンショット: ${ss}\n` +
      `原因: ${(e as Error).message}`
    );
  }

  // ── Step 5: フォーム送信 → URL変化を waitForURL で待機 ──
  //
  // 【重要】GeneXus のフォーム送信は AJAX ベース。以下のことが確認済み：
  //   - page.click('#BTNENTER') → GeneXus data-gx-evt が headless で発火しない
  //   - page.press('Enter')    → ネイティブフォーム送信として機能する（probe確認済み）
  //   - waitForNavigation      → 170ms で誤解決する（CSS/JSリクエストを検知してしまう）
  //   - waitForURL             → URL が gamexamplelogin から離れるまで正確に待てる
  //
  logger.info('Kaken: フォーム送信中（Enterキー + waitForURL）...');
  await saveArtifact(page, 'probe-before-login-click');

  await page.press(SELECTORS.password, 'Enter');

  // URL が gamexamplelogin から離れるまで最大20秒待つ
  try {
    await page.waitForURL(
      (url) => !url.href.includes(LOGIN_PAGE_PATTERN),
      { timeout: 20_000, waitUntil: 'domcontentloaded' }
    );
  } catch (e) {
    logger.warn(`Kaken: waitForURL タイムアウト（GeneXus AJAX遅延の可能性）: ${(e as Error).message}`);
  }

  // networkidle で追加描画を待つ
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const afterLoginUrl = page.url();
  logger.info(`Kaken: クリック後URL: ${afterLoginUrl}`);

  // ── Step 6: エラーボックス確認 ──
  const errorVisible = await page.locator(SELECTORS.errorBox).isVisible().catch(() => false);
  if (errorVisible) {
    const errorText = await page
      .locator(SELECTORS.errorBox)
      .textContent({ timeout: 3_000 })
      .catch(() => '');
    const ss = await saveArtifact(page, 'error-login-failed');
    throw new Error(
      `ログインに失敗しました。ID/パスワードを確認してください。\n` +
      `エラーメッセージ: "${errorText?.trim()}"\n` +
      `現在URL: ${afterLoginUrl}\nスクリーンショット: ${ss}`
    );
  }

  // ── Step 7: ログイン成功確認（URLがログインページから離れたか）──
  if (afterLoginUrl.includes(LOGIN_PAGE_PATTERN)) {
    // まだログインページにいる → 失敗（エラーボックスなし・原因不明）
    const ss = await saveArtifact(page, 'error-login-stuck-on-login-page');
    throw new Error(
      `ログイン後もログインページに留まっています。\n` +
      `試行したセレクタ: loginId=${SELECTORS.loginId}, submit=${SELECTORS.submit}\n` +
      `現在URL: ${afterLoginUrl}\nスクリーンショット: ${ss}`
    );
  }

  // ── Step 8: ログイン後ページの確認 ──
  logger.info(`Kaken: ログイン成功。遷移先: ${afterLoginUrl}`);
  await saveArtifact(page, 'probe-post-login');
  logger.info('Kaken: ログイン完了');
}
