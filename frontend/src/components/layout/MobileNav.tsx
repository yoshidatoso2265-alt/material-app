import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/delivery-agg',     label: '集計' },
  { to: '/delivery-imports', label: '取込' },
]

export function MobileNav() {
  return (
    <nav className="glass-nav px-4 py-2 flex justify-around border-t border-white/10">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'px-8 py-2 rounded-xl text-sm font-medium transition-all',
              isActive
                ? 'bg-white/20 text-white'
                : 'text-white/50 hover:text-white'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
