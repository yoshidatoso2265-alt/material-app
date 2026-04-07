import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
// DashboardPage は現在未使用（取込ページにリダイレクト）
import MaterialsPage from '@/pages/MaterialsPage'
import SitesPage from '@/pages/SitesPage'
import SiteDetailPage from '@/pages/SiteDetailPage'
import ImportsPage from '@/pages/ImportsPage'
import ImportDetailPage from '@/pages/ImportDetailPage'
import AliasReviewPage from '@/pages/AliasReviewPage'
import ScraperPage from '@/pages/ScraperPage'
import SiteAggDetailPage from '@/pages/SiteAggDetailPage'
import DeliveryImportsPage from '@/pages/DeliveryImportsPage'
import DeliveryImportDetailPage from '@/pages/DeliveryImportDetailPage'
import UnmatchedSitesPage from '@/pages/UnmatchedSitesPage'
import DeliveryAggPage from '@/pages/DeliveryAggPage'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/delivery-imports" replace />} />
          <Route path="/dashboard" element={<Navigate to="/delivery-imports" replace />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/agg/:siteName" element={<SiteAggDetailPage />} />
          <Route path="/sites/:id" element={<SiteDetailPage />} />
          <Route path="/imports" element={<ImportsPage />} />
          <Route path="/imports/:id" element={<ImportDetailPage />} />
          <Route path="/alias-review" element={<AliasReviewPage />} />
          <Route path="/scraper" element={<ScraperPage />} />
          {/* 納品書PDF取込 - /unmatched は /:id より先に */}
          <Route path="/delivery-imports/unmatched" element={<UnmatchedSitesPage />} />
          <Route path="/delivery-imports/:id" element={<DeliveryImportDetailPage />} />
          <Route path="/delivery-imports" element={<DeliveryImportsPage />} />
          <Route path="/delivery-agg" element={<DeliveryAggPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
