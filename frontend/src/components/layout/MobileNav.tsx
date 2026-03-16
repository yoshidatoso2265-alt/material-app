import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, MapPin, Upload, GitMerge } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/',          icon: LayoutDashboard, label: 'ホーム',   end: true },
  { to: '/materials', icon: Package,         label: '材料' },
  { to: '/sites',     icon: MapPin,          label: '現場' },
  { to: '/imports',   icon: Upload,          label: '取込' },
  { to: '/alias-review', icon: GitMerge,    label: 'ゆれ確認' },
]

export function MobileNav() {
  return (
    <nav className="glass-nav px-2 py-2">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-xs font-medium transition-all min-w-[52px] touch-target justify-center',
                isActive
                  ? 'text-violet-300'
                  : 'text-white/50 hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} className={isActive ? 'text-violet-300' : ''} />
                <span className="text-[10px]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
