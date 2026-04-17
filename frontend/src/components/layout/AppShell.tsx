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
      <main className="flex-1 p-4 pb-6 animate-fade-in">
        {children}
      </main>
    </div>
  )
}
