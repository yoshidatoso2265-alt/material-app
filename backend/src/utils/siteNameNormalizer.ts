/**
 * 現場名正規化ユーティリティ
 *
 * 設計方針:
 *   - 純関数で実装（副作用なし・テスト容易）
 *   - このファイルに正規化ルールを集約する（分散させない）
 *   - ルールが変わった場合はこのファイルのみを変更する
 *
 * 正規化ルール（適用順序が重要）:
 *   1. 全角英数字→半角
 *   2. 全角スペース→半角スペース
 *   3. 法人格（前置き）を除去: 株式会社〇〇 → 〇〇
 *   4. 法人格（後置き）・略称を除去: 〇〇株式会社 / 〇〇（株） → 〇〇
 *   5. 敬称を除去（長い順）: 様邸 > 様 > さん > 氏 > 先生 > 御中
 *   6. 場所接尾語を除去（長い順）: 邸 > 宅 > 家
 *   7. 記号・特殊文字を除去
 *   8. 空白を除去してトリム
 *
 * 例:
 *   「田中様邸」     → 「田中」
 *   「田中様」       → 「田中」
 *   「田中邸」       → 「田中」
 *   「株式会社田中建設」 → 「田中建設」
 *   「田中建設（株）」   → 「田中建設」
 *   「山田 太郎様」  → 「山田太郎」（空白も除去）
 */

// ルール定義（将来の変更をここに集約）
const CORP_PREFIXES = [
  '株式会社',
  '有限会社',
  '合同会社',
  '一般社団法人',
  '特定非営利活動法人',
  'NPO法人',
];

const CORP_SUFFIXES_AND_ABBREV = [
  '株式会社',
  '有限会社',
  '合同会社',
  '（株）',
  '（有）',
  '(株)',
  '(有)',
];

// 長い順に並べることで「様邸」が「様」より先にマッチする
const HONORIFICS = ['様邸', '様', 'さん', '氏', '先生', '御中'];

// 長い順に並べる
const LOCATION_SUFFIXES = ['邸', '宅', '家'];

const SYMBOL_PATTERN = /[「」『』【】〔〕（）()。、・～ー―〜＝＋－×÷]/g;

/**
 * 全角英数字・記号を半角に変換する
 */
function toHalfWidth(str: string): string {
  return str
    .replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' '); // 全角スペース → 半角
}

/**
 * 現場名を正規化する（比較・類似度計算の主入力）
 *
 * @param name 元の現場名（CSV上の生文字列 or 管理者入力）
 * @returns 正規化済み文字列（空の場合は空文字を返す）
 */
export function normalizeSiteName(name: string): string {
  if (!name || name.trim() === '') return '';

  let result = name;

  // Step 1: 全角→半角
  result = toHalfWidth(result);

  // Step 2: 法人格（前置き）除去
  for (const prefix of CORP_PREFIXES) {
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length);
      break; // 1つだけマッチ（二重除去防止）
    }
  }

  // Step 3: 法人格（後置き・略称）除去
  for (const suffix of CORP_SUFFIXES_AND_ABBREV) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }

  // Step 4: 敬称除去（長い順）
  for (const honorific of HONORIFICS) {
    if (result.endsWith(honorific)) {
      result = result.slice(0, -honorific.length);
      break;
    }
  }

  // Step 5: 場所接尾語除去（長い順）
  for (const suffix of LOCATION_SUFFIXES) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }

  // Step 6: 記号除去
  result = result.replace(SYMBOL_PATTERN, '');

  // Step 7: 空白をすべて除去してトリム
  result = result.replace(/\s+/g, '').trim();

  return result;
}

/**
 * 2つの正規化済み現場名の完全一致を確認する
 * （大文字小文字を区別しない）
 */
export function isExactMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
