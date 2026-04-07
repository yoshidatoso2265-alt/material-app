import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Search, TrendingUp, FileText } from 'lucide-react'
import { aggregationApi, type SiteAggRow } from '@/api/aggregation'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { formatCurrency } from '@/lib/utils'

const SITE_COLORS = [
  'from-violet-400 to-purple-500',
  'from-blue-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
]

export default function SitesPage() {
  const [sites, setSites] = useState<SiteAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    aggregationApi.sites({
      search: searchQuery || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((r) => setSites(r.data))
      .finally(() => setLoading(false))
  }, [searchQuery, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSearch = () => setSearchQuery(search)

  return (
    <div className="space-y-4">
      <PageHeader title="現場別集計" subtitle={`${sites.length} 現場`} />

      {/* 検索・フィルタ */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="現場名で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            検索
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
          <span className="self-center text-slate-400 text-sm">〜</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
          {(dateFrom || dateTo || searchQuery) && (
            <button onClick={() => { setSearch(''); setSearchQuery(''); setDateFrom(''); setDateTo('') }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              リセット
            </button>
          )}
        </div>
      </div>

      {/* 一覧 */}
      {loading ? <LoadingSpinner /> :
        sites.length === 0 ? (
          <EmptyState icon={MapPin} title="現場データがありません"
            description="「自動取得」ページから材料データを取り込んでください" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site, i) => (
              <Link key={site.raw_site_name} to={`/sites/agg/${encodeURIComponent(site.raw_site_name || '現場未分類')}`}>
                <div className="glass-card p-4 hover:shadow-lg transition-all hover:-translate-y-0.5 group cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${SITE_COLORS[i % SITE_COLORS.length]} flex items-center justify-center shrink-0 shadow`}>
                      <MapPin size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 font-bold text-sm truncate">{site.display_name}</p>
                      <p className="text-violet-700 font-bold text-base mt-0.5">{formatCurrency(site.total_amount)}</p>
                      <div className="flex gap-3 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><FileText size={11} />{site.row_count}件</span>
                        <span className="flex items-center gap-1"><TrendingUp size={11} />伝票{site.slip_count}枚</span>
                      </div>
                    </div>
                  </div>
                  {site.last_delivery_date && (
                    <p className="text-xs text-slate-400 mt-2 pl-13">
                      最終納品: {site.last_delivery_date}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )
      }
    </div>
  )
}
