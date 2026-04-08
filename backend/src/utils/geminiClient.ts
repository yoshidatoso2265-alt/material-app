/**
 * Gemini API クライアント
 *
 * 役割分担:
 *   - normalizeSiteNames(): グリッドの現場名リストを一括正規化（表記ゆれ統一）
 *   - extractMaterialsFromPdf(): PDFから資材明細・金額のみ抽出（現場名・担当者は取らない）
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function callGeminiWithRetry(
  contents: Parameters<ReturnType<typeof genai.getGenerativeModel>['generateContent']>[0],
): Promise<string> {
  const models = [MODEL, FALLBACK_MODEL];
  for (const modelName of models) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const model = genai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(contents);
        return result.response.text();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('high demand');
        const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
        if ((is503 || is429) && attempt < MAX_RETRIES) {
          logger.warn(`Gemini ${modelName} リトライ ${attempt}/${MAX_RETRIES}: ${msg.slice(0, 100)}`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        if (is503 || is429) {
          logger.warn(`Gemini ${modelName} 全リトライ失敗、次のモデルへ`);
          break;
        }
        throw err;
      }
    }
  }
  throw new Error('Gemini API: 全モデル・全リトライが失敗しました');
}

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

export interface GeminiPdfResult {
  delivery_date: string | null;
  total_amount_ex_tax: number | null;
  total_tax: number | null;
  total_amount_in_tax: number | null;
  materials: GeminiMaterial[];
  confidence: number;
  warnings: string[];
}

// 後方互換用（既存コードが参照している場合）
export interface GeminiDeliverySlip extends GeminiPdfResult {
  site_name: string | null;
  orderer_name: string | null;
  person_name: string | null;
}

// ============================================================
// 1. グリッド現場名の一括正規化
// ============================================================

/**
 * グリッドの現場名リストをGeminiで一括正規化する
 * - 表記ゆれ統一（国立第七小学校/国立7小 → 統一名）
 * - 会社宛て変換（御社入れ/会社入れ/貴社入れ/彩り → 株式会社吉田）
 * @returns 入力名→正規化名のマッピング
 */
export async function normalizeSiteNames(siteNames: string[]): Promise<Record<string, string>> {
  if (!process.env.GEMINI_API_KEY || siteNames.length === 0) return {};

  const uniqueNames = [...new Set(siteNames.filter(n => n.trim()))];
  if (uniqueNames.length === 0) return {};

  const prompt = `あなたは塗装会社の現場名を正規化するシステムです。
以下の現場名リストを正規化してください。

【ルール】
1. 同じ現場を指す表記ゆれを統一する（例: 「国立第七小学校」「国立7小」「国立七小」→ 一番正式な名称に統一）
2. 以下のキーワードは「株式会社吉田」に変換する:
   - 「彩り」「いろどり」「彩り工房」
   - 「御社入れ」「貴社入れ」「会社入れ」「記者入れ」
   - 「株式会社吉田」はそのまま
3. 上記以外の現場名はそのまま返す（勝手に変換しない）
4. 空文字やnullは除外

必ず以下のJSON形式のみで返してください（説明文不要）:
{
  "元の名前1": "正規化後の名前1",
  "元の名前2": "正規化後の名前2"
}

--- 現場名リスト ---
${uniqueNames.map(n => `- ${n}`).join('\n')}`;

  try {
    const text = await callGeminiWithRetry(prompt);
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ??
                      text.match(/```\s*([\s\S]*?)\s*```/) ??
                      text.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text.trim();
    const mapping = JSON.parse(jsonStr) as Record<string, string>;
    logger.info(`現場名正規化: ${uniqueNames.length}件 → ${Object.keys(mapping).length}件マッピング`);
    return mapping;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`現場名正規化エラー: ${msg}`);
    return {};
  }
}

// ============================================================
// 2. PDF資材明細の抽出（現場名・担当者は取らない）
// ============================================================

/**
 * PDFバイナリを直接Geminiに投げて資材明細・金額を抽出する
 * 現場名・担当者はグリッドから取得するのでここでは抽出しない
 */
export async function extractMaterialsFromPdf(pdfBuffer: Buffer): Promise<GeminiPdfResult> {
  if (!process.env.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY が未設定のためGemini抽出をスキップします');
    return emptyPdfResult(['GEMINI_API_KEY が未設定です']);
  }

  const prompt = `あなたは塗装会社の材料費管理システムです。
添付の化研マテリアル（塗料・建材の専門商社）の納品書PDFを読み取って、資材明細と金額を抽出してください。
必ず以下のJSON形式のみで返してください（説明文・コードブロック不要）。

{
  "delivery_date": "YYYY-MM-DD形式（見つからない場合はnull）",
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
  "warnings": ["注意事項があれば記載"]
}

【materialsの抽出（最重要：PDFの表を正確に読むこと）】
PDFに記載されている商品テーブルの全行を1つ残らず抽出すること。
品名・規格・数量・単位・単価・金額 の各列を正確に読み取ること。
半角カタカナは全角に変換。規格・色番号・容量はspecに分離。

含めるもの: 塗料、副材、運賃、配送料、値引き
含めないもの: 帳票見出し、会社名、住所、伝票番号

【その他】
- 金額は数値のみ（カンマ・円マーク不要）
- 日付はYYYY-MM-DD形式
- 令和xx年 → 西暦に変換（令和1年=2019年）
- materialsが空の場合は空配列 [] を返すこと`;

  try {
    const text = await callGeminiWithRetry([
      prompt,
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBuffer.toString('base64'),
        },
      },
    ]);
    return parsePdfResponse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Gemini PDF解析エラー: ${msg}`);
    return emptyPdfResult([`Gemini PDF解析エラー: ${msg}`]);
  }
}

// ============================================================
// 後方互換: 既存コードが使っている関数（非推奨）
// ============================================================

export async function extractDeliverySlip(_pdfText: string, _knownSiteNames?: string[]): Promise<GeminiDeliverySlip> {
  return { ...emptyPdfResult(['extractDeliverySlip は廃止されました']), site_name: null, orderer_name: null, person_name: null };
}

export async function extractDeliverySlipFromPdf(pdfBuffer: Buffer, _knownSiteNames?: string[]): Promise<GeminiDeliverySlip> {
  const result = await extractMaterialsFromPdf(pdfBuffer);
  return { ...result, site_name: null, orderer_name: null, person_name: null };
}

// ============================================================
// レスポンス解析
// ============================================================

function parsePdfResponse(text: string): GeminiPdfResult {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ??
                    text.match(/```\s*([\s\S]*?)\s*```/) ??
                    text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text.trim();

  try {
    const raw = JSON.parse(jsonStr);
    return {
      delivery_date: normalizeDate(raw.delivery_date),
      total_amount_ex_tax: toNumber(raw.total_amount_ex_tax),
      total_tax: toNumber(raw.total_tax),
      total_amount_in_tax: toNumber(raw.total_amount_in_tax),
      materials: parseMaterials(raw.materials),
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    };
  } catch (err) {
    logger.error(`Geminiレスポンスのパース失敗: ${text.slice(0, 200)}`);
    return emptyPdfResult(['GeminiレスポンスのJSONパースに失敗しました']);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  return null;
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function emptyPdfResult(warnings: string[]): GeminiPdfResult {
  return {
    delivery_date: null,
    total_amount_ex_tax: null,
    total_tax: null,
    total_amount_in_tax: null,
    materials: [],
    confidence: 0,
    warnings,
  };
}
