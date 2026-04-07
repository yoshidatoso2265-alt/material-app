import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import {
  deliveryImportsApi,
  type UnmatchedSiteGroup,
  type ResolveSiteAction,
} from '@/api/deliveryImports'

// ============================================================
// 未分類グループカード
// ============================================================

interface GroupCardProps {
  group: UnmatchedSiteGroup
  onResolved: () => void
}

function GroupCard({ group, onResolved }: GroupCardProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(
    group.candidates[0]?.candidate_site_id ?? null
  )
  const [createAlias, setCreateAlias] = useState(true)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [expanded, setExpanded] = useState(false)

  // 取込件数が多いグループはデフォルト展開
  useEffect(() => {
    if (group.import_count >= 3) setExpanded(true)
  }, [group.import_count])

  const handleAction = async (action: ResolveSiteAction) => {
    setLoading(true)
    setMsg(null)
    try {
      const importId = group.candidates[0]?.delivery_import_id
      if (!importId && (action === 'match_existing' || action === 'create_alias')) {
        setMsg({ type: 'error', text: '対象の取込IDが見つかりません' })
        return
      }
      if (importId) {
        await deliveryImportsApi.resolveSite(importId, action, {
          site_id: selectedSiteId ?? undefined,
          create_alias: createAlias,
        })
      }
      setMsg({ type: 'success', text: '処理完了' })
      setTimeout(onResolved, 800)
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const hasCandidates = group.candidates.length > 0

  return (
    <div className="glass-card overflow-hidden">
      {/* ヘッダ */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <span className="text-slate-800 font-medium truncate">
            {group.raw_site_name || '（現場名なし）'}
          </span>
          <span className="text-slate-500 text-xs shrink-0">{group.import_count}件の取込</span>
          {hasCandidates && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
              候補{group.candidates.length}件
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs ml-2">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* 候補一覧 */}
          {hasCandidates ? (
            <div className="space-y-2">
              <p className="text-slate-600 text-xs font-medium">類似候補から選択:</p>
              {group.candidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-colors ${
                    selectedSiteId === c.candidate_site_id
                      ? 'border-violet-400 bg-violet-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`candidate-${group.raw_site_name}`}
                      checked={selectedSiteId === c.candidate_site_id}
                      onChange={() => setSelectedSiteId(c.candidate_site_id)}
                      className="text-violet-500"
                    />
                    <span className="text-slate-800 text-sm font-medium">{c.candidate_site_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-slate-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-violet-500"
                        style={{ width: `${((c.similarity_score ?? 0) * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-slate-500 text-xs w-10 text-right">
                      {((c.similarity_score ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">類似候補が見つかりませんでした。手動で現場を選択してください。</p>
          )}

          {/* alias登録オプション */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createAlias}
              onChange={(e) => setCreateAlias(e.target.checked)}
              className="rounded text-violet-500"
            />
            <span className="text-slate-600 text-xs">
              今後「{group.raw_site_name}」を自動でこの現場に統合する（alias登録）
            </span>
          </label>

          {/* メッセージ */}
          {msg && (
            <p className={`text-xs font-medium ${msg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
              {msg.type === 'success' ? '✓ ' : '⚠ '}{msg.text}
            </p>
          )}

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAction('match_existing')}
              disabled={!selectedSiteId || loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs rounded-lg transition-colors font-medium"
            >
              <CheckCircle size={12} />
              {loading ? '処理中...' : '既存現場に統合'}
            </button>
            <button
              onClick={() => handleAction('create_alias')}
              disabled={!selectedSiteId || loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs rounded-lg transition-colors font-medium"
            >
              <CheckCircle size={12} />
              統合 + alias登録
            </button>
            <button
              onClick={() => handleAction('keep_unmatched')}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors font-medium border border-slate-200"
            >
              別現場として保持
            </button>
            <button
              onClick={() => handleAction('ignore')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs rounded-lg transition-colors border border-slate-200"
            >
              <XCircle size={12} />
              無視
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function UnmatchedSitesPage() {
  const [groups, setGroups] = useState<UnmatchedSiteGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    deliveryImportsApi.unmatchedSites()
      .then((r) => setGroups(r.data))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const unmatchedCount = groups.filter((g) => g.candidates.length === 0).length
  const candidateCount = groups.filter((g) => g.candidates.length > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="未分類現場名管理"
        subtitle={`${groups.length}種類の現場名が未確定です。候補から選んで統合するか、別現場として保持してください。`}
      />

      {/* サマリー */}
      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500" />
            <div>
              <p className="text-slate-500 text-xs">類似候補あり</p>
              <p className="text-slate-800 text-xl font-bold">{candidateCount}件</p>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <XCircle size={20} className="text-red-400" />
            <div>
              <p className="text-slate-500 text-xs">候補なし</p>
              <p className="text-slate-800 text-xl font-bold">{unmatchedCount}件</p>
            </div>
          </div>
        </div>
      )}

      {/* グループ一覧 */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="glass-card p-4 text-red-600 text-sm">{error}</div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="未分類現場名はありません"
          description="すべての納品書の現場名が確定されています"
        />
      ) : (
        <div className="space-y-3">
          {/* 候補あり（優先表示） */}
          {groups.filter((g) => g.candidates.length > 0).map((g) => (
            <GroupCard key={g.raw_site_name} group={g} onResolved={load} />
          ))}
          {/* 候補なし */}
          {groups.filter((g) => g.candidates.length === 0).length > 0 && (
            <>
              {candidateCount > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-slate-400 text-xs">候補なし</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}
              {groups.filter((g) => g.candidates.length === 0).map((g) => (
                <GroupCard key={g.raw_site_name} group={g} onResolved={load} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
