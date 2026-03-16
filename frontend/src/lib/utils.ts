import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 金額を日本円形式でフォーマット */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}

/** 日付を日本語形式でフォーマット */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** 日時をフォーマット */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 当月の開始・終了日を返す */
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

/** インポートステータスの表示ラベルと色 */
export function importStatusBadge(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    completed: { label: '完了', color: 'bg-emerald-100 text-emerald-700' },
    partial:   { label: '一部エラー', color: 'bg-amber-100 text-amber-700' },
    failed:    { label: '失敗', color: 'bg-red-100 text-red-700' },
    processing:{ label: '処理中', color: 'bg-blue-100 text-blue-700' },
  }
  return map[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' }
}

/** 類似度スコアを % 表示 */
export function formatScore(score: number | null | undefined): string {
  if (score == null) return '—'
  return `${Math.round(score * 100)}%`
}
