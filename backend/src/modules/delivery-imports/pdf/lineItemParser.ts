/**
 * 納品書明細行解析
 *
 * 責務:
 *   - PDF全文テキストから明細行を抽出して構造化データに変換する
 *   - 運賃・小口割増などの付帯費用も明細として保持する
 *   - 材料名は原文のまま保持（統合・変換しない）
 *   - 数量・単価・金額が空でも行として保持（null 許容）
 *
 * 【化研マテリアル納品書の実際の構造】
 *   上部セクション（明細ではない）:
 *     品名・規格・容量 数量 単価 金額 消費税 合計  ← これはヘッダではない
 *     お届け先ブロック（〒 住所 電話番号）         ← 除外対象
 *     摘要ブロック                               ← 除外対象
 *
 *   商品テーブル（ここだけを明細として解析する）:
 *     商品名称 規格容量 数量 単位 単価 金額（税別）消費税額 金額（税込）  ← 明細開始マーカー
 *     ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ 淡彩 17-70H 4KG 1 ｶﾝ 5,800 5,800 580 6,380
 *     小口割増運賃 １〜３缶 1 ｼｷ 600 600 60 660
 *     運賃  1 ｼｷ 450 450 45 495
 *
 *   貴社入れブロック（現場名+合計 → slipParser が担当）:
 *     貴社入れ                                  ← 明細終了マーカー
 *     レジデンス２８ 6,850 685 7,535
 *
 *   合計行                                      ← 明細終了（fallback）
 */

// ============================================================
// 型定義
// ============================================================

export interface LineItem {
  line_no: number;
  item_name_raw?: string;           // 材料名（原文）
  spec_raw?: string;                // 規格容量
  quantity?: number;
  unit?: string;                    // 単位（ｶﾝ, ｼｷ 等）
  unit_price?: number;
  amount_ex_tax?: number;
  tax_amount?: number;
  amount_in_tax?: number;
  is_freight: boolean;              // 運賃フラグ
  is_misc_charge: boolean;          // 小口割増等フラグ
  raw_line_text: string;            // 元行テキスト（再解析用）
}

// ============================================================
// キーワード定義
// ============================================================

const FREIGHT_KEYWORDS = /運賃|配送料|送料|配達料/;
const MISC_CHARGE_KEYWORDS = /小口|割増|手数料|梱包料/;

/**
 * 明細テーブル開始を示すキーワード
 * 「商品名称」が含まれる行だけを開始マーカーとする。
 * 上部の「品名・規格・容量 数量 単価 金額 消費税 合計」には「商品名称」が含まれないため
 * 誤って明細開始と判定されることがない。
 */
const TABLE_HEADER_STRICT = /商品名称/;

/**
 * 明細テーブル終了: 「貴社入れ」行が来たら終了（この行自体は明細ではない）
 * 「レジデンス２８ 6,850 685 7,535」はこの後の行で、slipParser が現場名として使う。
 */
const TABLE_END_KIREN = /^貴社入れ/;

/**
 * 明細テーブル終了（fallback）: 合計・請求行
 */
const TABLE_END_FALLBACK = /^(?:合計|小計|税込合計|お支払|ご請求)[^0-9]*/;

/**
 * 明細として絶対に含めない行パターン（住所・届け先ブロック・顧客情報）
 */
const EXCLUDE_LINE_PATTERN = /〒|お届け先|FAX|ＦＡＸ|電話|ＴＥＬ|本社|摘要|品名.{0,5}規格|納品書|請求書|領収書|御[中様]/;
const PHONE_PATTERN = /\d{2,4}[-－]\d{3,4}[-－]\d{4}/;
const ADDRESS_LINE_PATTERN = /東京都|大阪府|神奈川県|埼玉県|千葉県|北海道|愛知県|[都道府県].*[市区町村]/;
/** 顧客コード行: "912625 吉田様" 形式 */
const CUSTOMER_CODE_PATTERN = /^\d{5,7}\s+\S+/;
/** 法人名行 */
const CORP_WORDS_PATTERN = /株式会社|有限会社|合同会社|一般社団法人/;
/** 合計・小計行（明細テーブル内に紛れ込む可能性のある行） */
const SUMMARY_LINE_PATTERN = /^(?:合計|小計|税込|税抜|消費税|ご請求|お支払|値引|割引)\s*[金額]?[\s　：:]/;

// ============================================================
// ユーティリティ
// ============================================================

/**
 * カンマ付き数値文字列を数値に変換
 */
function parseAmount(s: string): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[,，\s　]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

