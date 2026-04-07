import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react'
import { importsApi, type MaterialImport, type ImportRow } from '@/api/imports'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/common/Badge'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { formatDateTime, formatCurrency, importStatusBadge } from '@/lib/utils'

export default function ImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const importId = parseInt(id ?? '0', 10)

  const [record, setRecord] = useState<MaterialImport | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [errors, setErrors] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'errors'>('all')

  useEffect(() => {
    if (!importId) return
    Promise.all([
      importsApi.getById(importId),
      importsApi.getRows(importId, { limit: 100 }),
      importsApi.getErrors(importId),
    ]).then(([r, ro, e]) => {
      setRecord(r)
      setRows(ro.data)
      setErrors(e)
    }).finally(() => setLoading(false))
  }, [importId])

  if (loading) return <LoadingSpinner />
  if (!record) return <div className="glass-card p-6 text-slate-600">取込記録が見つかりません</div>

  const badge = importStatusBadge(record.status)
  const displayRows = tab === 'errors' ? errors : rows

  return (
    <div className="space-y-4">
      <div>
        <Link to="/imports" className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3 transition-colors">
          <ArrowLeft size={14} />
          取込履歴に戻る
        </Link>
        <PageHeader title="取込詳細" subtitle={record.filename} />
      </div>

      {/* サマリー */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={badge.color}>{badge.label}</Badge>
          <span className="text-slate-500 text-sm">{formatDateTime(record.started_at)}</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-slate-800">{record.row_count}</p>
            <p className="text-xs text-slate-400">取込件数</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${record.error_count > 0 ? 'text-red-500' : 'text-slate-800'}`}>
              {record.error_count}
            </p>
            <p className="text-xs text-slate-400">エラー</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${record.duplicate_count > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
              {record.duplicate_count}
            </p>
            <p className="text-xs text-slate-400">重複</p>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 glass-card p-1">
        {(['all', 'errors'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t ? 'bg-violet-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t === 'all' ? `全行 (${rows.length})` : `エラー行 (${errors.length})`}
          </button>
        ))}
      </div>

      {/* 明細テーブル */}
      <div className="glass-card overflow-hidden">
        {displayRows.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={28} className="text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">データがありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">行</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">日付</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">現場名（生）</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">材料名</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">金額</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium text-xs">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayRows.map((row) => (
                  <tr key={row.id} className={`${row.has_error ? 'bg-red-50/40' : row.is_duplicate ? 'bg-amber-50/40' : ''} hover:bg-violet-50/20 transition-colors`}>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{row.id}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{row.order_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[120px] truncate">{row.raw_site_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium text-xs max-w-[160px] truncate">{row.material_name}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-bold text-xs whitespace-nowrap">{formatCurrency(row.amount)}</td>
                    <td className="px-4 py-2.5">
                      {row.has_error ? (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle size={12} />
                          {row.error_message?.slice(0, 30) ?? 'エラー'}
                        </span>
                      ) : row.is_duplicate ? (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">重複</span>
                      ) : (
                        <span className="text-xs text-emerald-600">正常</span>
                      )}
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
