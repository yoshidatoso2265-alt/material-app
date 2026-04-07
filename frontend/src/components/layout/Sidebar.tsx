import { NavLink } from 'react-router-dom'
import {
  Download,
  X,
  BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/delivery-imports', icon: Download,   label: '取込' },
  { to: '/delivery-agg',    icon: BarChart2,   label: '材料費集計' },
]

interface SidebarProps {
  onClose: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <div className="glass-sidebar flex flex-col h-full">
      {/* ロゴ */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg">
              <span className="text-white text-xs font-bold">材</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">材料費管理</p>
              <p className="text-white/40 text-xs">irodori system</p>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-white/50 hover:text-white touch-target px-2"
          aria-label="メニューを閉じる"
        >
          <X size={18} />
        </button>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all touch-target',
                isActive
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={18}
                  className={isActive ? 'text-violet-300' : 'text-white/50'}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* フッター */}
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-white/30 text-xs text-center">MVP v1.0</p>
      </div>
    </div>
  )
}
