/**
 * slipParser + lineItemParser 手動テストスクリプト
 * 実行: npx ts-node src/modules/delivery-imports/pdf/__tests__/slipParser.test.ts
 *
 * テストサンプルは化研マテリアル納品書の実際の構造を再現している。
 */

import {
  extractDeliveryDate,
  extractOrderer,
  extractPersonName,
  extractSiteNameCandidates,
  extractTotals,
  parseDeliverySlip,
} from '../slipParser';

import { detectLineItems } from '../lineItemParser';

// ============================================================
// テストユーティリティ
// ============================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${(e as Error).message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} 期待: ${JSON.stringify(expected)}, 実際: ${JSON.stringify(actual)}`);
  }
}

function assertDefined<T>(val: T, msg = '') {
  if (val === undefined || val === null) {
    throw new Error(`${msg} undefined/null は不可`);
  }
}

function assertNotContains(arr: string[], forbidden: string, msg = '') {
  const found = arr.find((s) => s.includes(forbidden));
  if (found) {
    throw new Error(`${msg} "${forbidden}" が含まれてはいけないが含まれていた: "${found}"`);
  }
}

// ============================================================
// 化研マテリアル納品書の実際の構造を再現したサンプルテキスト
// ============================================================

/**
 * 化研マテリアル納品書サンプル（PDF テキスト抽出後を想定）
 *
 * 実際のPDFからは以下のような構造でテキストが抽出される:
 *   - 上部: ヘッダ情報（日付・顧客番号・発注者・担当者）
 *   - 中部: お届け先住所ブロック（明細として扱わないこと）
 *   - 商品テーブル: 「商品名称」ヘッダで始まる明細部分
 *   - 「貴社入れ」の次行: 現場名 + 合計補助金額
 *   - 合計行
 */
const KAKEN_SAMPLE_TEXT = `
2026/03/13

912625 榎本様

株式会社吉田 首都１部１Ｔ 手代木寛之

品名・規格・容量 数量 単価 金額 消費税 合計

お届け先
〒154-0023
東京都世田谷区
TEL: 03-1234-5678

摘要

商品名称  規格容量  数量  単位  単価  金額（税別）  消費税額  金額（税込）
ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ 淡彩  17-70H 4KG  1  ｶﾝ  5,800  5,800  580  6,380
小口割増運賃  １〜３缶  1  ｼｷ  600  600  60  660
運賃  1  ｼｷ  450  450  45  495
貴社入れ
レジデンス２８ 6,850 685 7,535

合計 6,850 685 7,535
`;

// ============================================================
// 納品日抽出テスト
// ============================================================

console.log('\n📅 納品日抽出テスト');

test('化研PDF: yyyy/mm/dd 形式', () => {
  assertEqual(extractDeliveryDate('2026/03/13'), '2026-03-13');
});

test('yyyy年mm月dd日 形式', () => {
  assertEqual(extractDeliveryDate('令和8年3月13日 発行'), '2026-03-13');
});

test('yyyy-mm-dd 形式', () => {
  assertEqual(extractDeliveryDate('Date: 2026-03-13'), '2026-03-13');
});

test('年月日なしは undefined', () => {
  assertEqual(extractDeliveryDate('テキストのみ'), undefined);
});

test('化研サンプルから納品日を取得', () => {
  const result = extractDeliveryDate(KAKEN_SAMPLE_TEXT);
  assertEqual(result, '2026-03-13');
});

// ============================================================
// 発注者抽出テスト
// ============================================================

console.log('\n👤 発注者抽出テスト');

test('ご発注者: 形式（ラベル付き）', () => {
  assertEqual(extractOrderer('ご発注者: 榎本様'), '榎本様');
});

test('発注者　形式（全角スペース）', () => {
  assertDefined(extractOrderer('発注者　田中様'));
});

test('化研PDF形式: 顧客番号付き "912625 榎本様"', () => {
  // "ご発注者" ラベルなしのパターン - テキスト全体から探す
  // 化研サンプルでは "912625 榎本様" 単独行
  // extractOrderer はラベルベースなので、サンプル内 "ご発注者" がない場合は undefined
  // このテストは「顧客番号付きのご発注者ラベル形式」を検証する
  const text = 'ご発注者 912625 榎本様';
  const result = extractOrderer(text);
  // 数字のみ "912625" ではなく "榎本様" が取れること
  assertEqual(result, '榎本様');
});

// ============================================================
// 担当者抽出テスト
// ============================================================

console.log('\n🙋 担当者抽出テスト');

