import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  children?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Icon size={24} className="text-slate-400" />
      </div>
      <div>
        <p className="text-slate-600 font-medium">{title}</p>
        {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
      </div>
      {children}
    </div>
  )
}
