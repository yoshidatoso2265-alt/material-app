import { useState, useEffect, useRef } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { deliveryImportsApi, type DeliveryImportListItem, type UpdateResult } from '@/api/deliveryImports'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

const LAST_SYNC_KEY = 'delivery_imports_last_sync'

// ============================================================
// 進捗バー
// ============================================================

type ProgressState =
  | { stage: 'idle' }
  | { stage: 'phase'; label: string }
  | { stage: 'processing'; current: number; total: number; label: string }
  | { stage: 'done' }

function ProgressBar({ progress }: { progress: ProgressState }) {
  if (progress.stage === 'idle') return null

  const pct = progress.stage === 'processing' && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-white text-sm font-medium">
          {progress.stage === 'phase' && progress.label}
          {progress.stage === 'processing' && progress.label}
          {progress.stage === 'done' && '完了'}
        </p>
        {pct !== null && (
          <p className="text-white/70 text-sm font-bold">
            {'current' in progress ? progress.current : ''} / {'total' in progress ? progress.total : ''}
          </p>
        )}
      </div>

      {/* バー */}
      <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
        {pct !== null ? (
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        ) : (
          /* 不確定バー（アニメーション） */
          <div className="h-full w-1/3 bg-violet-500 rounded-full animate-indeterminate" />
        )}
      </div>

      {pct !== null && (
        <p className="text-white/50 text-xs text-right">{pct}%</p>
      )}
    </div>
  )
}

// ============================================================
// メインページ
// ============================================================

export default function DeliveryImportsPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [updating, setUpdating] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ stage: 'idle' })
  const [lastSync, setLastSync] = useState<UpdateResult | null>(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SYNC_KEY) ?? 'null') } catch { return null }
  })
  const [imports, setImports] = useState<DeliveryImportListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const loadList = () => {
    setLoading(true)
    deliveryImportsApi.list({ limit: 200, page: 1 })
      .then(r => setImports(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadList() }, [])
  useEffect(() => () => { esRef.current?.close() }, [])

  const handleUpdate = () => {
    if (updating) return
    setUpdating(true)
    setError(null)
    setProgress({ stage: 'phase', label: '接続中…' })

    const url = `/api/delivery-imports/update-stream${dateFrom ? `?date_from=${dateFrom}` : ''}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'phase') {
          setProgress({ stage: 'phase', label: msg.phase })
        } else if (msg.type === 'total') {
          setProgress({ stage: 'processing', current: 0, total: msg.total, label: '準備中…' })
        } else if (msg.type === 'item') {
          const isZip = msg.slipNumber?.startsWith('ZIP ')
          setProgress({
            stage: 'processing',
            current: msg.current + 1,
            total: msg.total,
            label: isZip
              ? `ZIPダウンロード中… (${msg.current + 1}/${msg.total}ページ)`
              : `PDF解析中… (${msg.current + 1}/${msg.total}件)`,
          })
        } else if (msg.type === 'done') {
          const result: UpdateResult = msg.result
          setLastSync(result)
          localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(result))
          setProgress({ stage: 'done' })
          setUpdating(false)
          es.close()
          loadList()
        } else if (msg.type === 'error') {
          const raw = msg.message || '不明なエラー'
          setError(raw.length > 100 ? raw.slice(0, 100) + '…' : raw)
          setProgress({ stage: 'idle' })
          setUpdating(false)
          es.close()
        }
      } catch {}
    }

    es.onerror = () => {
      setError('通信エラーが発生しました')
      setProgress({ stage: 'idle' })
      setUpdating(false)
      es.close()
    }
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white">納品書</h1>

      {/* 取込済みリスト */}
      <section>
        <h2 className="text-white/60 text-xs font-medium uppercase tracking-wide mb-2">取込済み ({imports.length}件)</h2>
        {loading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : imports.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-6">データなし</p>
        ) : (
          <div className="bg-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
            {imports.map((imp) => (
              <div key={imp.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{imp.raw_site_name || '（現場名なし）'}</p>
                  <p className="text-white/50 text-xs">
                    {formatDate(imp.delivery_date)} · {imp.raw_person_name || '−'}
                  </p>
                </div>
                <span className="text-white font-semibold text-sm">
                  {imp.total_amount_in_tax != null ? formatCurrency(imp.total_amount_in_tax) : '−'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
