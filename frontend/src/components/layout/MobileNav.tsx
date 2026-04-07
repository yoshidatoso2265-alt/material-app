import { NavLink } from 'react-router-dom'
import { BarChart2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/delivery-agg',     icon: BarChart2,       label: '集計' },
  { to: '/delivery-imports',  icon: Download,        label: '取込' },
]

export function MobileNav() {
  return (
    <nav className="glass-nav px-4 py-2 flex justify-around border-t border-white/10">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
              isActive
                ? 'bg-white/20 text-white'
                : 'text-white/50 hover:text-white'
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={18} className={isActive ? 'text-violet-300' : ''} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
