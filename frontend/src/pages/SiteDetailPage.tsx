import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Banknote, FileText } from 'lucide-react'
import { sitesApi, type Site, type SiteSummary } from '@/api/sites'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const siteId = parseInt(id ?? '0', 10)

  const [site, setSite] = useState<Site | null>(null)
  const [summary, setSummary] = useState<SiteSummary | null>(null)
  const [materials, setMaterials] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!siteId) return
    Promise.all([
      sitesApi.getById(siteId),
      sitesApi.getSummary(siteId),
      sitesApi.getMaterials(siteId, { limit: 100 }),
    ]).then(([s, sum, mats]) => {
      setSite(s)
      setSummary(sum)
      setMaterials(mats.data)
    }).finally(() => setLoading(false))
  }, [siteId])

  if (loading) return <LoadingSpinner />
  if (!site) return <div className="glass-card p-6 text-slate-600">現場が見つかりません</div>

  return (
    <div className="space-y-4">
      <div>
        <Link to="/sites" className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft size={14} />
          現場一覧に戻る
        </Link>
        <PageHeader title={site.name} subtitle={site.site_code ?? '現場コード未設定'} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="材料費合計"
          value={formatCurrency(summary?.total_amount)}
          sub={`${summary?.row_count ?? 0}件の明細`}
          icon={Banknote}
          gradient="bg-gradient-to-br from-violet-100 to-purple-100"
          iconColor="text-violet-600"
        />
        <StatCard
          title="正規化名"
          value={site.normalized_name || '—'}
          icon={MapPin}
          gradient="bg-gradient-to-br from-blue-100 to-cyan-100"
          iconColor="text-blue-600"
        />
      </div>

      {/* 材料費明細 */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText size={16} className="text-violet-500" />
          <h2 className="font-bold text-slate-800 text-sm">材料費明細</h2>
          <span className="text-slate-400 text-xs">（{materials.length}件）</span>
        </div>

        {materials.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">明細データがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {['日付', '材料名', '規格', '数量', '単価', '金額'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 font-medium text-xs whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {materials.map((row, i) => (
                  <tr key={i} className="hover:bg-violet-50/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate((row.order_date as string) ?? (row.delivery_date as string))}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium max-w-[160px] truncate">
                      {row.material_name as string}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[100px] truncate">
                      {(row.spec as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {row.quantity != null ? `${row.quantity} ${(row.unit as string) ?? ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {formatCurrency(row.unit_price as number)}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                      {formatCurrency(row.amount as number)}
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
