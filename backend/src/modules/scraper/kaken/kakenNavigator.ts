/**
 * kakenNavigator - 日付範囲フィルタ設定 + 全選択
 *
 * セレクタ確定済み（probe-post-login-*.html より）:
 *
 * 【重要な発見】
 * ログイン後、自動的に「納品書」ページへ遷移済み。
 * 追加のページ遷移は不要。
 * フォーム action: com.kakenmypaperweb.rp_delinotetdlallww
 *
 * 日付フィルタ:
 *   - From: #vRPD_DELINOTEDATE  (value="YYYY/MM/DD", 形式: YMD)
 *   - To:   #vRPD_DELINOTEDATE_TO (同上)
 *
 * グリッド操作:
 *   - 全選択: [name="selectAllCheckbox"] (→ #vSELECTALL をclick)
 *   - 個別行: #vSELECTED_0001, #vSELECTED_0002 ...
 *
 * グリッドデータ構造:
 *   [0]:selected [1]:customer_code [2]:company [3]:contact
 *   [4]:company [5]:group_code [6]:delivery_date [7]:slip_number
 *   [8]:site_name [9]:description [10]:amount [11]:send_date
 *   [12]:downloaded [13]:pdf_filename [14]:dl_count [15]:pdf_path
 *   [16]:csv_filename [17]:csv_path
 */

import { Page } from 'playwright';
import { saveArtifact } from './kakenClient';
import { logger } from '../../../utils/logger';

const SELECTORS = {
  dateFrom:        '#vRPD_DELINOTEDATE',
  dateTo:          '#vRPD_DELINOTEDATE_TO',
  selectAll:       '[name="selectAllCheckbox"]',
  selectAllHidden: '#vSELECTALL',
  downloadBtn:     '#BTNDOWNLODFILES',
  gridData:        '[name="GridContainerDataV"]',
} as const;

// 納品書ページ URL（ホームの href="com.kakenmypaperweb.rp_delinotetdlallww" より確定）
const DELIVERY_URL = 'https://invoice.kaken-material.co.jp/KakenMyPaperWeb/servlet/com.kakenmypaperweb.rp_delinotetdlallww';

/**
 * 納品書ページへ遷移する
 *
 * ログイン後は「ホーム」（wwpbaseobjects.home）に遷移するため、
 * 納品書ページの URL へ直接 goto() する。
 */
