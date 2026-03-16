export function LoadingSpinner({ text = '読み込み中...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-3 border-violet-300/30 border-t-violet-400 rounded-full animate-spin" />
      <p className="text-white/60 text-sm">{text}</p>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="glass-card p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-1/2" />
    </div>
  )
}
