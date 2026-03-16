/**
 * 重複判定モジュール
 *
 * 判定ロジック:
 *   1. source_row_hash を計算
 *   2. DB（material_import_rows）に同一ハッシュが存在するか確認
 *   3. 存在する場合:
 *      - 論理削除済みの import に属する → 重複扱いしない（削除前は無効）
 *      - 有効な import に属する → is_duplicate=1, duplicate_of_id=既存ID
 *   4. 存在しない場合: is_duplicate=0（通常取込）
 *
 * UNIQUE制約を使わない理由:
 *   - 重複を記録し続けることで「どの取込で重複したか」を追跡可能にする
 *   - 論理削除した取込のデータを「なかったこと」にして再取込できる
 */

import Database from 'better-sqlite3';
import { generateSourceRowHash, HashableRow } from '../../../utils/hashRow';

export interface DuplicateCheckResult {
  sourceRowHash: string;
  isDuplicate: boolean;
  duplicateOfId: number | null; // 重複元の material_import_rows.id
}

/**
 * 1行分の重複チェック
 *
 * @param db      better-sqlite3 インスタンス
 * @param row     ハッシュ対象のフィールド
 * @returns       DuplicateCheckResult
 */
export function checkDuplicate(
  db: Database.Database,
  row: HashableRow
): DuplicateCheckResult {
  const hash = generateSourceRowHash(row);

  // 有効な import に属する同一ハッシュを検索
  // （deleted_at IS NULL の import のみ対象）
  const existing = db
    .prepare(
      `SELECT r.id
       FROM material_import_rows r
       JOIN material_imports mi ON mi.id = r.import_id
       WHERE r.source_row_hash = ?
         AND mi.deleted_at IS NULL
       LIMIT 1`
    )
    .get(hash) as { id: number } | undefined;

  if (existing) {
    return {
      sourceRowHash: hash,
      isDuplicate: true,
      duplicateOfId: existing.id,
    };
  }

  return {
    sourceRowHash: hash,
    isDuplicate: false,
    duplicateOfId: null,
  };
}
