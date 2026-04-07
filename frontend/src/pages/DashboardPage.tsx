import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote, MapPin, FileText, AlertTriangle,
  TrendingUp, Upload, GitMerge, ChevronRight, Truck
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { dashboardApi, type DashboardSummary } from '@/api/dashboard'
import { deliveryImportsApi, type DeliveryImportListItem } from '@/api/deliveryImports'
import { StatCard } from '@/components/common/StatCard'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/common/Badge'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { formatCurrency, formatDate, formatDateTime, importStatusBadge } from '@/lib/utils'

const BAR_COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981']

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentDeliveries, setRecentDeliveries] = useState<DeliveryImportListItem[]>([])

  useEffect(() => {
    dashboardApi.getSummary()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))

    // 最新納品書 5件
    const today = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    deliveryImportsApi.list({ date_from: thirtyDaysAgo, date_to: today, limit: 5, page: 1 })
      .then((r) => setRecentDeliveries(r.data))
      .catch(() => {/* ignore */})
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return (
    <div className="glass-card p-6 text-red-600">
      <p className="font-medium">読み込みエラー</p>
      <p className="text-sm mt-1">{error}</p>
    </div>
  )
  if (!data) return null

  const { currentMonth, topSites, recentImports, pendingAliasCount, unclassified } = data

  return (
    <div className="space-y-5">
      <PageHeader
        title="ダッシュボード"
        subtitle={`${currentMonth.period.from} 〜 ${currentMonth.period.to}`}
      />

      {/* 表記ゆれ警告バナー */}
      {pendingAliasCount > 0 && (
        <Link to="/alias-review">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-400/90 backdrop-blur text-amber-900 shadow-lg hover:bg-amber-300/90 transition-colors">
            <AlertTriangle size={18} className="shrink-0" />
            <div className="flex-1 text-sm font-medium">
              現場名の表記ゆれが <strong>{pendingAliasCount}件</strong> 確認待ちです
            </div>
            <ChevronRight size={16} />
          </div>
        </Link>
      )}

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="今月の材料費"
          value={formatCurrency(currentMonth.total)}
          sub={`${currentMonth.rowCount}件の明細`}
          icon={Banknote}
          gradient="bg-gradient-to-br from-violet-100 to-purple-100"
          iconColor="text-violet-600"
        />
        <StatCard
          title="稼働現場数"
          value={`${currentMonth.siteCount}件`}
          icon={MapPin}
          gradient="bg-gradient-to-br from-blue-100 to-cyan-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="未分類金額"
          value={formatCurrency(unclassified.amount)}
          sub={`${unclassified.rowCount}件 要確認`}
          icon={AlertTriangle}
          gradient="bg-gradient-to-br from-amber-100 to-orange-100"
          iconColor="text-amber-600"
        />
        <StatCard
          title="表記ゆれ確認待ち"
          value={`${pendingAliasCount}件`}
          icon={GitMerge}
          gradient="bg-gradient-to-br from-rose-100 to-pink-100"
          iconColor="text-rose-600"
        />
      </div>

      {/* メインコンテンツ */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* 現場別材料費ランキング */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-violet-500" />
              <h2 className="font-bold text-slate-800 text-sm">現場別材料費 TOP5</h2>
            </div>
            <Link to="/sites" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              全件 →
            </Link>
          </div>

          {topSites.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">データがありません</p>
          ) : (
            <>
              {/* グラフ */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topSites} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <XAxis type="number" tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="site_name"
                    width={72}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 6 ? v.slice(0, 6) + '…' : v}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), '材料費']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="total_amount" radius={[0, 6, 6, 0]}>
                    {topSites.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* テキストリスト */}
              <div className="mt-3 space-y-2">
                {topSites.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                      />
                      <span className="text-slate-700 truncate">{s.site_name ?? '未分類'}</span>
                    </div>
                    <span className="font-bold text-slate-800 shrink-0 ml-2">
                      {formatCurrency(s.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 最近のCSV取込履歴 */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-500" />
              <h2 className="font-bold text-slate-800 text-sm">最近のCSV取込</h2>
            </div>
            <Link to="/imports" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              全件 →
            </Link>
          </div>

          {recentImports.length === 0 ? (
            <div className="text-center py-8">
              <Upload size={32} className="text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">まだ取込がありません</p>
              <Link to="/imports" className="text-violet-600 text-sm font-medium hover:underline">
                CSVを取り込む →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentImports.map((imp) => {
                const badge = importStatusBadge(imp.status)
                return (
                  <Link
                    key={imp.id}
                    to={`/imports/${imp.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-sm font-medium truncate">{imp.filename}</p>
                      <p className="text-slate-400 text-xs">{formatDateTime(imp.started_at)} · {imp.row_count}件</p>
                    </div>
                    <Badge className={badge.color}>{badge.label}</Badge>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 最新納品書 */}
      {recentDeliveries.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-violet-500" />
              <h2 className="font-bold text-slate-800 text-sm">最新納品書</h2>
            </div>
            <Link to="/delivery-imports" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              全件 →
            </Link>
          </div>
          <div className="space-y-2">
            {recentDeliveries.map((di) => (
              <Link
                key={di.id}
                to={`/delivery-imports/${di.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 text-sm font-medium truncate">
                    {di.matched_site_name ?? di.raw_site_name ?? '（現場名なし）'}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {di.delivery_date ? formatDate(di.delivery_date) : '日付不明'}
                    {di.raw_person_name ? ` · ${di.raw_person_name}` : ''}
                  </p>
                </div>
                <span className="font-semibold text-slate-800 text-sm shrink-0">
                  {di.total_amount_in_tax != null
                    ? formatCurrency(di.total_amount_in_tax)
                    : di.total_amount_ex_tax != null
                    ? formatCurrency(di.total_amount_ex_tax)
                    : '—'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
