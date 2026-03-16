import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * async ルートハンドラのエラーを Express の next() に渡すラッパー
 * これを使うことで各コントローラで try/catch を書く必要がなくなる
 *
 * 使用例:
 *   router.get('/sites', asyncHandler(sitesController.list));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
