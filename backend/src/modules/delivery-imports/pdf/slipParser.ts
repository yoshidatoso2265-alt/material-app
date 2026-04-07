/**
 * 納品書ヘッダ情報ルールベース解析
 *
 * 責務:
 *   - PDF全文テキストからヘッダ情報（納品日・発注者・現場名・担当者・合計）を抽出する
 *   - 各抽出関数は単体テスト可能な純関数で実装する
 *   - 住所・電話番号・法人名は現場名候補から除外する
 *   - AI補助は将来この層に差し込む（現状はルールベースのみ）
 *
 * 【化研マテリアル納品書の実際の構造】
 *   - 納品日: 上部の yyyy/mm/dd
 *   - ご発注者: "912625 榎本様" の「榎本様」（先行する顧客番号を除外して取る）
 *   - 担当者: "株式会社吉田 首都１部１Ｔ 手代木寛之" の末尾人名
 *   - 現場名: 「貴社入れ」の次行の名称部分
 *             例: "レジデンス２８ 6,850 685 7,535" → "レジデンス２８"
 *   - お届け先住所ブロックは不要データ。raw_site_name にも入れない。
 */

// ============================================================
// 型定義
// ============================================================

export interface ParsedSlip {
  delivery_date?: string;              // YYYY-MM-DD
  raw_orderer_name?: string;           // ご発注者
  raw_site_name?: string;              // 現場名最有力候補
  raw_site_name_candidates: string[];  // 現場名候補一覧（複数）
  raw_person_name?: string;            // 担当者
  total_amount_ex_tax?: number;
  total_tax?: number;
  total_amount_in_tax?: number;
  parse_confidence: number;            // 0.0〜1.0
  warnings: string[];
}

// ============================================================
// 住所・電話・法人名の除外パターン
// ============================================================

const ADDRESS_WORDS = /都|道|府|県|市|区|町|丁目|番地|番|号|〒|\d{3}-\d{4}/;
const PHONE_PATTERN = /\d{2,4}[-－]\d{3,4}[-－]\d{4}/;
const CORP_WORDS = /株式会社|有限会社|合同会社|一般社団法人|NPO法人|社団法人/;

/**
 * 現場名として使われない化研PDF専用の特殊ラベル
 * 「貴社入れ」= 顧客倉庫保管指定のラベル。現場名ではない。
 */
const KAKEN_NON_SITE_LABELS = /^(?:貴社入れ|貴社在庫|在庫|返品|見本|サンプル|テスト|試験|補修|確認品)$/;

/**
 * 現場名候補として不適切な文字列を除外する
 */
function isInvalidSiteCandidate(candidate: string): boolean {
  const s = candidate.trim();
  if (s.length < 2) return true;                  // 短すぎる
  if (s.length > 40) return true;                 // 長すぎる（住所全体など）
  if (ADDRESS_WORDS.test(s)) return true;          // 住所ワード
  if (PHONE_PATTERN.test(s)) return true;          // 電話番号
  if (CORP_WORDS.test(s)) return true;             // 法人名
  if (/^\d+$/.test(s)) return true;               // 数字のみ
  if (/^[a-zA-Z\d\s]+$/.test(s)) return true;     // 英数字のみ
  if (KAKEN_NON_SITE_LABELS.test(s)) return true; // 化研専用非現場ラベル
  return false;
}

/**
 * 行末の金額パターン（数値 数値 数値 など）を除去して現場名だけを取り出す
 * 例: "レジデンス２８ 6,850 685 7,535" → "レジデンス２８"
 */
function stripTrailingAmounts(line: string): string {
  // 末尾の「数値（カンマ付き可）が2〜3個続く」部分を削除
  return line
    .replace(/[\s　]+[0-9,，]+(?:[\s　]+[0-9,，]+){1,2}\s*$/, '')
    .trim();
}

// ============================================================
// 個別抽出関数（単体テスト可能）
// ============================================================

/**
 * 納品日を抽出する
 * @returns YYYY-MM-DD 形式 or undefined
 */
