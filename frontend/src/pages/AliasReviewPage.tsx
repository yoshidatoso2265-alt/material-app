import { useEffect, useState } from 'react'
import { GitMerge, Check, X, Plus, AlertTriangle } from 'lucide-react'
import { sitesApi, type SiteAlias, type Site } from '@/api/sites'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { formatScore } from '@/lib/utils'

export default function AliasReviewPage() {
  const [aliases, setAliases] = useState<SiteAlias[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<number | null>(null)
  const [newSiteNames, setNewSiteNames] = useState<Record<number, string>>({})
  const [result, setResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      sitesApi.getAliasCandidates(),
      sitesApi.list({ limit: 200 }),
    ]).then(([a, s]) => {
      setAliases(a)
      setSites(s.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleApprove = async (alias: SiteAlias, siteId: number) => {
    setProcessing(alias.id)
    setResult(null)
    try {
      await sitesApi.approveAlias(alias.id, { site_id: siteId })
      setResult({ id: alias.id, ok: true, msg: '統合しました' })
      setAliases((prev) => prev.filter((a) => a.id !== alias.id))
    } catch (e) {
      setResult({ id: alias.id, ok: false, msg: (e as Error).message })
    } finally {
      setProcessing(null)
    }
  }

  const handleNewSite = async (alias: SiteAlias) => {
    const name = newSiteNames[alias.id]?.trim()
    if (!name) return
    setProcessing(alias.id)
    setResult(null)
    try {
      await sitesApi.rejectAlias(alias.id, { new_site_name: name })
      setResult({ id: alias.id, ok: true, msg: `新規現場「${name}」として登録しました` })
      setAliases((prev) => prev.filter((a) => a.id !== alias.id))
    } catch (e) {
      setResult({ id: alias.id, ok: false, msg: (e as Error).message })
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (alias: SiteAlias) => {
    setProcessing(alias.id)
    setResult(null)
    try {
      await sitesApi.rejectAlias(alias.id, {})
      setResult({ id: alias.id, ok: true, msg: '保留にしました' })
      setAliases((prev) => prev.filter((a) => a.id !== alias.id))
    } catch (e) {
      setResult({ id: alias.id, ok: false, msg: (e as Error).message })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="表記ゆれ確認"
        subtitle={`${aliases.length}件 確認待ち`}
      />

      {/* 説明 */}
      <div className="glass-card p-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-600 space-y-1">
          <p className="font-medium">安全な統合フロー</p>
          <p className="text-slate-500 text-xs">
            CSVの現場名を既存現場に統合するか、新規現場として登録するかを1件ずつ確認します。
            完全一致のみ自動統合されます。それ以外は必ず管理者が確認してください。
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : aliases.length === 0 ? (
        <EmptyState
          icon={GitMerge}
          title="確認待ちの表記ゆれはありません"
          description="CSVを取り込むと新しい現場名が自動検出されます"
        />
      ) : (
        <div className="space-y-3">
          {aliases.map((alias) => {
            const isProcessing = processing === alias.id
            const topCandidate = alias.candidates?.[0]

            return (
              <div key={alias.id} className="glass-card p-5 space-y-4 animate-fade-in">
                {/* ヘッダー: CSV上の表記 */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
                    <GitMerge size={16} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">CSV上の表記</p>
                    <p className="text-slate-800 font-bold text-lg leading-tight">{alias.alias_name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">正規化: {alias.normalized_alias || '—'}</p>
                  </div>
                </div>

                {/* 候補現場 */}
                {alias.candidates && alias.candidates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">類似現場候補</p>
                    <div className="space-y-2">
                      {alias.candidates.slice(0, 3).map((c) => (
                        <div
                          key={c.siteId}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/60"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-medium text-sm">{c.siteName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-violet-400 to-purple-500 rounded-full"
                                  style={{ width: `${c.score * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500 shrink-0">
                                {formatScore(c.score)}
                              </span>
                            </div>
                          </div>
                          <button
                            disabled={isProcessing}
                            onClick={() => handleApprove(alias, c.siteId)}
                            className="flex items-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 shrink-0 touch-target"
                          >
                            <Check size={13} />
                            統合
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 新規現場として登録 */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">新規現場として登録</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`正式名称 (例: ${alias.alias_name})`}
                      value={newSiteNames[alias.id] ?? ''}
                      onChange={(e) => setNewSiteNames((prev) => ({ ...prev, [alias.id]: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    />
                    <button
                      disabled={isProcessing || !newSiteNames[alias.id]?.trim()}
                      onClick={() => handleNewSite(alias)}
                      className="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-40 shrink-0 touch-target"
                    >
                      <Plus size={13} />
                      新規登録
                    </button>
                  </div>
                </div>

                {/* 既存現場から選択 */}
                {sites.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">既存現場から選んで統合</p>
                    <select
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleApprove(alias, parseInt(e.target.value, 10))
                      }}
                    >
                      <option value="">— 選択してください —</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 保留ボタン */}
                <div className="flex justify-end">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleReject(alias)}
                    className="flex items-center gap-1 px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-xs transition-colors disabled:opacity-50"
                  >
                    <X size={13} />
                    保留にする
                  </button>
                </div>

                {/* 処理結果 */}
                {result?.id === alias.id && (
                  <div className={`px-3 py-2 rounded-xl text-xs font-medium ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {result.msg}
                  </div>
                )}

                {topCandidate && (
                  <p className="text-slate-300 text-xs text-right">
                    最高スコア: {formatScore(topCandidate.score)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
