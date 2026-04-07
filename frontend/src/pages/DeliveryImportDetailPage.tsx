import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, FileText, Calendar, User, MapPin, Package,
  Truck, AlertTriangle, CheckCircle, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import {
  deliveryImportsApi,
  type DeliveryImportDetail,
  type SiteMatchCandidate,
  type ResolveSiteAction,
} from '@/api/deliveryImports'

// ============================================================
// バッジ（light bg + dark text）
// ============================================================

function SiteMatchBadge({ status }: { status: DeliveryImportDetail['site_match_status'] }) {
  const config = {
    matched:   { label: '現場確定', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    candidate: { label: '候補あり', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    unmatched: { label: '未分類',   cls: 'bg-red-100 text-red-600 border-red-200' },
    ignored:   { label: '無視',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.cls}`}>
      {status === 'matched' && <CheckCircle size={11} />}
      {(status === 'candidate' || status === 'unmatched') && <AlertTriangle size={11} />}
      {config.label}
    </span>
  )
}

// ============================================================
// 現場候補パネル
// ============================================================

function ResolvePanel({
  importId, rawSiteName, candidates, onResolved,
}: {
  importId: number
  rawSiteName: string
  candidates: SiteMatchCandidate[]
  onResolved: () => void
}) {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(candidates[0]?.candidate_site_id ?? null)
  const [createAlias, setCreateAlias] = useState(true)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handleAction = async (action: ResolveSiteAction) => {
    setLoading(true); setMsg(null)
    try {
      await deliveryImportsApi.resolveSite(importId, action, { site_id: selectedSiteId ?? undefined, create_alias: createAlias })
      setMsg('完了しました')
      onResolved()
    } catch (e) { setMsg(`エラー: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  return (
    <div className="glass-card p-5 border border-amber-200">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-500" />
        <h3 className="text-slate-800 font-semibold text-sm">現場名マッチング</h3>
      </div>
      <p className="text-slate-600 text-xs mb-4">
        「{rawSiteName}」に近い現場が見つかりました。統合方法を選んでください。
      </p>

      {candidates.length > 0 && (
        <div className="space-y-2 mb-4">
          {candidates.map((c) => (
            <label key={c.id} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-colors ${
              selectedSiteId === c.candidate_site_id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}>
              <div className="flex items-center gap-2">
                <input type="radio" name="candidate" checked={selectedSiteId === c.candidate_site_id}
                  onChange={() => setSelectedSiteId(c.candidate_site_id)} className="text-violet-600" />
                <span className="text-slate-800 text-sm font-medium">{c.candidate_site_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-200 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${((c.similarity_score ?? 0) * 100).toFixed(0)}%` }} />
                </div>
                <span className="text-slate-500 text-xs w-10 text-right">{((c.similarity_score ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </label>
          ))}
        </div>
      )}

      {candidates.length === 0 && (
        <div className="text-slate-500 text-sm mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
          類似する既存現場が見つかりませんでした。新規現場として保持するか、無視してください。
        </div>
      )}

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={createAlias} onChange={(e) => setCreateAlias(e.target.checked)} className="rounded text-violet-600 border-slate-300" />
        <span className="text-slate-600 text-xs">今後「{rawSiteName}」を自動でこの現場に統合する</span>
      </label>

      {msg && <p className={`text-xs mb-3 font-medium ${msg.startsWith('エラー') ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => handleAction('match_existing')} disabled={!selectedSiteId || loading}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors">
          {loading ? '処理中...' : '既存現場に統合'}
        </button>
        <button onClick={() => handleAction('create_alias')} disabled={!selectedSiteId || loading}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors">
          統合 + alias登録
        </button>
        <button onClick={() => handleAction('keep_unmatched')} disabled={loading}
          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded-lg font-medium transition-colors">
          別現場として保持
        </button>
        <button onClick={() => handleAction('ignore')} disabled={loading}
          className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs rounded-lg transition-colors">
          無視
        </button>
      </div>
    </div>
  )
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function DeliveryImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<DeliveryImportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reparsing, setReparsing] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true)
    deliveryImportsApi.getById(parseInt(id, 10))
      .then((r) => setDetail(r.data))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const handleReparse = async () => {
    if (!id) return
    setReparsing(true)
    try { await deliveryImportsApi.reparse(parseInt(id, 10)); load() }
    catch (e) { setError(`再解析エラー: ${(e as Error).message}`) }
    finally { setReparsing(false) }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <div className="glass-card p-4 text-red-600 text-sm">{error}</div>
  if (!detail) return null

  const displayAmount = detail.total_amount_in_tax ?? detail.total_amount_ex_tax
  const siteName = detail.matched_site_name ?? detail.raw_site_name ?? '（現場名なし）'
  const materialLines = detail.lines.filter((l) => !l.is_freight && !l.is_misc_charge)
  const freightLines = detail.lines.filter((l) => l.is_freight || l.is_misc_charge)

  return (
    <div className="space-y-5">
      <PageHeader title={detail.source_file_name ?? '納品書詳細'} subtitle="納品書明細">
        <Link to="/delivery-imports" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={14} />一覧に戻る
        </Link>
      </PageHeader>

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Calendar} title="納品日" value={detail.delivery_date ? formatDate(detail.delivery_date) : '不明'}
          gradient="bg-gradient-to-br from-blue-50 to-blue-100" iconColor="text-blue-600" />
        <StatCard icon={User} title="担当者" value={detail.raw_person_name ?? '不明'}
          gradient="bg-gradient-to-br from-purple-50 to-purple-100" iconColor="text-purple-600" />
        <StatCard icon={MapPin} title="現場名" value={siteName}
          gradient="bg-gradient-to-br from-pink-50 to-pink-100" iconColor="text-pink-600" />
        <StatCard icon={Package} title="合計金額（税込）" value={displayAmount != null ? formatCurrency(displayAmount) : '不明'}
          gradient="bg-gradient-to-br from-emerald-50 to-emerald-100" iconColor="text-emerald-600" />
      </div>

      {/* ヘッダ詳細 */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-800 font-semibold">ヘッダ情報</h2>
          <div className="flex items-center gap-2">
            <SiteMatchBadge status={detail.site_match_status} />
            {detail.parse_status !== 'success' && (
              <button onClick={handleReparse} disabled={reparsing}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50 transition-colors">
                <RefreshCw size={12} className={reparsing ? 'animate-spin' : ''} />再解析
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {[
            { label: '発注者',        value: detail.raw_orderer_name },
            { label: 'PDF上の現場名', value: detail.raw_site_name },
            { label: '税抜合計',      value: detail.total_amount_ex_tax != null ? formatCurrency(detail.total_amount_ex_tax) : null },
            { label: '消費税',        value: detail.total_tax != null ? formatCurrency(detail.total_tax) : null },
            { label: '税込合計',      value: detail.total_amount_in_tax != null ? formatCurrency(detail.total_amount_in_tax) : null },
            { label: '解析精度',      value: detail.parse_confidence != null ? `${(detail.parse_confidence * 100).toFixed(0)}%` : null },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-slate-500 text-xs font-medium mb-0.5">{label}</p>
              <p className="text-slate-800 font-medium">{value ?? <span className="text-slate-300 font-normal">—</span>}</p>
            </div>
          ))}
        </div>
        <div className="text-slate-400 text-xs pt-3 border-t border-slate-100 mt-3">
          取込: {formatDateTime(detail.created_at)} / ファイル: {detail.source_file_name ?? '—'}
        </div>
      </div>

      {/* 現場マッチングパネル */}
      {(detail.site_match_status === 'candidate' || detail.site_match_status === 'unmatched') && detail.raw_site_name && (
        <ResolvePanel importId={detail.id} rawSiteName={detail.raw_site_name} candidates={detail.candidates} onResolved={load} />
      )}

      {/* 商品名称明細テーブル */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText size={16} className="text-violet-500" />
          <h2 className="text-slate-800 font-semibold">商品名称明細</h2>
          <span className="text-slate-500 text-sm">
            （材料 {materialLines.length}件 / 運賃等 {freightLines.length}件）
          </span>
        </div>

        {detail.lines.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">明細データが抽出できませんでした</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['#', '商品名称', '規格・容量', '数量', '単価', '税別金額', '消費税', '税込金額', '区分'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-slate-500 font-semibold text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => {
                  const isOther = line.is_freight || line.is_misc_charge
                  return (
                    <tr key={line.id} className={`border-b border-slate-100 hover:bg-violet-50/40 transition-colors ${isOther ? 'opacity-70' : ''}`}>
                      <td className="px-4 py-3 text-slate-400 text-xs">{line.line_no}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className={`block truncate font-medium ${isOther ? 'text-slate-500' : 'text-slate-800'}`} title={line.item_name_raw ?? undefined}>
                          {line.item_name_raw ?? <span className="text-slate-300 font-normal">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[120px]">
                        <span className="block truncate">{line.spec_raw ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {line.quantity != null ? `${line.quantity}${line.unit ?? ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {line.unit_price != null ? formatCurrency(line.unit_price) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-medium">
                        {line.amount_ex_tax != null ? formatCurrency(line.amount_ex_tax) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {line.tax_amount != null ? formatCurrency(line.tax_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-800 font-semibold">
                        {line.amount_in_tax != null ? formatCurrency(line.amount_in_tax) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {line.is_freight ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs border border-blue-100">
                            <Truck size={10} />運賃
                          </span>
                        ) : line.is_misc_charge ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-xs border border-amber-100">割増</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {(detail.total_amount_ex_tax != null || detail.total_amount_in_tax != null) && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={5} className="px-4 py-3 text-slate-600 font-semibold text-sm text-right">合計</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-bold">
                      {detail.total_amount_ex_tax != null ? formatCurrency(detail.total_amount_ex_tax) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {detail.total_tax != null ? formatCurrency(detail.total_tax) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800 font-bold text-base">
                      {detail.total_amount_in_tax != null ? formatCurrency(detail.total_amount_in_tax) : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