/**
 * 行の数値列（金額・数量・単価）を抽出する
 * ルール: スペース（半角・全角・タブ）で区切られた数値を抽出する。
 *         行頭・行末の数値も対象（lookbehind は行頭でも機能しないので行頭も対応）。
 * 規格コード内の数値（"17-70H" の17、"4KG" の4）は後続が英字のため除外される。
 */
function extractTrailingNumbers(line: string): number[] {
  const numbers: number[] = [];
  // 行頭 or スペース/タブの後、数値、スペース/タブ or 行末（後続が英字・アルファベットでない）
  const pattern = /(?:^|[ 　\t])([0-9][0-9,，]*(?:\.[0-9]+)?)(?=[ 　\t]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    const n = parseAmount(m[1]);
    if (n !== undefined && n >= 0) {
      numbers.push(n);
    }
  }
  // フォールバック: スペース区切りパターンで0件の場合は全数値を試みる
  if (numbers.length === 0) {
    const fallback = /([0-9][0-9,，]*)/g;
    while ((m = fallback.exec(line)) !== null) {
      const n = parseAmount(m[1]);
      if (n !== undefined && n >= 0) {
        numbers.push(n);
      }
    }
  }
  return numbers;
}

/**
 * 数量値とその後続テキストから単位を抽出する
 * 例: "...1 ｶﾝ 5,800..." → "ｶﾝ"
 * 化研PDFの単位はカタカナ（ｶﾝ=缶, ｼｷ=式）が多い。
 */
function extractUnit(line: string, quantity: number): string | undefined {
  const qtyStr = quantity.toString();
  // スペースで囲まれた数量の直後にある非数値テキストを単位とみなす
  const re = new RegExp(
    `(?:^|[\\s　])${qtyStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s　]+` +
    `([^\\s　0-9,，.．]{1,8})[\\s　]`
  );
  const m = line.match(re);
  if (!m) return undefined;
  const candidate = m[1].trim();
  // カタカナ・ひらがな・漢字のみ許可（英数字混在の規格コードは除外）
  if (/^[\uFF65-\uFF9Fｦ-ﾟ\u30A0-\u30FF\u3040-\u309F\u4E00-\u9FFF]{1,8}$/.test(candidate)) {
    return candidate;
  }
  return undefined;
}

/**
 * 行が住所・届け先ブロック・顧客情報行かどうか（明細として絶対に含めない）
 */
function isAddressOrDeliveryLine(line: string): boolean {
  if (EXCLUDE_LINE_PATTERN.test(line)) return true;
  if (PHONE_PATTERN.test(line)) return true;
  if (ADDRESS_LINE_PATTERN.test(line)) return true;
  if (CUSTOMER_CODE_PATTERN.test(line)) return true;  // "912625 吉田様" 形式
  if (CORP_WORDS_PATTERN.test(line)) return true;     // "株式会社吉田" 等
  return false;
}

/**
 * 行が明細テーブルの内容行かどうかを判定する
 */
function isDetailLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2) return false;
  if (isAddressOrDeliveryLine(trimmed)) return false;
  // テーブルヘッダ行自体（商品名称...）は除外（ただし運賃行は通す）
  if (TABLE_HEADER_STRICT.test(trimmed) && !FREIGHT_KEYWORDS.test(trimmed)) return false;
  if (TABLE_END_KIREN.test(trimmed)) return false;
  if (TABLE_END_FALLBACK.test(trimmed)) return false;
  // 明細テーブル内に紛れ込む合計・小計行を除外
  if (SUMMARY_LINE_PATTERN.test(trimmed)) return false;
  // 数字が1つも含まれない行で、かつ短すぎる行は除外
  if (!/[0-9]/.test(trimmed) && trimmed.length < 4) return false;
  return true;
}

// ============================================================
// 複数行商品名マージ
// ============================================================

/**
 * 「数値なし」の明細行を次の行の商品名プレフィックスとして結合する
 *
 * PDFのテキスト抽出では商品名が複数行に分割されることがある:
 *   行1: "ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ"  ← 数値なし（名前のみ）
 *   行2: "淡彩 17-70H 4KG\t1 ｶﾝ 5,800 5,800 580 6,380"  ← 数値あり
 * → マージ後: item_name_raw = "ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ 淡彩"
 */
