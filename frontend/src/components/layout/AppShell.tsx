import { MobileNav } from './MobileNav'
import { MobileHeader } from './MobileHeader'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ヘッダー（常時表示） */}
      <MobileHeader />

      {/* メインコンテンツ */}
      <main className="flex-1 p-4 pb-24 animate-fade-in">
        {children}
      </main>

      {/* ボトムナビ（常時表示） */}
      <div className="fixed bottom-0 inset-x-0 z-40">
        <MobileNav />
      </div>
    </div>
  )
}