export function extractDeliveryDate(text: string): string | undefined {
  // パターン1: yyyy/mm/dd or yyyy-mm-dd
  const p1 = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (p1) {
    const y = p1[1], m = p1[2].padStart(2, '0'), d = p1[3].padStart(2, '0');
    if (parseInt(m) >= 1 && parseInt(m) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // パターン2: yyyy年mm月dd日
  const p2 = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (p2) {
    const y = p2[1], m = p2[2].padStart(2, '0'), d = p2[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // パターン3: 令和nn年mm月dd日
  const p3 = text.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (p3) {
    const reiwa = parseInt(p3[1]);
    const y = 2018 + reiwa;
    const m = p3[2].padStart(2, '0'), d = p3[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // パターン4: R nn.mm.dd
  const p4 = text.match(/R\s*(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{1,2})/);
  if (p4) {
    const reiwa = parseInt(p4[1]);
    const y = 2018 + reiwa;
    const m = p4[2].padStart(2, '0'), d = p4[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return undefined;
}

/**
 * 発注者名を抽出する
 * 化研PDF形式1: "ご発注者 912625 榎本様" → "榎本様"（先行する顧客番号を読み飛ばす）
 * 化研PDF形式2: "912625 吉田様" → "吉田様"（顧客コード単独行）
 */
export function extractOrderer(text: string): string | undefined {
  // 化研専用: 行頭が5〜7桁の顧客コード + スペース + 名前（様付き多い）
  // 例: "912625 吉田様"
  const kakenMatch = text.match(/^\d{5,7}\s+([^\s\n]{2,20})$/m);
  if (kakenMatch) {
    const val = kakenMatch[1].trim();
    // 〒や住所・電話はスキップ
    if (!val.startsWith('〒') && !ADDRESS_WORDS.test(val) && !PHONE_PATTERN.test(val)) {
      return val;
    }
  }

  const patterns = [
    // 化研形式: ご発注者 [数字+スペース]? 名前
    /ご?発注者[\s　：:]*(?:\d+[\s　]+)?([^\s\n　]{1,20})/,
    /注文者[\s　：:]*(?:\d+[\s　]+)?([^\s\n　]{1,20})/,
    /お客様[\s　：:]*(?:\d+[\s　]+)?([^\s\n　]{1,20})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const name = m[1].trim();
      // 数字のみ（顧客番号）はスキップ
      if (/^\d+$/.test(name)) continue;
      return name;
    }
  }
  return undefined;
}

/**
 * 担当者名を抽出する
 * パターン1: 「担当者:」「担当:」「ご担当:」ラベル付き
 * パターン2（化研PDF専用）: 「株式会社XXX 部署名 担当者名」形式の行末人名
 *   例: "株式会社吉田 首都１部１Ｔ 手代木寛之" → "手代木寛之"
 */
export function extractPersonName(text: string): string | undefined {
  // パターン1: ラベル付き（既存ロジック）
  const labelPatterns = [
    /担当者[\s　：:]*([^\s\n　]{2,15}(?:[\s　][^\s\n　]{1,8})?)\s*様?/,
    /担当[\s　：:]*([^\s\n　]{2,15}(?:[\s　][^\s\n　]{1,8})?)\s*様?/,
    /ご担当[\s　：:]*([^\s\n　]{2,15}(?:[\s　][^\s\n　]{1,8})?)\s*様?/,
  ];
  for (const p of labelPatterns) {
    const m = text.match(p);
    if (m) {
      const name = m[1].trim().replace(/様$/, '').trim();
      if (name.length >= 2 && !CORP_WORDS.test(name)) {
        return name;
      }
    }
  }

  // パターン2: 化研PDF専用 - 部署コード行の末尾にある人名を取る
  // "首都１部１Ｔ 手代木寛之" → "手代木寛之"（全角英数字コード + スペース + 漢字人名）
  // "株式会社吉田 首都１部１Ｔ 手代木寛之" → "手代木寛之"
  const DETAIL_HEADER_PATTERN = /商品名称|規格容量|金額.{0,5}税別|金額.{0,5}税込|消費税額|数量.{0,5}単価/;
  const lines2 = text.split('\n');
  for (const line of lines2) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;
    // 明細テーブルのヘッダ行は除外
    if (DETAIL_HEADER_PATTERN.test(trimmed)) continue;
    // 全角英数字・カタカナ等を含む行で末尾に漢字人名があるパターン
    // 対象: "首都１部１Ｔ 手代木寛之" のような行
    const fullWidthCodePattern = /[\uff01-\uff9f].*[\s　]([\u4E00-\u9FFF]{2,6})\s*$/;
    const mFW = trimmed.match(fullWidthCodePattern);
    if (mFW) {
      const name = mFW[1];
      if (!CORP_WORDS.test(name) && !/^(?:部長|課長|主任|本部|支店|入れ)/.test(name)) {
        return name;
      }
    }

    // 法人名を含む行の末尾漢字（"株式会社吉田 首都１部１Ｔ 手代木寛之" 形式）
    if (!CORP_WORDS.test(trimmed)) continue;
    if (trimmed.length < 5) continue;

    const lastKanjiToken = trimmed.match(/[\s　]([\u4E00-\u9FFF]{2,5})\s*$/);
    if (lastKanjiToken) {
      const name = lastKanjiToken[1];
      if (!CORP_WORDS.test(name) && !/^(?:株式|有限|会社|部長|課長|部門|本部|支店)/.test(name)) {
        return name;
      }
    }

    const lastTwoKanji = trimmed.match(/[\s　]([\u4E00-\u9FFF]{1,4})[\s　]([\u4E00-\u9FFF]{1,4})\s*$/);
    if (lastTwoKanji) {
      const name = lastTwoKanji[1] + ' ' + lastTwoKanji[2];
      return name;
    }
  }

  return undefined;
}

/**
 * 現場名候補を複数抽出する
 * 優先度の高い候補から順に並べて返す
 *
 * 優先順:
 *   1. 「貴社入れ」の次行から取る（化研PDF専用・最高優先度）
 *   2. 明示的な「現場名」「工事名」等ラベル
 *   3. 「摘要」「備考」付近のテキスト
 *   4. 発注者の後続行
 */
export function extractSiteNameCandidates(text: string): string[] {
  const candidates: Array<{ value: string; priority: number }> = [];

  // ---- 優先度18: 化研PDF専用「法人名の次行」ルール ----
  // "株式会社吉田\n国立第七小学校\n東京都..." → "国立第七小学校"が現場名
  const linesForCorp = text.split('\n');
  for (let i = 0; i < linesForCorp.length - 1; i++) {
    const line = linesForCorp[i].trim();
    if (!CORP_WORDS.test(line)) continue;
    const nextLine = linesForCorp[i + 1].trim();
    if (nextLine && !isInvalidSiteCandidate(nextLine)) {
      candidates.push({ value: nextLine, priority: 18 });
    }
  }

  // ---- 優先度20: 化研PDF専用「貴社入れ」ルール ----
  // 「貴社入れ」の次行が「現場名 金額 消費税 合計」形式になっている
  // 末尾の金額3数値を除去して現場名を取り出す
  const kirenMatch = text.match(/貴社入れ[^\n]*\n([^\n]+)/);
  if (kirenMatch) {
    const kirenLine = kirenMatch[1].trim();
    const siteName = stripTrailingAmounts(kirenLine);
    if (siteName && !isInvalidSiteCandidate(siteName)) {
      candidates.push({ value: siteName, priority: 20 });
    }
  }

  // ---- 優先度10: 明示的な「現場名」ラベル ----
  const p1Patterns = [
    /現場名[\s　：:]*([^\n]{2,30})/g,
    /現場[\s　：:]+([^\n]{2,30})/g,
    /工事名[\s　：:]*([^\n]{2,30})/g,
    /物件名[\s　：:]*([^\n]{2,30})/g,
    /建物名[\s　：:]*([^\n]{2,30})/g,
  ];
  for (const p of p1Patterns) {
    let m: RegExpExecArray | null;
    p.lastIndex = 0;
    while ((m = p.exec(text)) !== null) {
      const val = m[1].trim().replace(/[\s　]+$/, '');
      if (!isInvalidSiteCandidate(val)) {
        candidates.push({ value: val, priority: 10 });
      }
    }
  }

  // ---- 優先度7: 「摘要」「備考」付近のテキスト ----
  // 注意: 化研PDFの「摘要」欄は住所ブロック内にある可能性があるため低優先度
  const p2Patterns = [
    /摘要[\s　：:]*([^\n]{2,30})/g,
    /備考[\s　：:]*([^\n]{2,30})/g,
    /納入先[\s　：:]*([^\n]{2,30})/g,
  ];
  for (const p of p2Patterns) {
    let m: RegExpExecArray | null;
    p.lastIndex = 0;
    while ((m = p.exec(text)) !== null) {
      const val = m[1].trim();
      if (!isInvalidSiteCandidate(val)) {
        candidates.push({ value: val, priority: 7 });
      }
    }
  }

  // ---- 優先度5: 発注者の後続行 ----
  const ordererMatch = text.match(/ご?発注者[\s　：:]*[^\n]+\n([^\n]{3,30})/);
  if (ordererMatch) {
    const val = ordererMatch[1].trim();
    if (!isInvalidSiteCandidate(val)) {
      candidates.push({ value: val, priority: 5 });
    }
  }

  // 重複を除去して優先度降順に並べる
  const seen = new Set<string>();
  const result: string[] = [];
  const sorted = candidates.sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    const normalized = c.value.trim();
    if (!seen.has(normalized) && normalized.length > 0) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result.slice(0, 5); // 最大5候補
}

/**
 * 合計金額を抽出する
 */
export function extractTotals(text: string): {
  ex_tax?: number;
  tax?: number;
  in_tax?: number;
} {
  const result: { ex_tax?: number; tax?: number; in_tax?: number } = {};

  const parseAmount = (s: string): number => parseFloat(s.replace(/,/g, '').replace(/，/g, ''));

  // 化研形式: "合計 税別金額 消費税 税込金額" の3数値を一行から一括取得
  // 例: "合計 6,850 685 7,535" → ex_tax=6850, tax=685, in_tax=7535
  const multiTotalLine = text.match(/^合計\s+([0-9,，]+)\s+([0-9,，]+)\s+([0-9,，]+)\s*$/m);
  if (multiTotalLine) {
    result.ex_tax = parseAmount(multiTotalLine[1]);
    result.tax    = parseAmount(multiTotalLine[2]);
    result.in_tax = parseAmount(multiTotalLine[3]);
    return result; // 3数値が揃っているので早期リターン
  }

  // 税込合計
  const inTaxPatterns = [
    /合計[（(]?税込[）)]?[\s　：:]*([0-9,，]+)/,
    /税込合計[\s　：:]*([0-9,，]+)/,
    /お支払金額[\s　：:]*([0-9,，]+)/,
    /ご請求金額[\s　：:]*([0-9,，]+)/,
    /合計[\s　：:]*([0-9,，]+)(?!.*合計)/s, // 最後の合計
  ];
  for (const p of inTaxPatterns) {
    const m = text.match(p);
    if (m) {
      result.in_tax = parseAmount(m[1]);
      break;
    }
  }

  // 税抜合計
  const exTaxPatterns = [
    /小計[（(]?税別[）)]?[\s　：:]*([0-9,，]+)/,
    /税別合計[\s　：:]*([0-9,，]+)/,
    /税抜合計[\s　：:]*([0-9,，]+)/,
    /小計[\s　：:]*([0-9,，]+)/,
  ];
  for (const p of exTaxPatterns) {
    const m = text.match(p);
    if (m) {
      result.ex_tax = parseAmount(m[1]);
      break;
    }
  }

  // 消費税
  // NOTE: (?:\d+%)? で「10%」のような税率表記のみオプション一致させる。
  const taxPatterns = [
    /消費税[\s　（(]?(?:\d+%)?[）)]?[\s　：:]*([0-9,，]+)/,
    /税額[\s　：:]*([0-9,，]+)/,
    /内税[\s　：:]*([0-9,，]+)/,
  ];
  for (const p of taxPatterns) {
    const m = text.match(p);
    if (m) {
      result.tax = parseAmount(m[1]);
      break;
    }
  }

  // 税込合計が不明でも税抜+税から計算できる場合
  if (!result.in_tax && result.ex_tax !== undefined && result.tax !== undefined) {
    result.in_tax = result.ex_tax + result.tax;
  }

  // フォールバック: 「合計」ラベルなしで "税別 消費税 税込" の3数値が並ぶ行
  // 化研PDF形式: "12,600 1,260 13,860" (行全体が3数値のみ)
  // 条件: まだどの値も取れていない場合のみ試みる
  if (!result.in_tax && !result.ex_tax) {
    const trailingAmountLines = text.match(/^(\d{1,3}(?:,\d{3})+)\s+(\d{1,3}(?:,\d{3})+)\s+(\d{1,3}(?:,\d{3})+)\s*$/m);
    if (trailingAmountLines) {
      const v1 = parseAmount(trailingAmountLines[1]);
      const v2 = parseAmount(trailingAmountLines[2]);
      const v3 = parseAmount(trailingAmountLines[3]);
      // 税別 + 消費税 ≈ 税込 で判別
      if (Math.abs(v1 + v2 - v3) < Math.max(1, v3 * 0.02)) {
        result.ex_tax = v1;
        result.tax    = v2;
        result.in_tax = v3;
      } else {
        // 降順ソート → 最大=税込、次=税別、最小=消費税
        const sorted = [v1, v2, v3].sort((a, b) => b - a);
        result.in_tax = sorted[0];
        result.ex_tax = sorted[1];
        result.tax    = sorted[2];
      }
    }
  }

  return result;
}

// ============================================================
// メイン解析関数
// ============================================================

/**
 * PDF全文テキストから納品書ヘッダ情報を解析する
 */
export function parseDeliverySlip(rawText: string): ParsedSlip {
  const warnings: string[] = [];

  // --- 各情報の抽出 ---
  const delivery_date    = extractDeliveryDate(rawText);
  const raw_orderer_name = extractOrderer(rawText);
  const raw_person_name  = extractPersonName(rawText);
  const siteCandidates   = extractSiteNameCandidates(rawText);
  const totals           = extractTotals(rawText);

  // --- 現場名候補の選定 ---
  const raw_site_name = siteCandidates.length > 0 ? siteCandidates[0] : undefined;

  // --- 警告生成 ---
  if (!delivery_date)   warnings.push('納品日が抽出できませんでした');
  if (!raw_site_name)   warnings.push('現場名が抽出できませんでした');
  if (!raw_person_name) warnings.push('担当者名が抽出できませんでした');
  if (!totals.in_tax && !totals.ex_tax) warnings.push('合計金額が抽出できませんでした');
  if (siteCandidates.length > 1) {
    warnings.push(`現場名候補が複数あります（${siteCandidates.length}件）`);
  }

  // --- 信頼度スコア算出 ---
  let score = 0;
  if (delivery_date)   score++;
  if (raw_orderer_name) score++;
  if (raw_site_name)   score++;
  if (raw_person_name) score++;
  if (totals.in_tax || totals.ex_tax) score++;
  const parse_confidence = parseFloat((score / 5).toFixed(2));

  return {
    delivery_date,
    raw_orderer_name,
    raw_site_name,
    raw_site_name_candidates: siteCandidates,
    raw_person_name,
    total_amount_ex_tax: totals.ex_tax,
    total_tax: totals.tax,
    total_amount_in_tax: totals.in_tax,
    parse_confidence,
    warnings,
  };
}
