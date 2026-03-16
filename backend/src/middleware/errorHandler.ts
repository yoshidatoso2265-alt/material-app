import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Expressグローバルエラーハンドラー
 * asyncHandler でキャッチされたエラーをここで受け取る
 *
 * セキュリティ:
 *   - production では詳細エラーをクライアントに返さない
 *   - スタックトレースはログのみ（レスポンスに含めない）
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // next は Express の signature 上必須（使わなくてもパラメータが必要）
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isDev = process.env.NODE_ENV !== 'production';

  logger.error(`${req.method} ${req.path} → ${statusCode}`, {
    message: err.message,
    code: err.code,
    stack: isDev ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: err.message ?? 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
  });
}

/** ルートが見つからない場合の 404 ハンドラー */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

/** AppError ファクトリ */
export function createError(message: string, statusCode = 500, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
