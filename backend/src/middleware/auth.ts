import { Request, Response, NextFunction } from 'express';

/**
 * 認証ミドルウェア差し込み口
 *
 * MVP: 仮実装（スキップ）
 * Phase 6 以降: JWT検証 / セッション検証に差し替え
 *
 * 差し替え手順:
 *   1. このファイルの requireAuth を JWT検証に変更
 *   2. requireAdmin を管理者ロール判定に変更
 *   3. router 側のコードは変更不要（middleware の差し替えのみ）
 */

export function requireAuth(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  // TODO Phase 6: 認証実装
  // const token = req.headers.authorization?.replace('Bearer ', '');
  // if (!token) {
  //   res.status(401).json({ success: false, error: 'Unauthorized' });
  //   return;
  // }
  // try {
  //   const payload = verifyJwt(token);
  //   req.user = payload;
  //   next();
  // } catch {
  //   res.status(401).json({ success: false, error: 'Invalid token' });
  // }
  next();
}

/**
 * 管理者専用エンドポイント用ミドルウェア
 * 表記ゆれ承認・取込削除など、破壊的操作に付与する
 *
 * MVP: requireAuth と同一（将来分岐予定）
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // TODO Phase 6: 管理者ロール判定
  requireAuth(req, res, next);
}
