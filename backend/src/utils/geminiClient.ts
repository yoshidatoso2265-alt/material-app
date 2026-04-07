/**
 * Gemini API クライアント
 * 納品書PDFテキストから構造化データを抽出する
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

// ============================================================
// 型定義
// ============================================================

export interface GeminiMaterial {
  name: string;
  spec: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
}

export interface GeminiDeliverySlip {
  site_name: string | null;
  delivery_date: string | null;     // YYYY-MM-DD
  orderer_name: string | null;
  person_name: string | null;
  total_amount_ex_tax: number | null;
  total_tax: number | null;
  total_amount_in_tax: number | null;
  materials: GeminiMaterial[];
  confidence: number;               // 0.0〜1.0
  warnings: string[];
}

// ============================================================
// メイン関数
// ============================================================

/**
 * PDFテキストから納品書情報を抽出する
 * 現場名・資材名・金額をGeminiで構造化して返す
 * @param knownSiteNames 過去1ヶ月以内の既存現場名リスト（届け先マッチングに使用）
 */
export async function extractDeliverySlip(pdfText: string, knownSiteNames?: string[]): Promise<GeminiDeliverySlip> {
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY が未設定のためGemini抽出をスキップします');
    return emptyResult(['GEMINI_API_KEY が未設定です']);
  }

  const prompt = buildPrompt(pdfText, knownSiteNames);

  try {
    const model = genai.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return parseGeminiResponse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Gemini API エラー: ${msg}`);
    return emptyResult([`Gemini API エラー: ${msg}`]);
  }
}

// ============================================================
// プロンプト生成
// ============================================================

function buildPrompt(pdfText: string, knownSiteNames?: string[]): string {
  const siteHint = knownSiteNames && knownSiteNames.length > 0
    ? `\n【過去1ヶ月以内の既存現場名リスト（届け先マッチング用）】\n${knownSiteNames.map(s => `- ${s}`).join('\n')}\nお届け先がこのリストの現場名と同一または非常に似ている場合は、リスト内の現場名をそのまま site_name に使うこと。\n`
    : '';
  return `あなたは塗装会社の材料費管理システムです。
以下は化研マテリアル（塗料・建材の専門商社）の納品書PDFから抽出したテキストです。
このテキストから情報を抽出して、必ず以下のJSON形式のみで返してください（説明文・コードブロック不要）。

{
  "site_name": "現場名（見つからない場合はnull）",
  "delivery_date": "YYYY-MM-DD形式（見つからない場合はnull）",
  "orderer_name": "発注者名（見つからない場合はnull）",
  "person_name": "担当者名（見つからない場合はnull）",
  "total_amount_ex_tax": 税抜合計金額（数値、見つからない場合はnull）,
  "total_tax": 消費税額（数値、見つからない場合はnull）,
  "total_amount_in_tax": 税込合計金額（数値、見つからない場合はnull）,
  "materials": [
    {
      "name": "資材名",
      "spec": "規格・品番（なければnull）",
      "quantity": 数量（数値、なければnull）,
      "unit": "単位（缶/本/枚/kg等、なければnull）",
      "unit_price": 単価（数値、なければnull）,
      "amount": 金額（数値、なければnull）
    }
  ],
  "confidence": 抽出の信頼度（0.0〜1.0）,
  "warnings": ["抽出できなかった項目や注意事項があれば記載"]
}

【現場名の見つけ方（重要）】
化研マテリアル納品書には次のパターンで現場名が記載されています：
1. 「貴社入れ」「御社入れ」「会社入れ」「彩り」の直後の行に「現場名 金額 消費税 合計」の形式で記載される
   例: 「貴社入れ\nレジデンス２８ 6,850 685 7,535」→ site_name = "レジデンス２８"
   ※末尾の数値（金額）は現場名ではないので除外すること
2. 「現場名:」「工事名:」「物件名:」などのラベルの後
3. グリッドの「現場名」列（siteName）
4. 上記1〜3で現場名が見つからない場合は「お届け先」「納品先」「配送先」に記載された宛先をそのまま現場名として使用すること
   例: 「お届け先: 吉田塗装 国立学園マンション」→ site_name = "国立学園マンション"（会社名を除いた建物・物件名）
   建物名がなく会社名や個人名だけの場合はその名前をそのまま site_name にすること
- 現場名は建物名・マンション名・工事名（例：○○マンション、△△様邸、□□改修工事）
- 発注者名（吉田様など個人名）・担当者名・会社名・住所と混同しないこと
- パターン1〜4を全て試してどうしても特定できない場合のみnullにすること

【現場名の特殊変換ルール（必須）】
以下のキーワードが現場名として抽出された場合は「株式会社吉田」に変換すること：
- 「彩り」「いろどり」→ site_name = "株式会社吉田"
- 「御社入れ」「貴社入れ」「会社入れ」「記者入れ」→ site_name = "株式会社吉田"
- これらは自社（株式会社吉田）宛ての納品なので現場名ではなく会社名に変換する

【materialsの品名正規化ルール（重要）】
- PDFのOCRで文字間にスペースが入ることがある。自然な商品名に修正すること
  例: 「運 賃」→「運賃」、「小 口 割 増 運 賃」→「小口割増運賃」
- 半角カタカナは必ず全角カタカナに変換すること（例: ｴｽｹｰﾌﾟﾚﾐｱﾑNADｼﾘｺﾝ → エスケープレミアムNADシリコン）
- 規格・色番号・容量（例: 淡彩 17-70H 4KG）はspecに分離すること

【materialsの抽出方法（重要：必ず全件抽出すること）】
化研マテリアルの納品書PDFには以下の形式で商品が並んでいる：
  品名 | 規格 | 数量 | 単位 | 単価 | 金額
すべての行を1つ残らずmaterialsに含めること。1件も漏らさないこと。
OCRテキストが崩れていても、数量・単価・金額のある行は必ず資材として抽出すること。

【materialsに含めるもの】
- 塗料（シリコン・ウレタン・フッ素・無機・弾性・下塗り材・プライマー等）
- 副材（シーリング材・マスキングテープ・養生シート・ローラー・刷毛等）
- 運賃・配送料・割増料金（nameに「運賃」「小口割増運賃」等と正規化して記載）
- 値引き・割引（nameに「値引き」と記載、amountはマイナス値で記載）

【materialsに含めないもの】
- 「御社」「貴社」「以下の通り」「納品書」「合計」「税」等の帳票の見出し・ラベル
- 会社名・住所・電話番号・担当者名
- 「納品書No.」「伝票番号」等の番号項目
- 数量も単価も金額も全てnullになるような文字列は除外

【その他の注意事項】
- 担当者名は「株式会社吉田 首都１部１Ｔ 手代木寛之」形式の場合、末尾の人名（手代木寛之）
- 金額は数値のみ（カンマ・円マーク不要）
- 日付は必ずYYYY-MM-DD形式に変換
- 令和xx年 → 西暦に変換（令和1年=2019年）
- materialsが空の場合は空配列 [] を返すこと
- 全項目が正確に取れた場合 confidence=0.9以上、一部不明な場合 0.6〜0.8、大部分不明な場合 0.3以下

${siteHint}
--- 以下 PDFテキスト ---
${pdfText.slice(0, 15000)}`;
}

// ============================================================
// レスポンス解析
// ============================================================

function parseGeminiResponse(text: string): GeminiDeliverySlip {
  // JSONブロックを抽出（```json ... ``` に囲まれている場合に対応）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ??
                    text.match(/```\s*([\s\S]*?)\s*```/) ??
                    text.match(/(\{[\s\S]*\})/);

  const jsonStr = jsonMatch ? jsonMatch[1] : text.trim();

  try {
    const raw = JSON.parse(jsonStr);
    return {
      site_name: raw.site_name ?? null,
      delivery_date: normalizeDate(raw.delivery_date),
      orderer_name: raw.orderer_name ?? null,
      person_name: raw.person_name ?? null,
      total_amount_ex_tax: toNumber(raw.total_amount_ex_tax),
      total_tax: toNumber(raw.total_tax),
      total_amount_in_tax: toNumber(raw.total_amount_in_tax),
      materials: parseMaterials(raw.materials),
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    };
  } catch (err) {
    logger.error(`Geminiレスポンスのパース失敗: ${text.slice(0, 200)}`);
    return emptyResult(['GeminiレスポンスのJSONパースに失敗しました']);
  }
}

function parseMaterials(raw: unknown): GeminiMaterial[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      name: String(item.name ?? ''),
      spec: item.spec ? String(item.spec) : null,
      quantity: toNumber(item.quantity),
      unit: item.unit ? String(item.unit) : null,
      unit_price: toNumber(item.unit_price),
      amount: toNumber(item.amount),
    }))
    .filter((m) => m.name.length > 0);
}

function normalizeDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  // すでにYYYY-MM-DD形式
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD → YYYY-MM-DD
  const slash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  return null;
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function emptyResult(warnings: string[]): GeminiDeliverySlip {
  return {
    site_name: null,
    delivery_date: null,
    orderer_name: null,
    person_name: null,
    total_amount_ex_tax: null,
    total_tax: null,
    total_amount_in_tax: null,
    materials: [],
    confidence: 0,
    warnings,
  };
}
