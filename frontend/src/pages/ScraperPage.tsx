import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Search, CheckCircle, XCircle, AlertTriangle,
  FileText, Database, ArrowRight, Clock, Info, History,
} from 'lucide-react'
import { scraperApi, type ScraperRunResult, type ProbeResult, type BackfillResult, type ScraperRunRecord } from '@/api/scraper'
import { PageHeader } from '@/components/common/PageHeader'

type RunState = 'idle' | 'running' | 'done'

interface LogEntry {
  time: string
  type: 'info' | 'success' | 'error' | 'warn'
  message: string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function nDaysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function sixMonthsAgoStr(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
}
function fmtSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export default function ScraperPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState(nDaysAgoStr(7))
  const [dateTo, setDateTo] = useState(todayStr())
  const [runState, setRunState] = useState<RunState>('idle')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<ScraperRunResult | null>(null)
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAt = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // バックフィル関連
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null)
  const [runHistory, setRunHistory] = useState<ScraperRunRecord[]>([])
  const [bfDateFrom, setBfDateFrom] = useState(sixMonthsAgoStr())
  const [bfDateTo, setBfDateTo] = useState(todayStr())

  // 経過時間タイマー
  useEffect(() => {
    if (runState === 'running') {
      startedAt.current = Date.now()
      setElapsedMs(0)
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAt.current)
      }, 200)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [runState])

  // ログ自動スクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 履歴の初回読み込み
  useEffect(() => {
    scraperApi.history(10).then(setRunHistory).catch(() => {})
  }, [])

  function addLog(type: LogEntry['type'], message: string) {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString('ja-JP'), type, message },
    ])
  }

  async function handleRun() {
    setRunState('running')
    setLogs([])
    setResult(null)
    setProbeResult(null)
    addLog('info', `実行開始: ${dateFrom} 〜 ${dateTo}`)
    addLog('info', 'バックエンドへリクエスト送信中...')

    try {
      const res = await scraperApi.run({ dateFrom, dateTo })
      setResult(res)

      if (res.success) {
        addLog('success', res.message)
        addLog('info', `取得モード: ${res.mode === 'grid_fallback' ? 'グリッド直読み (フォールバック)' : 'CSV ダウンロード'}`)
        addLog('info', `取得件数 (フィルタ前): ${res.fetched} 件`)
        addLog('success', `新規保存: ${res.inserted} 件`)
        if (res.skipped > 0) addLog('warn', `重複スキップ: ${res.skipped} 件`)
        if (res.importId) addLog('info', `取込 ID: ${res.importId}`)
      } else {
        addLog('error', res.message)
        if (res.errorDetail) addLog('error', `詳細: ${res.errorDetail}`)
      }
    } catch (e) {
      addLog('error', `通信エラー: ${(e as Error).message}`)
      setResult({ success: false, message: '通信エラー', dateFrom, dateTo, fetched: 0, inserted: 0, skipped: 0, mode: 'grid_fallback' })
    } finally {
      setRunState('done')
      scraperApi.history(10).then(setRunHistory).catch(() => {})
    }
  }

  async function handleProbe() {
    setRunState('running')
    setLogs([])
    setResult(null)
    setProbeResult(null)
    addLog('info', 'プローブ実行中: ログインページへアクセス...')

    try {
      const res = await scraperApi.probe()
      setProbeResult(res)
      if (res.success) {
        addLog('success', res.message)
        res.files.forEach((f) => addLog('info', f))
      } else {
        addLog('error', res.message)
      }
    } catch (e) {
      addLog('error', `通信エラー: ${(e as Error).message}`)
    } finally {
      setRunState('done')
    }
  }

  async function handleBackfill() {
    setIsBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await scraperApi.backfill({ dateFrom: bfDateFrom, dateTo: bfDateTo, chunkDays: 7 })
      setBackfillResult(res)
      scraperApi.history(10).then(setRunHistory).catch(() => {})
    } catch (e) {
      setBackfillResult({
        success: false,
        message: `通信エラー: ${(e as Error).message}`,
        totalFetched: 0,
        totalInserted: 0,
        totalSkipped: 0,
        chunks: 0,
        chunkResults: [],
      })
    } finally {
      setIsBackfilling(false)
    }
  }

  const isRunning = runState === 'running'

  return (
    <div className="space-y-4">
      <PageHeader
        title="材料費自動取得"
        subtitle="化研マテリアル 納品書 自動ダウンロード"
      />

      {/* PoC 制約ノート */}
      <div className="glass-card p-4 border-l-4 border-amber-400 flex gap-3">
        <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-amber-700">PoC 制約事項</p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-500">
            <li>サイトが PDF 専用のため <strong>グリッド直読み</strong> にフォールバックします（明細なし・合計金額のみ）</li>
            <li>品名は「<em>現場名 (伝票番号)</em>」で代替生成されます</li>
            <li>サーバーサイド日付フィルタが動作しないため、<strong>クライアントサイドで再フィルタ</strong>します</li>
            <li>グリッドは最大 <strong>20 行</strong> 表示のため、期間が長いと全件取得できない場合があります</li>
          </ul>
        </div>
      </div>

      {/* 設定パネル */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw size={16} className="text-violet-500" />
          <h2 className="font-bold text-slate-800 text-sm">取得設定</h2>
        </div>

        {/* 日付範囲 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">開始日</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
            />
          </div>
          <span className="text-slate-400 mt-5">〜</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">終了日</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50"
            />
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 mt-5 text-violet-600 text-sm">
              <Clock size={14} className="animate-pulse" />
              <span className="font-mono">{fmtSec(elapsedMs)}</span>
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleRun}
            disabled={isRunning || isBackfilling}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                実行中... ({fmtSec(elapsedMs)})
              </>
            ) : (
              <>
                <RefreshCw size={15} />
                材料費を更新する
              </>
            )}
          </button>

          <button
            onClick={handleProbe}
            disabled={isRunning || isBackfilling}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Search size={14} />
            画面確認（プローブ）
          </button>
        </div>
      </div>

      {/* バックフィルセクション */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-violet-500" />
          <h2 className="font-bold text-slate-800 text-sm">過去データ一括取込（バックフィル）</h2>
        </div>
        <p className="text-xs text-slate-500">7日単位でチャンク分割して過去6ヶ月分を取得します。時間がかかります（目安: 約20-25分）</p>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">開始日</label>
            <input type="date" value={bfDateFrom} onChange={(e) => setBfDateFrom(e.target.value)} disabled={isRunning || isBackfilling}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50" />
          </div>
          <span className="text-slate-400 mt-5">〜</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">終了日</label>
            <input type="date" value={bfDateTo} onChange={(e) => setBfDateTo(e.target.value)} disabled={isRunning || isBackfilling}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50" />
          </div>
        </div>
        <button onClick={handleBackfill} disabled={isRunning || isBackfilling}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          {isBackfilling ? <><RefreshCw size={15} className="animate-spin" />バックフィル実行中...</> : <><Database size={15} />半年分を取り込む</>}
        </button>
        {backfillResult && (
          <div className={`rounded-xl p-4 ${backfillResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-sm font-semibold ${backfillResult.success ? 'text-emerald-700' : 'text-red-700'}`}>{backfillResult.message}</p>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <StatBox label="取得件数" value={backfillResult.totalFetched} sub="件" color="slate" />
              <StatBox label="新規保存" value={backfillResult.totalInserted} sub="件" color="emerald" />
              <StatBox label="重複スキップ" value={backfillResult.totalSkipped} sub="件" color={backfillResult.totalSkipped > 0 ? 'amber' : 'slate'} />
            </div>
          </div>
        )}
      </div>

      {/* 実行結果サマリー */}
      {result && (
        <div
          className={`glass-card p-5 space-y-4 ${
            result.success ? 'border-l-4 border-emerald-400' : 'border-l-4 border-red-400'
          }`}
        >
          {/* ステータス行 */}
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle size={20} className="text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
                {result.message}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                期間: {result.dateFrom} 〜 {result.dateTo}
              </p>
            </div>
          </div>

          {/* 統計ボックス（成功時のみ） */}
          {result.success && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox
                label="取得件数"
                value={result.fetched}
                sub="フィルタ前"
                color="slate"
              />
              <StatBox
                label="新規保存"
                value={result.inserted}
                sub="件"
                color="emerald"
              />
              <StatBox
                label="重複スキップ"
                value={result.skipped}
                sub="件"
                color={result.skipped > 0 ? 'amber' : 'slate'}
              />
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex flex-col gap-0.5">
                <span className="text-xs text-slate-400">モード</span>
                <span className={`text-sm font-bold ${result.mode === 'grid_fallback' ? 'text-amber-600' : 'text-violet-600'}`}>
                  {result.mode === 'grid_fallback' ? 'グリッド' : 'CSV'}
                </span>
                <span className="text-xs text-slate-400">
                  {result.mode === 'grid_fallback' ? '直読み (FB)' : 'ダウンロード'}
                </span>
              </div>
            </div>
          )}

          {/* エラー詳細 */}
          {!result.success && result.errorDetail && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-700 font-mono whitespace-pre-wrap break-all">
              {result.errorDetail}
            </div>
          )}

          {/* 材料一覧へボタン */}
          {result.success && result.inserted > 0 && (
            <button
              onClick={() => navigate('/materials')}
              className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 font-medium transition-colors"
            >
              <Database size={14} />
              材料一覧で確認する
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* プローブ結果 */}
      {probeResult && (
        <div className="glass-card p-4 flex items-start gap-3 border-l-4 border-blue-400">
          <FileText size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-700">{probeResult.message}</p>
            {probeResult.files.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                保存先: storage/screenshots/ （{probeResult.files.length} 件）
              </p>
            )}
          </div>
        </div>
      )}

      {/* 実行ログ */}
      {logs.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <FileText size={14} className="text-slate-400" />
            <h2 className="font-bold text-slate-700 text-sm">実行ログ</h2>
          </div>
          <div className="p-4 font-mono text-xs space-y-1 max-h-72 overflow-y-auto bg-slate-900/5">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-slate-400 shrink-0">{log.time}</span>
                {log.type === 'success' && (
                  <CheckCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                )}
                {log.type === 'error' && (
                  <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                )}
                {log.type === 'warn' && (
                  <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                )}
                {log.type === 'info' && (
                  <span className="w-3 h-3 shrink-0" />
                )}
                <span
                  className={
                    log.type === 'error'
                      ? 'text-red-700'
                      : log.type === 'success'
                      ? 'text-emerald-700'
                      : log.type === 'warn'
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center gap-2 text-violet-600">
                <RefreshCw size={12} className="animate-spin" />
                <span>処理中...</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* 実行履歴 */}
      {runHistory.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <History size={14} className="text-slate-400" />
            <h2 className="font-bold text-slate-700 text-sm">実行履歴（直近{runHistory.length}件）</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {['種別', 'ステータス', '期間', '保存', '重複', '開始時刻'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {runHistory.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        run.run_type === 'auto' ? 'bg-blue-100 text-blue-700' :
                        run.run_type === 'backfill' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-600'}`}>
                        {run.run_type === 'auto' ? '自動' : run.run_type === 'backfill' ? 'バックフィル' : '手動'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={run.status === 'completed' ? 'text-emerald-600 font-medium' : run.status === 'failed' ? 'text-red-600 font-medium' : 'text-amber-600'}>
                        {run.status === 'completed' ? '完了' : run.status === 'failed' ? '失敗' : '実行中'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{run.date_from ?? '—'} 〜 {run.date_to ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-emerald-700">{run.inserted_count}</td>
                    <td className="px-4 py-2.5 text-amber-600">{run.skipped_count}</td>
                    <td className="px-4 py-2.5 text-slate-400">{new Date(run.started_at).toLocaleString('ja-JP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 統計ボックスコンポーネント ──────────────────────────────────
type BoxColor = 'slate' | 'emerald' | 'amber' | 'violet'

function StatBox({
  label, value, sub, color,
}: {
  label: string
  value: number
  sub: string
  color: BoxColor
}) {
  const colors: Record<BoxColor, string> = {
    slate:   'text-slate-700',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
    violet:  'text-violet-600',
  }
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-2xl font-bold ${colors[color]}`}>{value.toLocaleString()}</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </div>
  )
}
