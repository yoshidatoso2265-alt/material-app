import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Package, ChevronLeft, ChevronRight, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { materialsApi, type MaterialItem, type MaterialFilter } from '@/api/materials'
import { scraperApi, type LastRunResult } from '@/api/scraper'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

export default function MaterialsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<MaterialItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<MaterialFilter>({ page: 1, limit: PAGE_SIZE })
  const [searchInput, setSearchInput] = useState('')
  const [lastRun, setLastRun] = useState<LastRunResult | null | undefined>(undefined)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const fetchData = useCallback((f: MaterialFilter) => {
    setLoading(true)
    materialsApi.list(f)
      .then((r) => { setItems(r.data); setTotal(r.total) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData(filter) }, [filter, fetchData])

  // 最終取込結果を取得
  useEffect(() => {
    scraperApi.lastResult()
      .then((r) => setLastRun(r))
      .catch(() => setLastRun(null))
  }, [])

  const handleSearch = () => {
    setFilter((f) => ({ ...f, search: searchInput || undefined, page: 1 }))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="space-y-4">
      <PageHeader title="材料一覧" subtitle={`全 ${total.toLocaleString()} 件`} />

      {/* 最終自動取込結果カード */}
      {lastRun !== undefined && (
        <LastRunCard result={lastRun} onNavigate={() => navigate('/scraper')} />
      )}

      {/* 検索バー */}
      <div className="glass-card p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="材料名・現場名・伝票番号で検索"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 bg-white"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            検索
          </button>
        </div>

        {/* 日付フィルタ */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <input
            type="date"
            value={filter.date_from ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, date_from: e.target.value || undefined, page: 1 }))}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          />
          <span className="self-center text-slate-400 text-sm">〜</span>
          <input
            type="date"
            value={filter.date_to ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, date_to: e.target.value || undefined, page: 1 }))}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          />
          {(filter.search || filter.date_from || filter.date_to) && (
            <button
              onClick={() => { setSearchInput(''); setFilter({ page: 1, limit: PAGE_SIZE }) }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              リセット
            </button>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : items.length === 0 ? (
          <EmptyState icon={Package} title="材料データがありません" description="CSVを取り込んでください" />
        ) : (
          <>
            {/* デスクトップ用テーブル */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    {['日付', '伝票番号', '材料名', '規格', '現場', '数量', '単価', '金額'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-violet-50/40 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {formatDate(item.order_date ?? item.delivery_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {item.slip_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium max-w-[180px] truncate">
                        {item.material_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[100px] truncate">
                        {item.spec ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[120px]">
                        {item.site_name ? (
                          <span className="text-violet-700 font-medium text-xs truncate block">{item.site_name}</span>
                        ) : (
                          <span className="text-amber-600 text-xs bg-amber-50 px-2 py-0.5 rounded-full">未分類</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {item.quantity != null ? `${item.quantity} ${item.unit ?? ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* モバイル用カードリスト */}
            <div className="md:hidden divide-y divide-slate-100">
              {items.map((item) => (
                <div key={item.id} className="p-4 space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-slate-800 font-medium text-sm leading-tight flex-1">{item.material_name}</p>
                    <span className="font-bold text-slate-900 text-sm shrink-0">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {item.site_name ? (
                      <span className="text-violet-700 text-xs bg-violet-50 px-2 py-0.5 rounded-full">{item.site_name}</span>
                    ) : (
                      <span className="text-amber-600 text-xs bg-amber-50 px-2 py-0.5 rounded-full">未分類</span>
                    )}
                    <span className="text-slate-400 text-xs">{formatDate(item.order_date ?? item.delivery_date)}</span>
                    {item.spec && <span className="text-slate-400 text-xs">{item.spec}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/30">
            <p className="text-xs text-slate-500">
              {((filter.page ?? 1) - 1) * PAGE_SIZE + 1}〜{Math.min((filter.page ?? 1) * PAGE_SIZE, total)} / {total.toLocaleString()}件
            </p>
            <div className="flex gap-1">
              <button
                disabled={(filter.page ?? 1) <= 1}
                onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  (filter.page ?? 1) <= 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 text-xs text-slate-600 self-center">
                {filter.page ?? 1} / {totalPages}
              </span>
              <button
                disabled={(filter.page ?? 1) >= totalPages}
                onClick={() => setFilter((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  (filter.page ?? 1) >= totalPages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 最終自動取込結果カード ─────────────────────────────────────────
function LastRunCard({
  result,
  onNavigate,
}: {
  result: LastRunResult | null
  onNavigate: () => void
}) {
  if (result === null) {
    return (
      <div className="glass-card p-4 flex items-center gap-3 text-slate-400">
        <RefreshCw size={15} />
        <span className="text-sm">自動取込の実行履歴がありません</span>
        <button
          onClick={onNavigate}
          className="ml-auto text-xs text-violet-600 hover:underline font-medium"
        >
          材料費を更新する →
        </button>
      </div>
    )
  }

  const statusIcon =
    result.status === 'completed' ? (
      <CheckCircle size={16} className="text-emerald-500 shrink-0" />
    ) : result.status === 'partial' ? (
      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
    ) : (
      <XCircle size={16} className="text-red-500 shrink-0" />
    )

  const statusLabel =
    result.status === 'completed' ? '完了' :
    result.status === 'partial'   ? '一部エラー' :
    result.status === 'failed'    ? '失敗' : result.status

  const finishedAt = result.finishedAt
    ? new Date(result.finishedAt).toLocaleString('ja-JP')
    : '—'

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw size={14} className="text-violet-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">最終自動取込</span>
        <button
          onClick={onNavigate}
          className="ml-auto text-xs text-violet-600 hover:underline font-medium"
        >
          更新する →
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className="font-medium text-slate-700">{statusLabel}</span>
        </div>
        <span className="text-slate-400 text-xs">
          期間: {result.periodFrom ?? '?'} 〜 {result.periodTo ?? '?'}
        </span>
        <span className="text-slate-400 text-xs">完了: {finishedAt}</span>
        <div className="flex gap-3 text-xs ml-auto">
          <span className="text-slate-500">保存 <strong className="text-emerald-600">{result.rowCount}</strong> 件</span>
          {result.duplicateCount > 0 && (
            <span className="text-slate-500">重複 <strong className="text-amber-600">{result.duplicateCount}</strong> 件</span>
          )}
          {result.errorCount > 0 && (
            <span className="text-slate-500">エラー <strong className="text-red-600">{result.errorCount}</strong> 件</span>
          )}
        </div>
      </div>
    </div>
  )
}
