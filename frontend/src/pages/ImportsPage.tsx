import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Upload, FileText, CloudUpload, Trash2, ChevronRight } from 'lucide-react'
import { importsApi, type MaterialImport } from '@/api/imports'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/common/Badge'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { formatDateTime, importStatusBadge } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Encoding = 'utf8' | 'shift_jis'

export default function ImportsPage() {
  const [imports, setImports] = useState<MaterialImport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [encoding, setEncoding] = useState<Encoding>('utf8')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchImports = () => {
    setLoading(true)
    importsApi.list({ limit: 30 })
      .then((r) => { setImports(r.data); setTotal(r.total) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchImports() }, [])

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setUploadResult({ success: false, message: 'CSVファイルを選択してください' })
      return
    }
    setUploading(true)
    setUploadResult(null)
    try {
      const result = await importsApi.upload(file, encoding)
      setUploadResult({
        success: true,
        message: `取込完了: ${result.rowCount}件 / エラー${result.errorCount}件 / 重複${result.duplicateCount}件`,
      })
      fetchImports()
    } catch (e) {
      setUploadResult({ success: false, message: (e as Error).message })
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('この取込記録を削除しますか？（論理削除）')) return
    await importsApi.softDelete(id)
    fetchImports()
  }

  return (
    <div className="space-y-4">
      <PageHeader title="CSV取込" subtitle={`取込履歴 ${total}件`} />

      {/* アップロードゾーン */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CloudUpload size={18} className="text-violet-500" />
          <h2 className="font-bold text-slate-800 text-sm">CSVファイルを取り込む</h2>
        </div>

        {/* エンコーディング選択 */}
        <div className="flex gap-3 flex-wrap">
          <label className="text-xs text-slate-600 font-medium self-center">文字コード:</label>
          {(['utf8', 'shift_jis'] as Encoding[]).map((enc) => (
            <label key={enc} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="encoding"
                value={enc}
                checked={encoding === enc}
                onChange={() => setEncoding(enc)}
                className="accent-violet-500"
              />
              <span className="text-sm text-slate-700">
                {enc === 'utf8' ? 'UTF-8（標準）' : 'Shift-JIS（旧システム）'}
              </span>
            </label>
          ))}
        </div>

        {/* ドラッグ&ドロップゾーン */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
            dragOver
              ? 'border-violet-400 bg-violet-50'
              : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/40'
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-violet-300/30 border-t-violet-500 rounded-full animate-spin" />
              <p className="text-violet-600 font-medium text-sm">取り込み中...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={28} className="text-slate-300" />
              <p className="text-slate-600 font-medium text-sm">
                CSVをドラッグ&ドロップ、またはタップして選択
              </p>
              <p className="text-slate-400 text-xs">最大10MB / .csvのみ</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 結果メッセージ */}
        {uploadResult && (
          <div className={cn(
            'px-4 py-3 rounded-xl text-sm font-medium',
            uploadResult.success
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          )}>
            {uploadResult.message}
          </div>
        )}
      </div>

      {/* 取込履歴 */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText size={16} className="text-slate-500" />
          <h2 className="font-bold text-slate-800 text-sm">取込履歴</h2>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : imports.length === 0 ? (
          <EmptyState icon={Upload} title="取込履歴がありません" description="CSVをアップロードしてください" />
        ) : (
          <div className="divide-y divide-slate-100">
            {imports.map((imp) => {
              const badge = importStatusBadge(imp.status)
              return (
                <div key={imp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-blue-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-slate-800 font-medium text-sm truncate max-w-[200px]">{imp.filename}</p>
                      <Badge className={badge.color}>{badge.label}</Badge>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {formatDateTime(imp.started_at)} · {imp.row_count}件
                      {imp.error_count > 0 && <span className="text-red-500 ml-1">エラー{imp.error_count}件</span>}
                      {imp.duplicate_count > 0 && <span className="text-amber-500 ml-1">重複{imp.duplicate_count}件</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      to={`/imports/${imp.id}`}
                      className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </Link>
                    <button
                      onClick={() => handleDelete(imp.id)}
                      className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="論理削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