test('担当者ラベル付き: "担当者 手代木寛之 様"', () => {
  const result = extractPersonName('担当者 手代木寛之 様');
  assertDefined(result);
});

test('担当: 形式', () => {
  const result = extractPersonName('担当:手代木寛之');
  assertDefined(result);
});

test('化研PDF形式: "株式会社吉田 首都１部１Ｔ 手代木寛之"', () => {
  const result = extractPersonName('株式会社吉田 首都１部１Ｔ 手代木寛之');
  assertDefined(result, '担当者が取れること');
  // 「榎本様」は発注者なので担当者にならないことも確認
  const wrongResult = result === '榎本様';
  assertEqual(wrongResult, false, '榎本様は担当者ではない');
  console.log(`    担当者: ${result}`);
});

test('化研サンプルから担当者を取得', () => {
  const result = extractPersonName(KAKEN_SAMPLE_TEXT);
  assertDefined(result, '担当者が取れること');
  console.log(`    担当者: ${result}`);
});

// ============================================================
// 現場名候補抽出テスト
// ============================================================

console.log('\n🏗️ 現場名候補抽出テスト');

test('現場名: ラベル付き', () => {
  const candidates = extractSiteNameCandidates('現場名: レジデンス２８');
  assertEqual(candidates.length > 0, true);
  assertEqual(candidates[0], 'レジデンス２８');
});

test('住所を含む候補は除外', () => {
  const candidates = extractSiteNameCandidates('現場名: 東京都渋谷区1-1-1');
  const hasAddress = candidates.some((c) => c.includes('東京都'));
  assertEqual(hasAddress, false);
});

test('法人名を含む候補は除外', () => {
  const candidates = extractSiteNameCandidates('現場名: 株式会社田中建設');
  const hasCorp = candidates.some((c) => c.includes('株式会社'));
  assertEqual(hasCorp, false);
});

test('化研PDF専用: 「貴社入れ」の次行から現場名を取得', () => {
  const text = '貴社入れ\nレジデンス２８ 6,850 685 7,535\n合計 ...';
  const candidates = extractSiteNameCandidates(text);
  assertEqual(candidates.length > 0, true, '候補が1件以上');
  assertEqual(candidates[0], 'レジデンス２８', '最優先候補がレジデンス２８であること');
});

test('化研PDF専用: 末尾の金額が除去されること', () => {
  const text = '貴社入れ\nレジデンス２８ 6,850 685 7,535';
  const candidates = extractSiteNameCandidates(text);
  const hasSiteName = candidates.some((c) => c === 'レジデンス２８');
  assertEqual(hasSiteName, true);
  // "6,850" "685" "7,535" が現場名に含まれていないこと
  const hasAmount = candidates.some((c) => /[0-9,，]/.test(c));
  assertEqual(hasAmount, false, '現場名候補に金額が含まれていないこと');
});

test('化研サンプルから現場名を取得（最優先: 貴社入れルール）', () => {
  const candidates = extractSiteNameCandidates(KAKEN_SAMPLE_TEXT);
  assertEqual(candidates.length > 0, true);
  assertEqual(candidates[0], 'レジデンス２８', '最優先候補がレジデンス２８であること');
  // 住所が候補に入っていないこと
  assertNotContains(candidates, '東京都', '東京都は現場名候補に含まれないこと');
  assertNotContains(candidates, '世田谷区', '世田谷区は現場名候補に含まれないこと');
  console.log(`    現場名候補: ${JSON.stringify(candidates)}`);
});

// ============================================================
// 合計抽出テスト
// ============================================================

console.log('\n💰 合計抽出テスト');

test('合計(税込) 形式', () => {
  const totals = extractTotals('合計(税込) 7,535');
  assertDefined(totals.in_tax);
  assertEqual(totals.in_tax, 7535);
});

test('小計 + 消費税 から税込計算', () => {
  const totals = extractTotals('小計 6,850\n消費税 685\n');
  assertEqual(totals.ex_tax, 6850);
  assertEqual(totals.tax, 685);
});

test('化研サンプルから合計を取得', () => {
  const totals = extractTotals(KAKEN_SAMPLE_TEXT);
  assertDefined(totals.in_tax, '税込合計が取れること');
  assertEqual(totals.in_tax, 7535);
});

// ============================================================
// 統合テスト: parseDeliverySlip（化研サンプル）
// ============================================================

console.log('\n📄 parseDeliverySlip 統合テスト（化研サンプル）');

