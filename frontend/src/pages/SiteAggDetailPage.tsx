import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Banknote, FileText, TrendingUp, AlertTriangle } from 'lucide-react'
import { aggregationApi, type SiteAggDetail } from '@/api/aggregation'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function SiteAggDetailPage() {
  const { siteName } = useParams<{ siteName: string }>()
  const decoded = decodeURIComponent(siteName ?? '')

  const [detail, setDetail] = useState<SiteAggDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!decoded) return
    setLoading(true)
    aggregationApi.siteDetail(decoded, {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }).then(setDetail).finally(() => setLoading(false))
  }, [decoded, dateFrom, dateTo])

  if (loading) return <LoadingSpinner />
  if (!detail) return <div className="glass-card p-6 text-slate-600">現場データがありません</div>

  return (
    <div className="space-y-4">
      <div>
        <Link to="/sites" className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft size={14} />
          現場一覧に戻る
        </Link>
        <PageHeader title={detail.display_name} subtitle="現場別材料費集計" />
      </div>

      {/* 期間フィルタ */}
      <div className="glass-card p-4 flex gap-3 items-center flex-wrap">
        <span className="text-xs text-slate-500 font-medium">期間:</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
        <span className="text-slate-400">〜</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            リセット
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="材料費合計" value={formatCurrency(detail.total_amount)} icon={Banknote} color="violet" />
        <KpiCard label="明細件数" value={`${detail.row_count}件`} icon={FileText} color="blue" />
        <KpiCard label="伝票枚数" value={`${detail.slip_count}枚`} icon={TrendingUp} color="emerald" />
        <KpiCard label="最終納品" value={detail.last_delivery_date ?? '—'} icon={MapPin} color="amber" />
      </div>

      {/* 月別推移グラフ */}
      {detail.monthly.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-violet-500" />
            月別材料費推移
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={detail.monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tickFormatter={(v) => `¥${(v/10000).toFixed(0)}万`} tick={{ fontSize: 11 }} stroke="#94a3b8" width={70} />
              <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v)), '材料費']} labelStyle={{ fontWeight: 'bold' }} />
              <Bar dataKey="amount" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 明細テーブル */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText size={16} className="text-violet-500" />
          <h2 className="font-bold text-slate-800 text-sm">材料費明細</h2>
          <span className="text-slate-400 text-xs">({detail.rows.length}件表示 / 最大200件)</span>
        </div>

        {detail.rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">データがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {['日付', '伝票番号', '品名', '金額', 'ソース'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {detail.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate((row.delivery_date ?? row.order_date) as string)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {row.slip_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium max-w-[200px] truncate">
                      <span>{row.material_name}</span>
                      {row.is_provisional_name === 1 && (
                        <span title="グリッドから自動生成された暫定品名" className="ml-1.5 inline-flex items-center gap-0.5 text-amber-500 text-xs">
                          <AlertTriangle size={10} />暫定
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${row.source_type === 'kaken_auto' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                        {row.source_type === 'kaken_auto' ? '自動取得' : '手動'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = {
    violet: 'from-violet-100 to-purple-100 text-violet-600',
    blue: 'from-blue-100 to-cyan-100 text-blue-600',
    emerald: 'from-emerald-100 to-teal-100 text-emerald-600',
    amber: 'from-amber-100 to-orange-100 text-amber-600',
  }
  return (
    <div className={`rounded-2xl p-4 bg-gradient-to-br ${colors[color].split(' ').slice(0, 2).join(' ')}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={colors[color].split(' ')[2]} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="font-bold text-slate-800 text-sm truncate">{value}</p>
    </div>
  )
}
