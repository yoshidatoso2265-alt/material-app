import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { MobileHeader } from './MobileHeader'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* デスクトップ用サイドバー */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:z-50">
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* モバイル用オーバーレイサイドバー */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-72 flex flex-col">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* モバイルヘッダー */}
        <div className="lg:hidden">
          <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 animate-fade-in">
          {children}
        </main>

        {/* モバイル用ボトムナビ */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40">
          <MobileNav />
        </div>
      </div>
    </div>
  )
}
