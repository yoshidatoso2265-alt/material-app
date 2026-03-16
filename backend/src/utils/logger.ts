/**
 * ロガー
 *
 * セキュリティ原則:
 *   - パスワード・APIキー等の機密情報をログに出力しない
 *   - maskSensitive() で KAKEN_LOGIN_PASSWORD などをマスク
 *   - エラーオブジェクトのスタックトレースも必ずマスク処理を通す
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** マスク対象のキーワード（大文字小文字を問わず） */
const SENSITIVE_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /credential/i,
  /login[_-]?id/i,
  /kaken[_-]?login/i,
];

/**
 * 文字列中の機密情報をマスクする
 * 例: "password=abc123" → "password=[MASKED]"
 */
export function maskSensitive(input: string): string {
  let result = input;
  // key=value 形式
  result = result.replace(
    /(password|passwd|secret|token|api[_-]?key|credential)[=:\s"']+([^\s"',}&]+)/gi,
    '$1=[MASKED]'
  );
  // JSON形式 "key": "value"
  result = result.replace(
    /("(?:password|passwd|secret|token|api_?key|credential)":\s*")[^"]*(")/gi,
    '$1[MASKED]$2'
  );
  return result;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[DEEP]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return maskSensitive(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForLog(v, depth + 1));
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      sanitized[k] = isSensitiveKey(k) ? '[MASKED]' : sanitizeForLog(v, depth + 1);
    }
    return sanitized;
  }
  return value;
}

function formatLog(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const safeMessage = maskSensitive(message);
  const safeMeta = meta !== undefined ? JSON.stringify(sanitizeForLog(meta)) : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${safeMessage}${safeMeta ? ' ' + safeMeta : ''}`;
}

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (isDev) {
      console.debug(formatLog('debug', message, meta));
    }
  },
  info(message: string, meta?: unknown): void {
    console.info(formatLog('info', message, meta));
  },
  warn(message: string, meta?: unknown): void {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: unknown): void {
    // Error オブジェクトの場合はスタックも含めてマスク
    if (meta instanceof Error) {
      const safeStack = meta.stack ? maskSensitive(meta.stack) : undefined;
      console.error(formatLog('error', message, { message: meta.message, stack: safeStack }));
    } else {
      console.error(formatLog('error', message, meta));
    }
  },
};
