/**
 * 現場名類似度マッチング
 *
 * 設計方針:
 *   - normalized_alias（正規化済み）を主入力として比較する
 *   - alias_name（生文字列）は表示・監査用として使用するのみ
 *   - 完全一致は isExactMatch() で判定（このモジュールは類似度のみ担当）
 *   - 将来より精度の高いアルゴリズム（N-gram等）に差し替えやすいよう分離
 *
 * 類似度スコアの解釈:
 *   1.0        : 完全一致（auto 紐づけ対象）
 *   0.7 〜 0.99: 類似あり（pending で管理者確認候補）
 *   0.0 〜 0.69: 類似なし（候補として出さない）
 *
 * 安全設計:
 *   - 完全一致（score=1.0）以外は自動統合しない
 *   - 管理者確認（AliasReviewPage）を経て site_id を確定する
 */

export interface SiteMatchCandidate {
  siteId: number;
  siteName: string;
  normalizedName: string;
  score: number; // 0.0〜1.0
}

/**
 * Levenshtein 編集距離を計算する
 * 計算量: O(m*n) / m,n は文字列長
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // 空文字列の特殊ケース
  if (m === 0) return n;
  if (n === 0) return m;

  // DP テーブル（メモリ最適化: 2行だけ保持）
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // 削除
        curr[j - 1] + 1,  // 挿入
        prev[j - 1] + cost // 置換
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * 2つの正規化済み文字列の類似度スコアを返す (0.0〜1.0)
 *
 * @param a 正規化済み文字列 A（normalized_alias）
 * @param b 正規化済み文字列 B（sites.normalized_name）
 */
export function calcSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return parseFloat((1 - dist / maxLen).toFixed(4));
}

/** 類似候補として提示するスコアの閾値 */
export const SIMILARITY_THRESHOLD = 0.7;

/** 完全一致と見なすスコア（auto 紐づけ対象） */
export const EXACT_MATCH_SCORE = 1.0;

/**
 * 候補サイト一覧の中から類似度が高いものを返す
 *
 * @param targetNormalized 比較対象の正規化済み現場名
 * @param candidates       既存 sites の {siteId, siteName, normalizedName} 配列
 * @returns スコアが SIMILARITY_THRESHOLD 以上の候補（スコア降順）
 */
export function findSimilarSites(
  targetNormalized: string,
  candidates: Array<{ siteId: number; siteName: string; normalizedName: string }>
): SiteMatchCandidate[] {
  const results: SiteMatchCandidate[] = [];

  for (const candidate of candidates) {
    const score = calcSimilarity(targetNormalized, candidate.normalizedName);
    if (score >= SIMILARITY_THRESHOLD) {
      results.push({
        siteId: candidate.siteId,
        siteName: candidate.siteName,
        normalizedName: candidate.normalizedName,
        score,
      });
    }
  }

  // スコア降順でソート
  return results.sort((a, b) => b.score - a.score);
}
