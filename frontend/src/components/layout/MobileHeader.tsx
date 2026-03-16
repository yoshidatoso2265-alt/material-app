import { Menu } from 'lucide-react'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="glass-nav px-4 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="text-white touch-target"
        aria-label="メニューを開く"
      >
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
          <span className="text-white text-xs font-bold">材</span>
        </div>
        <span className="text-white font-bold text-sm">材料費管理</span>
      </div>
    </header>
  )
}