export async function goToDeliveryPage(page: Page): Promise<void> {
  logger.info(`Kaken: 納品書ページへ遷移中: ${DELIVERY_URL}`);

  try {
    await page.goto(DELIVERY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (e) {
    const ss = await saveArtifact(page, 'error-goto-delivery');
    throw new Error(
      `納品書ページへのアクセスに失敗しました。
URL: ${DELIVERY_URL}
` +
      `スクリーンショット: ${ss}
原因: ${(e as Error).message}`
    );
  }

  const found = await page
    .waitForSelector(SELECTORS.dateFrom, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    const ss = await saveArtifact(page, 'error-not-on-delivery-page');
    throw new Error(
      `納品書ページの確認に失敗しました（セッション切れの可能性）。
` +
      `スクリーンショット: ${ss}`
    );
  }

  logger.info('Kaken: 納品書ページ確認済み');
}

/**
 * 日付範囲を設定してグリッドのフィルタを適用する
 *
 * GeneXus WorkWithPlus の日付フィルタは入力後に
 * Tab / blur イベントで自動適用される。
 *
 * @param from YYYY-MM-DD 形式
 * @param to   YYYY-MM-DD 形式
 */
export async function setDateRangeAndSearch(
  page: Page,
  from: string,
  to: string
): Promise<void> {
  // YYYY-MM-DD → YYYY/MM/DD（サイト形式）
  const fromFormatted = from.replace(/-/g, '/');
  const toFormatted   = to.replace(/-/g, '/');

  logger.info(`Kaken: 日付範囲設定: ${fromFormatted} 〜 ${toFormatted}`);

  try {
    // GeneXus の onchange="gx.evt.onchange(this, event)" を発火させるため
    // fill() は programmatic変更なので change イベントが trusted にならない
    // → triple-click → keyboard.type() でユーザー入力をシミュレート
    //
    // 【重要】YYYY/MM/DD のマスク入力では "/" が cursor ジャンプを引き起こす
    // → スラッシュを除いた8桁数字のみタイプする（マスクが自動補完）
    await page.waitForSelector(SELECTORS.dateFrom, { timeout: 10_000 });

    const fromDigits = fromFormatted.replace(/\//g, '');  // "20260228"
    const toDigits   = toFormatted.replace(/\//g, '');    // "20260317"

    // From 日付入力
    // triple-click で全選択 → Backspace で消去 → 数字8桁を入力
    await page.click(SELECTORS.dateFrom, { clickCount: 3 });
    await page.waitForTimeout(100);
    for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(fromDigits, { delay: 60 });
    await page.press(SELECTORS.dateFrom, 'Tab');
    await page.waitForTimeout(500);

    // To 日付入力
    await page.click(SELECTORS.dateTo, { clickCount: 3 });
    await page.waitForTimeout(100);
    for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(toDigits, { delay: 60 });
    await page.press(SELECTORS.dateTo, 'Tab');
  } catch (e) {
    const ss = await saveArtifact(page, 'error-date-input');
    throw new Error(
      `日付範囲の入力に失敗しました。\nスクリーンショット: ${ss}\n原因: ${(e as Error).message}`
    );
  }

  // グリッドの更新を待つ（GeneXus は AJAX で再描画）
  logger.info('Kaken: グリッド更新待機中...');
  // networkidle でAJAX完了を確認してから最大5秒まで待つ
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  // 入力値確認
  const actualFrom = await page.inputValue(SELECTORS.dateFrom).catch(() => '');
  const actualTo   = await page.inputValue(SELECTORS.dateTo).catch(() => '');
  logger.info(`Kaken: 日付確認 from="${actualFrom}" to="${actualTo}"`);

  logger.info('Kaken: 日付フィルタ設定完了');
}

/**
 * グリッドの全行を選択する
 * GeneXus の selectAllCheckbox は #vSELECTALL を click() でトリガー
 */
/**
 * 全行を個別に jQuery trigger click で選択する
 *
 * 【重要な発見】
 * GeneXus の selectAllCheckbox (jQuery trigger) は vSELECTALL = true にするが
 * BTNDOWNLODFILES のダウンロードイベントを発火させない。
 * 個別行 (#vSELECTED_0001...) を jQuery trigger click すると
 * 各行ごとに GeneXus AJAX POST が走り、ダウンロードボタンが機能するようになる。
 *
 * @returns 選択した行数
 */
/**
 * 現在ページの行を全選択
 *
 * 【修正】jQuery trigger依存を廃止し、Playwrightネイティブclickを使用。
 * jQuery が headless環境で未定義になるケースで常に0を返していたバグを修正。
 * Playwright の click() は trusted MouseEvent を発火するため GeneXus AJAX も正常に動作する。
 */
export async function selectCurrentPageRows(page: Page): Promise<number> {
  await page.waitForTimeout(1_500);

  const checkboxLocator = page.locator('input[type="checkbox"][id^="vSELECTED_"]');
  const count = await checkboxLocator.count();

  if (count === 0) {
    logger.warn('Kaken: vSELECTED_ チェックボックスが見つかりません');
    return 0;
  }

  logger.info(`Kaken: ${count}件のチェックボックスをクリック中...`);

  for (let i = 0; i < count; i++) {
    try {
      // dispatchEvent はビューポート外でも動作する（GeneXus の onchange/onclick ハンドラを発火）
      await checkboxLocator.nth(i).dispatchEvent('click');
      // GeneXus AJAX完了を待つ（1行ごとにPOSTが走る）
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    } catch (e) {
      logger.warn(`Kaken: チェックボックス ${i + 1}/${count} クリック失敗: ${(e as Error).message}`);
    }
  }

  await page.waitForTimeout(1_500);
  return count;
}

/**
 * 全ページにわたって全行を選択する
 * GeneXus サーバー側にチェック状態を送るため jQuery trigger click が必要
 * @returns 選択した総行数
 */
export async function selectAllRows(page: Page): Promise<number> {
  logger.info('Kaken: 全行選択中（全ページ対応）...');
  try {
    const totalPages = await getTotalPages(page);
    let totalSelected = 0;

    for (let p = 1; p <= totalPages; p++) {
      if (p > 1) {
        await clickPageNumber(page, p);
      }
      const count = await selectCurrentPageRows(page);
      totalSelected += count;
      logger.info(`Kaken: ページ${p}/${totalPages} 選択完了: ${count} 行（累計 ${totalSelected} 行）`);
    }

    // ページ1に戻す（ダウンロードボタン操作のため）
    if (totalPages > 1) {
      await clickPageNumber(page, 1);
      await page.waitForTimeout(2_000);
    }

    logger.info(`Kaken: 全ページ選択完了: 合計 ${totalSelected} 行`);
    return totalSelected;
  } catch (e) {
    const ss = await saveArtifact(page, 'error-select-all');
    throw new Error(
      `全行選択に失敗しました。\nスクリーンショット: ${ss}\n原因: ${(e as Error).message}`
    );
  }
}

/**
 * 現在ページのグリッド行をDOMから直接読み取る
 * vSELECTED_ チェックボックスの最近接 tr から全セルを取得
 */
export async function readCurrentPageRows(page: Page): Promise<GridRow[]> {
  return page.evaluate(() => {
    const checkboxes = Array.from(
      document.querySelectorAll('input[type="checkbox"][id^="vSELECTED_"]')
    ) as HTMLInputElement[];
    return checkboxes.map(cb => {
      const tr = cb.closest('tr');
      const cells = tr
        ? Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() ?? '')
        : [];
      // cells[0]=checkbox, [1]=code, [2]=company, [3]=contact, [4]=company2, [5]=code2
      // [6]=date, [7]=slipNo, [8]=siteName, [9]=desc, [10]=amount
      // [11]=sendDate, [12]=downloaded, [13]=pdfFilename, [14]=dlCount, [15]=pdfPath
      return [
        'false',        // selected
        cells[1] ?? '', // customerCode
        cells[2] ?? '', // company
        cells[3] ?? '', // contact
        cells[4] ?? '', // company2
        cells[5] ?? '', // code2
        cells[6] ?? '', // deliveryDate
        cells[7] ?? '', // slipNumber
        cells[8] ?? '', // siteName
        cells[9] ?? '', // description
        (cells[10] ?? '').replace(/,/g, ''), // amount (remove commas)
        cells[11] ?? '', // sendDate
        cells[12] ?? '', // downloaded
        cells[13] ?? '', // pdfFilename
        cells[14] ?? '', // dlCount
        cells[15] ?? '', // pdfPath
        '',              // csvFilename
        '',              // csvPath
      ];
    });
  }).then(rows => rows.map(mapGridRow));
}

/**
 * ページネーションの総ページ数を取得する
 */
export async function getTotalPages(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pageLinks = Array.from(
      document.querySelectorAll('ul.pagination li a')
    ).filter(a => /^\d+$/.test(a.textContent?.trim() ?? ''));
    const nums = pageLinks.map(a => parseInt(a.textContent?.trim() ?? '0', 10));
    return nums.length > 0 ? Math.max(...nums) : 1;
  });
}

/**
 * 指定ページ番号をクリックして遷移する
 */
export async function clickPageNumber(page: Page, pageNum: number): Promise<void> {
  await page.evaluate((num) => {
    const pageLinks = Array.from(
      document.querySelectorAll('ul.pagination li a')
    ).filter(a => /^\d+$/.test(a.textContent?.trim() ?? ''));
    const target = pageLinks.find(a => a.textContent?.trim() === String(num)) as HTMLAnchorElement | undefined;
    if (target) target.click();
  }, pageNum);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

/**
 * グリッドの全行を全ページにわたって読み取る
 * ページネーションを自動的に処理して全件返す
 */
export async function readGridData(page: Page): Promise<GridRow[]> {
  const allRows: GridRow[] = [];

  try {
    // ページ1の行を読む
    const page1Rows = await readCurrentPageRows(page);
    allRows.push(...page1Rows);
    logger.info(`Kaken: ページ1 ${page1Rows.length} 行読取`);

    // 総ページ数を確認
    const totalPages = await getTotalPages(page);
    logger.info(`Kaken: 総ページ数 ${totalPages}`);

    // ページ2以降を順番に読む
    for (let p = 2; p <= totalPages; p++) {
      await clickPageNumber(page, p);
      const rows = await readCurrentPageRows(page);
      allRows.push(...rows);
      logger.info(`Kaken: ページ${p} ${rows.length} 行読取（累計 ${allRows.length} 行）`);
    }

    // 最後にページ1に戻す（後続のselectAllRows処理のため）
    if (totalPages > 1) {
      await clickPageNumber(page, 1);
    }

    logger.info(`Kaken: グリッドデータ全件読取完了 ${allRows.length} 行`);
    return allRows;
  } catch (e) {
    logger.warn(`グリッドデータ読取失敗: ${(e as Error).message}`);
    return allRows; // 途中まで取得できた分を返す
  }
}

export interface GridRow {
  selected: boolean;
  customerCode: string;
  companyName: string;
  contact: string;
  deliveryDate: string;     // YYYY/MM/DD
  slipNumber: string;
  siteName: string;
  description: string;
  amount: number | null;
  sendDate: string;
  pdfFilename: string;      // row[13]: PDF ファイル名
  pdfPath: string;          // row[15]: PDF ダウンロードパス（認証済みセッションで取得）
  csvFilename: string;
  csvPath: string;
}

function mapGridRow(row: string[]): GridRow {
  return {
    selected:     row[0] === 'true',
    customerCode: row[1] ?? '',
    companyName:  row[2] ?? '',
    contact:      row[3] ?? '',
    deliveryDate: row[6] ?? '',
    slipNumber:   row[7] ?? '',
    siteName:     row[8] ?? '',
    description:  row[9] ?? '',
    amount:       row[10] ? parseFloat(row[10]) : null,
    sendDate:     row[11] ?? '',
    pdfFilename:  row[13] ?? '',
    pdfPath:      row[15] ?? '',
    csvFilename:  row[16] ?? '',
    csvPath:      row[17] ?? '',
  };
}