function mergeMultilineNames(items: LineItem[]): LineItem[] {
  if (items.length === 0) return items;

  const result: LineItem[] = [];
  let pendingNamePrefix = '';

  for (const item of items) {
    const hasNumbers =
      item.quantity !== undefined ||
      item.unit_price !== undefined ||
      item.amount_ex_tax !== undefined ||
      item.amount_in_tax !== undefined;

    if (!hasNumbers && (item.item_name_raw?.length ?? 0) >= 2) {
      // 数値なしテキスト行 → 次の行の商品名プレフィックスとして蓄積
      const name = item.item_name_raw ?? '';
      pendingNamePrefix = pendingNamePrefix ? `${pendingNamePrefix} ${name}` : name;
      continue;
    }

    // 数値あり行: 蓄積済みプレフィックスを商品名に結合
    if (pendingNamePrefix) {
      const mergedName = item.item_name_raw
        ? `${pendingNamePrefix} ${item.item_name_raw}`
        : pendingNamePrefix;
      result.push({ ...item, item_name_raw: mergedName });
      pendingNamePrefix = '';
    } else {
      result.push(item);
    }
  }

  // 末尾に孤立した名前行が残った場合: 金額なし行として追加（運賃等の可能性）
  if (pendingNamePrefix) {
    const lastNo = result[result.length - 1]?.line_no ?? 0;
    result.push({
      line_no: lastNo + 1,
      item_name_raw: pendingNamePrefix,
      is_freight: FREIGHT_KEYWORDS.test(pendingNamePrefix),
      is_misc_charge: MISC_CHARGE_KEYWORDS.test(pendingNamePrefix),
      raw_line_text: pendingNamePrefix,
    });
  }

  // 行番号を再採番
  return result.map((item, idx) => ({ ...item, line_no: idx + 1 }));
}

// ============================================================
// メイン解析関数
// ============================================================

/**
 * PDF全文テキストから明細行を検出・構造化する
 */