test('化研サンプル: 納品日が抽出できる', () => {
  const result = parseDeliverySlip(KAKEN_SAMPLE_TEXT);
  assertEqual(result.delivery_date, '2026-03-13');
});

test('化研サンプル: 現場名がレジデンス２８', () => {
  const result = parseDeliverySlip(KAKEN_SAMPLE_TEXT);
  assertEqual(result.raw_site_name, 'レジデンス２８');
  console.log(`    現場名: ${result.raw_site_name}`);
});

test('化研サンプル: 担当者が取れる', () => {
  const result = parseDeliverySlip(KAKEN_SAMPLE_TEXT);
  assertDefined(result.raw_person_name);
  console.log(`    担当者: ${result.raw_person_name}`);
});

test('化研サンプル: 合計金額が 7535 円', () => {
  const result = parseDeliverySlip(KAKEN_SAMPLE_TEXT);
  assertEqual(result.total_amount_in_tax, 7535);
});

test('信頼度スコアが 0.0〜1.0 の範囲', () => {
  const result = parseDeliverySlip(KAKEN_SAMPLE_TEXT);
  assertEqual(result.parse_confidence >= 0 && result.parse_confidence <= 1, true);
  console.log(`    信頼度: ${(result.parse_confidence * 100).toFixed(0)}%`);
});

// ============================================================
// 明細行抽出テスト（化研サンプル）
// ============================================================

console.log('\n📋 明細行抽出テスト（化研サンプル）');

test('明細が3行取れる（材料1 + 小口割増 + 運賃）', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  console.log(`    明細件数: ${items.length}件`);
  items.forEach((item) => {
    console.log(`    - [${item.line_no}] ${item.item_name_raw} / 規格: ${item.spec_raw} / 数量: ${item.quantity} / 単位: ${item.unit} / 単価: ${item.unit_price} / 税別: ${item.amount_ex_tax} / 税額: ${item.tax_amount} / 税込: ${item.amount_in_tax} / 運賃: ${item.is_freight} / 割増: ${item.is_misc_charge}`);
  });
  assertEqual(items.length, 3, '明細は3行');
});

test('1行目の材料名が「ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ 淡彩」', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertDefined(items[0], '1行目が存在');
  assertEqual(items[0].item_name_raw, 'ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ 淡彩');
});

test('1行目の金額(税別)が 5800', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[0].amount_ex_tax, 5800);
});

test('1行目の消費税が 580', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[0].tax_amount, 580);
});

test('1行目の金額(税込)が 6380', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[0].amount_in_tax, 6380);
});

test('1行目の数量が 1', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[0].quantity, 1);
});

test('1行目の単価が 5800', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[0].unit_price, 5800);
});

test('2行目の材料名が「小口割増運賃」', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertDefined(items[1], '2行目が存在');
  assertEqual(items[1].item_name_raw, '小口割増運賃');
});

test('2行目の小口割増フラグが true', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[1].is_misc_charge, true);
});

test('3行目の材料名が「運賃」', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertDefined(items[2], '3行目が存在');
  assertEqual(items[2].item_name_raw, '運賃');
});

test('3行目の運賃フラグが true', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  assertEqual(items[2].is_freight, true);
});

test('住所・電話番号が item_name_raw に入っていない', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  const addressItems = items.filter(
    (i) =>
      i.item_name_raw?.includes('東京都') ||
      i.item_name_raw?.includes('世田谷区') ||
      i.item_name_raw?.includes('〒') ||
      i.item_name_raw?.includes('TEL') ||
      i.item_name_raw?.includes('お届け先')
  );
  if (addressItems.length > 0) {
    throw new Error(
      `住所・届け先が明細に入っている: ${addressItems.map((i) => i.item_name_raw).join(', ')}`
    );
  }
});

test('「レジデンス２８」が item_name_raw に入っていない（現場名は明細ではない）', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  const siteAsItem = items.filter((i) => i.item_name_raw?.includes('レジデンス２８'));
  assertEqual(siteAsItem.length, 0, 'レジデンス２８は明細行であってはならない');
});

test('「貴社入れ」行が明細に入っていない', () => {
  const items = detectLineItems(KAKEN_SAMPLE_TEXT);
  const kirenItem = items.filter((i) => i.item_name_raw?.includes('貴社入れ'));
  assertEqual(kirenItem.length, 0, '貴社入れは明細行であってはならない');
});

// ============================================================
// 結果サマリー
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ 成功: ${passed}件 / ❌ 失敗: ${failed}件`);
if (failed > 0) process.exit(1);
