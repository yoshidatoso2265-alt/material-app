import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  sub?: string
  icon: LucideIcon
  gradient: string   // Tailwind gradient classes
  iconColor: string  // Tailwind text color class
}

export function StatCard({ title, value, sub, icon: Icon, gradient, iconColor }: StatCardProps) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', gradient)}>
        <Icon size={22} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-500 text-xs font-medium mb-0.5">{title}</p>
        <p className="text-slate-900 text-2xl font-bold leading-tight truncate">{value}</p>
        {sub && <p className="text-slate-400 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