export function detectLineItems(rawText: string): LineItem[] {
  const lines = rawText.split('\n');
  const items: LineItem[] = [];

  // ---- テーブル領域の特定 ----
  // 「商品名称」を含む行が明細テーブルの開始ヘッダ。
  // 上部の「品名・規格・容量 数量 単価 金額 消費税 合計」行は「商品名称」を含まないため除外される。
  let tableStart = -1;
  let tableEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (tableStart < 0 && TABLE_HEADER_STRICT.test(line)) {
      tableStart = i + 1; // ヘッダ行の次から開始
    }
    if (tableStart >= 0 && i > tableStart) {
      // 「貴社入れ」で終了（この行は現場名ブロックの開始）
      if (TABLE_END_KIREN.test(line)) {
        tableEnd = i;
        break;
      }
      // 合計行で終了（fallback）
      if (TABLE_END_FALLBACK.test(line)) {
        tableEnd = i;
        break;
      }
      // 顧客コード行（"912625 吉田様" 形式）で終了
      // 明細テーブルの後に顧客情報ブロックが始まる
      if (CUSTOMER_CODE_PATTERN.test(line)) {
        tableEnd = i;
        break;
      }
      // 法人名行で終了（"株式会社吉田" 等）
      if (CORP_WORDS_PATTERN.test(line) && !/運賃|小口|割増/.test(line)) {
        tableEnd = i;
        break;
      }
    }
  }

  // テーブル領域が特定できなかった場合: 全体を解析するが住所行は除外する
  const targetLines = tableStart >= 0 ? lines.slice(tableStart, tableEnd) : lines;

  // ---- 各行を解析 ----
  let lineNo = 1;

  for (const rawLine of targetLines) {
    const trimmed = rawLine.trim();
    if (!isDetailLine(trimmed)) continue;

    const isFreight = FREIGHT_KEYWORDS.test(trimmed);
    const isMisc = MISC_CHARGE_KEYWORDS.test(trimmed);

    // 材料名と規格の抽出
    // 化研PDF形式はタブ(\t)で「品名+規格部分」と「数値部分」が区切られる:
    //   "スチールペール空缶・バンド・蓋付 20L 60363 ｹ\t4 3,150.00 12,600 1,260 13,860"
    let item_name_raw: string | undefined;
    let spec_raw: string | undefined;
    let numbersPart: string;

    const tabIdx = rawLine.indexOf('\t');
    if (tabIdx >= 0) {
      // タブ区切りがある場合: 左=品名部分、右=数値部分
      const namePart = rawLine.slice(0, tabIdx).trim();
      numbersPart    = rawLine.slice(tabIdx + 1).trim();

      // 品名部分から材料名と規格を分離
      // ルール: 先頭から最初の純粋数値の手前までを材料名、残りを規格とする
      // 例: "スチールペール空缶・バンド・蓋付 20L 60363 ｹ"
      //   → item_name_raw = "スチールペール空缶・バンド・蓋付"
      //   → spec_raw = "20L 60363 ｹ"
      const nameSpecMatch = namePart.match(/^(.*?)(?:\s+(\d+.*))?$/);
      if (nameSpecMatch && nameSpecMatch[2]) {
        item_name_raw = nameSpecMatch[1].trim() || namePart;
        spec_raw      = nameSpecMatch[2].trim();
      } else {
        item_name_raw = namePart;
      }
    } else {
      numbersPart = trimmed;
      // タブなし: 従来の多空白・先頭テキスト分割
      const multiParts = trimmed.split(/\s{2,}/);
      if (multiParts.length >= 2) {
        item_name_raw = multiParts[0].trim() || undefined;
        const secondPart = multiParts[1].trim();
        if (secondPart && !/^[0-9,，]+$/.test(secondPart)) {
          spec_raw = secondPart;
        }
      } else {
        const itemNameMatch = trimmed.match(/^([\s\S]+?)(?=\s+[0-9０-９])/);
        item_name_raw = itemNameMatch ? itemNameMatch[1].trim() : trimmed;
      }
    }

    // 行の数値を抽出（タブ区切りがある場合は数値部分のみから抽出）
    const numbers = extractTrailingNumbers(numbersPart);

    // 数値の割り当て
    // 化研PDFの列: 数量 | 単位 | 単価 | 金額(税別) | 消費税額 | 金額(税込)
    let amount_ex_tax: number | undefined;
    let tax_amount: number | undefined;
    let amount_in_tax: number | undefined;
    let unit_price: number | undefined;
    let quantity: number | undefined;

    if (numbers.length >= 5) {
      // [数量, 単価, 金額(税別), 消費税額, 金額(税込)]
      quantity      = numbers[0];
      unit_price    = numbers[1];
      amount_ex_tax = numbers[2];
      tax_amount    = numbers[3];
      amount_in_tax = numbers[4];
    } else if (numbers.length === 4) {
      // [数量, 単価, 金額(税別), 消費税額] or [単価, 金額(税別), 消費税額, 金額(税込)]
      // 数量×単価≒金額(税別) で判別
      const [a, b, c, d] = numbers;
      const mulDiff = b > 0 ? Math.abs(a * b - c) : Infinity;
      const threshold = Math.max(1, c * 0.01);
      if (mulDiff <= threshold) {
        quantity      = a;
        unit_price    = b;
        amount_ex_tax = c;
        tax_amount    = d;
      } else {
        unit_price    = a;
        amount_ex_tax = b;
        tax_amount    = c;
        amount_in_tax = d;
      }
    } else if (numbers.length === 3) {
      // A: [税別金額, 消費税, 税込金額]  → a + b ≈ c
      // B: [数量, 単価, 税別金額]        → a × b ≈ c
      const [a, b, c] = numbers;
      const sumDiff = Math.abs(a + b - c);
      const mulDiff = b > 0 ? Math.abs(a * b - c) : Infinity;
      const threshold = Math.max(1, c * 0.01);
      if (mulDiff <= threshold && mulDiff <= sumDiff) {
        quantity      = a;
        unit_price    = b;
        amount_ex_tax = c;
      } else {
        amount_ex_tax = a;
        tax_amount    = b;
        amount_in_tax = c;
      }
    } else if (numbers.length === 2) {
      amount_ex_tax = numbers[0];
      tax_amount    = numbers[1];
    } else if (numbers.length === 1) {
      amount_ex_tax = numbers[0];
    }

    // 単位の抽出（数量が取れた場合のみ試みる）
    let unit: string | undefined;
    if (quantity !== undefined) {
      unit = extractUnit(trimmed, quantity);
    }

    // 有効な明細行かどうか判定
    const hasName   = item_name_raw && item_name_raw.length >= 2;
    const hasAmount = amount_ex_tax !== undefined || amount_in_tax !== undefined;
    if (!hasName && !hasAmount) continue;

    items.push({
      line_no: lineNo++,
      item_name_raw: item_name_raw || undefined,
      spec_raw,
      quantity,
      unit,
      unit_price,
      amount_ex_tax,
      tax_amount,
      amount_in_tax,
      is_freight: isFreight,
      is_misc_charge: isMisc,
      raw_line_text: trimmed,
    });
  }

  // 複数行に分割された商品名を結合する
  return mergeMultilineNames(items);
}
