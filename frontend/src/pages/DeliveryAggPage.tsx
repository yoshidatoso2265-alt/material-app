import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronLeft, Building2, User, CalendarDays, Package, Truck, Search, X } from 'lucide-react'
import { formatCurrency, formatDate, hankakuToZenkaku, fuzzyMatch } from '@/lib/utils'
import {
  deliveryImportsApi,
  type SiteSummaryRow,
  type PersonSummaryRow,
  type DateSummaryRow,
  type ItemSummaryRow,
  type SiteItemSummaryRow,
  type DeliveryImportListItem,
  type DeliveryImportDetail,
} from '@/api/deliveryImports'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

// ============================================================
// 型・ユーティリティ
// ============================================================

type TopTab = 'site' | 'person' | 'date' | 'item'

type View =
  | { type: 'top' }
  | { type: 'site_detail'; site: SiteSummaryRow }
  | { type: 'person_detail'; person: PersonSummaryRow }
  | { type: 'date_detail'; date: string }
  | { type: 'delivery_detail'; importItem: DeliveryImportListItem; backTo: View }

type DateFilter =
  | { mode: 'month'; year: number; month: number }
  | { mode: 'all' }

function filterToDates(f: DateFilter): { date_from?: string; date_to?: string } {
  if (f.mode === 'all') return {}
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(f.year, f.month, 0).getDate()
  return {
    date_from: `${f.year}-${pad(f.month)}-01`,
    date_to: `${f.year}-${pad(f.month)}-${pad(lastDay)}`,
  }
}

function filterLabel(f: DateFilter): string {
  if (f.mode === 'all') return '全期間'
  return `${f.year}年${f.month}月`
}

// ============================================================
// DateFilterBar
// ============================================================

function DateFilterBar({
  filter,
  onChange,
}: {
  filter: DateFilter
  onChange: (f: DateFilter) => void
}) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  const isActive = (f: DateFilter) => {
    if (filter.mode === 'all' && f.mode === 'all') return true
    if (filter.mode === 'month' && f.mode === 'month') {
      return filter.year === f.year && filter.month === f.month
    }
    return false
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onChange({ mode: 'all' })}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          isActive({ mode: 'all' })
            ? 'bg-white/30 text-white'
            : 'bg-white/10 text-white/60 hover:bg-white/15'
        }`}
      >
        全期間
      </button>
      {months.map((m) => {
        const f: DateFilter = { mode: 'month', year: m.year, month: m.month }
        return (
          <button
            key={`${m.year}-${m.month}`}
            onClick={() => onChange(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isActive(f)
                ? 'bg-white/30 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/15'
            }`}
          >
            {m.month}月
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// SearchInput
// ============================================================

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative mb-3">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/10 text-white text-sm rounded-xl pl-9 pr-8 py-2.5 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ============================================================
// TopTabBar
// ============================================================

function TopTabBar({
  active,
  onChange,
}: {
  active: TopTab
  onChange: (t: TopTab) => void
}) {
  const tabs: { id: TopTab; label: string; icon: React.ReactNode }[] = [
    { id: 'site',   label: '現場',  icon: <Building2 size={13} /> },
    { id: 'item',   label: '材料',  icon: <Package size={13} /> },
    { id: 'person', label: '担当者', icon: <User size={13} /> },
    { id: 'date',   label: '日付',  icon: <CalendarDays size={13} /> },
  ]
  return (
    <div className="bg-white/10 rounded-xl p-1 flex gap-1 mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
            active === t.id ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'
          }`}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================
// SiteListView
// ============================================================

function SiteListView({
  dateFilter,
  personFilter,
  onSelect,
}: {
  dateFilter: DateFilter
  personFilter?: string
  onSelect: (s: SiteSummaryRow) => void
}) {
  const [sites, setSites] = useState<SiteSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    deliveryImportsApi
      .summaryBySite({ ...filterToDates(dateFilter), person_name: personFilter })
      .then((r) => setSites(r.data))
      .finally(() => setLoading(false))
  }, [dateFilter, personFilter])

  const filtered = useMemo(
    () => sites.filter((s) => fuzzyMatch(query, s.site_name || '')),
    [sites, query]
  )

  if (loading) return <div className="flex justify-center py-10"><LoadingSpinner /></div>

  return (
    <>
      {!personFilter && (
        <SearchInput value={query} onChange={setQuery} placeholder="現場名であいまい検索..." />
      )}
      {filtered.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-10">
          {query ? '一致する現場がありません' : 'データなし'}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {filtered.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelect(s)}
                className="w-full bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/15 active:bg-white/20 transition-colors"
              >
                <div className="text-left flex-1 min-w-0 mr-2">
                  <p className="text-white font-medium text-sm truncate">{s.site_name || '（現場名なし）'}</p>
                  <p className="text-white/50 text-xs mt-0.5">{s.import_count}件 · {s.item_count}品目</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-white font-bold text-sm">{formatCurrency(s.total_amount)}</span>
                  <ChevronRight size={16} className="text-white/40" />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 bg-white/20 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-white/70 text-sm font-medium">合計</span>
            <span className="text-white font-bold text-base">
              {formatCurrency(filtered.reduce((sum, s) => sum + s.total_amount, 0))}
            </span>
          </div>
        </>
      )}
    </>
  )
}

// ============================================================
// PersonListView
// ============================================================

function PersonListView({
  dateFilter,
  onSelect,
}: {
  dateFilter: DateFilter
  onSelect: (p: PersonSummaryRow) => void
}) {
  const [persons, setPersons] = useState<PersonSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    deliveryImportsApi
      .summaryByPerson(filterToDates(dateFilter))
      .then((r) => setPersons(r.data))
      .finally(() => setLoading(false))
  }, [dateFilter])

  if (loading) return <div className="flex justify-center py-10"><LoadingSpinner /></div>
  if (persons.length === 0) return <p className="text-white/40 text-sm text-center py-10">データなし</p>

  return (
    <>
      <div className="space-y-1">
        {persons.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(p)}
            className="w-full bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/15 active:bg-white/20 transition-colors"
          >
            <div className="text-left flex-1 min-w-0 mr-2">
              <p className="text-white font-medium text-sm truncate">{p.raw_person_name || '（担当者なし）'}</p>
              <p className="text-white/50 text-xs mt-0.5">{p.import_count}件</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-white font-bold text-sm">{formatCurrency(p.total_amount)}</span>
              <ChevronRight size={16} className="text-white/40" />
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 bg-white/20 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-white/70 text-sm font-medium">合計</span>
        <span className="text-white font-bold text-base">
          {formatCurrency(persons.reduce((sum, p) => sum + p.total_amount, 0))}
        </span>
      </div>
    </>
  )
}

// ============================================================
// DateListView
// ============================================================

function DateListView({
  dateFilter,
  onSelect,
}: {
  dateFilter: DateFilter
  onSelect: (date: string) => void
}) {
  const [dates, setDates] = useState<DateSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    deliveryImportsApi
      .summaryByDate(filterToDates(dateFilter))
      .then((r) => setDates(r.data))
      .finally(() => setLoading(false))
  }, [dateFilter])

  if (loading) return <div className="flex justify-center py-10"><LoadingSpinner /></div>
  if (dates.length === 0) return <p className="text-white/40 text-sm text-center py-10">データなし</p>

  return (
    <>
      <div className="space-y-1">
        {dates.map((d, i) => (
          <button
            key={i}
            onClick={() => onSelect(d.delivery_date)}
            className="w-full bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/15 active:bg-white/20 transition-colors"
          >
            <div className="text-left">
              <p className="text-white font-medium text-sm">{formatDate(d.delivery_date)}</p>
              <p className="text-white/50 text-xs mt-0.5">{d.import_count}件</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-white font-bold text-sm">{formatCurrency(d.total_amount)}</span>
              <ChevronRight size={16} className="text-white/40" />
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 bg-white/20 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-white/70 text-sm font-medium">合計</span>
        <span className="text-white font-bold text-base">
          {formatCurrency(dates.reduce((sum, d) => sum + d.total_amount, 0))}
        </span>
      </div>
    </>
  )
}

// ============================================================
// ItemListView（材料別集計 トップレベル）
// ============================================================

function ItemListView({
  dateFilter,
}: {
  dateFilter: DateFilter
}) {
  const [items, setItems] = useState<ItemSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    deliveryImportsApi
      .summaryByItem(filterToDates(dateFilter))
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false))
  }, [dateFilter])

  const filtered = useMemo(
    () => items.filter((it) => fuzzyMatch(query, it.item_name_raw || '')),
    [items, query]
  )

  if (loading) return <div className="flex justify-center py-10"><LoadingSpinner /></div>

  return (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder="材料名であいまい検索..." />
      {filtered.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-10">
          {query ? '一致する材料がありません' : 'データなし'}
        </p>
      ) : (
        <>
          <div className="bg-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
            {filtered.map((it, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm leading-snug">{hankakuToZenkaku(it.item_name_raw)}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {it.avg_unit_price != null && it.total_qty != null
                        ? `${formatCurrency(it.avg_unit_price)}/${it.unit || '個'} × ${it.total_qty}${it.unit || '個'}`
                        : `${it.delivery_count}回 · ${it.site_count}現場`}
                    </p>
                    <p className="text-white/30 text-xs mt-0.5">
                      {it.first_delivery_date === it.last_delivery_date
                        ? formatDate(it.first_delivery_date || '')
                        : `${formatDate(it.first_delivery_date || '')} 〜 ${formatDate(it.last_delivery_date || '')}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-white font-bold text-sm">{formatCurrency(it.total_amount_in_tax)}</span>
                    <p className="text-white/30 text-xs mt-0.5">
                      税抜 {formatCurrency(it.total_amount_ex_tax)} + 税 {formatCurrency(it.total_tax)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-white/20 rounded-xl px-4 py-3">
            <div className="flex justify-between items-center">
              <span className="text-white/70 text-sm font-medium">合計（税込）</span>
              <span className="text-white font-bold text-base">
                {formatCurrency(filtered.reduce((sum, it) => sum + it.total_amount_in_tax, 0))}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-white/40 text-xs">税抜</span>
              <span className="text-white/50 text-xs">
                {formatCurrency(filtered.reduce((sum, it) => sum + it.total_amount_ex_tax, 0))}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-xs">消費税</span>
              <span className="text-white/50 text-xs">
                {formatCurrency(filtered.reduce((sum, it) => sum + it.total_tax, 0))}
              </span>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ============================================================
// SiteItemsView（現場の資材集計）
// ============================================================

function SiteItemsView({
  siteName,
  dateFilter,
}: {
  siteName: string
  dateFilter: DateFilter
}) {
  const [items, setItems] = useState<SiteItemSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    deliveryImportsApi
      .summarySiteItems({ site_name: siteName, ...filterToDates(dateFilter) })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false))
  }, [siteName, dateFilter])

  if (loading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>
  if (items.length === 0) return <p className="text-white/40 text-sm text-center py-6">明細なし</p>

  const materials = items.filter((it) => it.is_freight === 0 && it.is_misc_charge === 0)
  const extras    = items.filter((it) => it.is_freight === 1 || it.is_misc_charge === 1)

  const renderItem = (it: SiteItemSummaryRow, idx: number) => (
    <div key={idx} className="px-4 py-3">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm leading-snug">{hankakuToZenkaku(it.item_name)}</p>
          {it.spec && <p className="text-white/50 text-xs mt-0.5 leading-snug">{it.spec}</p>}
          {it.avg_unit_price != null && it.total_qty != null ? (
            <p className="text-white/40 text-xs mt-0.5">
              {formatCurrency(it.avg_unit_price)}/{it.unit || '個'} × {it.total_qty}{it.unit || '個'} · {it.delivery_count}回
            </p>
          ) : it.total_qty != null && it.unit != null ? (
            <p className="text-white/40 text-xs mt-0.5">合計 {it.total_qty}{it.unit} · {it.delivery_count}回</p>
          ) : (
            <p className="text-white/40 text-xs mt-0.5">{it.delivery_count}回</p>
          )}
          <p className="text-white/30 text-xs mt-0.5">
            {it.first_delivery_date === it.last_delivery_date
              ? formatDate(it.first_delivery_date || '')
              : `${formatDate(it.first_delivery_date || '')} 〜 ${formatDate(it.last_delivery_date || '')}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-white font-bold text-sm">{formatCurrency(it.total_amount_in_tax)}</span>
          <p className="text-white/30 text-xs mt-0.5">
            税抜 {formatCurrency(it.total_amount_ex_tax)} + 税 {formatCurrency(it.total_tax)}
          </p>
        </div>
      </div>
    </div>
  )

  const allItems = [...materials, ...extras]
  const totalExTax = allItems.reduce((s, it) => s + it.total_amount_ex_tax, 0)
  const totalTax = allItems.reduce((s, it) => s + it.total_tax, 0)
  const totalInTax = allItems.reduce((s, it) => s + it.total_amount_in_tax, 0)

  return (
    <div>
      {materials.length > 0 && (
        <div className="bg-white/10 rounded-xl overflow-hidden divide-y divide-white/10 mb-3">
          {materials.map(renderItem)}
        </div>
      )}
      {extras.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <Truck size={12} className="text-white/30" />
            <p className="text-white/40 text-xs">運賃・割増</p>
          </div>
          <div className="bg-white/10 rounded-xl overflow-hidden divide-y divide-white/10 opacity-70 mb-3">
            {extras.map(renderItem)}
          </div>
        </>
      )}
      <div className="bg-white/20 rounded-xl px-4 py-3">
        <div className="flex justify-between items-center">
          <span className="text-white/70 text-sm font-medium">合計（税込）</span>
          <span className="text-white font-bold text-base">{formatCurrency(totalInTax)}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-white/40 text-xs">税抜</span>
          <span className="text-white/50 text-xs">{formatCurrency(totalExTax)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-white/40 text-xs">消費税</span>
          <span className="text-white/50 text-xs">{formatCurrency(totalTax)}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SiteHistoryView（現場の納品履歴）
// ============================================================

function SiteHistoryView({
  siteName,
  dateFilter,
  onSelect,
}: {
  siteName: string
  dateFilter: DateFilter
  onSelect: (imp: DeliveryImportListItem) => void
}) {
  const [imports, setImports] = useState<DeliveryImportListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = siteName === '現場未分類'
      ? { no_site_name: true, limit: 200, ...filterToDates(dateFilter) }
      : { raw_site_name: siteName, limit: 200, ...filterToDates(dateFilter) }
    deliveryImportsApi.list(params)
      .then((r) => setImports(r.data))
      .finally(() => setLoading(false))
  }, [siteName, dateFilter])

  if (loading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>
  if (imports.length === 0) return <p className="text-white/40 text-sm text-center py-6">データなし</p>

  return (
    <div className="space-y-1">
      {imports.map((imp) => (
        <button
          key={imp.id}
          onClick={() => onSelect(imp)}
          className="w-full bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/15 active:bg-white/20 transition-colors"
        >
          <div className="text-left">
            <p className="text-white text-sm">{formatDate(imp.delivery_date)}</p>
            <p className="text-white/50 text-xs mt-0.5">
              {imp.raw_person_name || '−'} · {imp.line_count}品目
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-white font-bold text-sm">
              {imp.total_amount_in_tax != null ? formatCurrency(imp.total_amount_in_tax) : '−'}
            </span>
            <ChevronRight size={16} className="text-white/40" />
          </div>
        </button>
      ))}
    </div>
  )
}

// ============================================================
// SiteDetailView（資材タブ + 履歴タブ）
// ============================================================

type SiteMiniTab = 'items' | 'history'

function SiteDetailView({
  site,
  dateFilter,
  onSelectDelivery,
  onBack,
}: {
  site: SiteSummaryRow
  dateFilter: DateFilter
  onSelectDelivery: (imp: DeliveryImportListItem) => void
  onBack: () => void
}) {
  const [miniTab, setMiniTab] = useState<SiteMiniTab>('items')

  return (
    <>
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="p-1 -ml-1 text-white/60 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base truncate">{site.site_name || '（現場名なし）'}</h2>
          <p className="text-white/50 text-xs">{filterLabel(dateFilter)} · {site.import_count}件</p>
        </div>
        <span className="text-white font-bold text-sm shrink-0">{formatCurrency(site.total_amount)}</span>
      </div>

      {/* ミニタブ */}
      <div className="bg-white/10 rounded-lg p-0.5 flex gap-0.5 mb-3">
        {([
          { id: 'items' as const, label: '資材', icon: <Package size={11} /> },
          { id: 'history' as const, label: '履歴', icon: <CalendarDays size={11} /> },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setMiniTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              miniTab === t.id ? 'bg-white/20 text-white' : 'text-white/50'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {miniTab === 'items' && (
        <SiteItemsView siteName={site.site_name} dateFilter={dateFilter} />
      )}
      {miniTab === 'history' && (
        <SiteHistoryView siteName={site.site_name} dateFilter={dateFilter} onSelect={onSelectDelivery} />
      )}
    </>
  )
}

// ============================================================
// PersonDetailView
// ============================================================

function PersonDetailView({
  person,
  dateFilter,
  onSelectSite,
  onBack,
}: {
  person: PersonSummaryRow
  dateFilter: DateFilter
  onSelectSite: (s: SiteSummaryRow) => void
  onBack: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="p-1 -ml-1 text-white/60 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-base truncate">{person.raw_person_name || '（担当者なし）'}</h2>
          <p className="text-white/50 text-xs">{filterLabel(dateFilter)} · {person.import_count}件</p>
        </div>
        <span className="text-white font-bold text-sm shrink-0">{formatCurrency(person.total_amount)}</span>
      </div>
      <SiteListView
        dateFilter={dateFilter}
        personFilter={person.raw_person_name}
        onSelect={onSelectSite}
      />
    </>
  )
}

// ============================================================
// DateDetailView
// ============================================================

function DateDetailView({
  date,
  onSelectDelivery,
  onBack,
}: {
  date: string
  onSelectDelivery: (imp: DeliveryImportListItem) => void
  onBack: () => void
}) {
  const [imports, setImports] = useState<DeliveryImportListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    deliveryImportsApi
      .list({ date_from: date, date_to: date, limit: 100 })
      .then((r) => setImports(r.data))
      .finally(() => setLoading(false))
  }, [date])

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="p-1 -ml-1 text-white/60 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-white font-bold text-base">{formatDate(date)}</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner /></div>
      ) : imports.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-6">データなし</p>
      ) : (
        <div className="space-y-1">
          {imports.map((imp) => (
            <button
              key={imp.id}
              onClick={() => onSelectDelivery(imp)}
              className="w-full bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/15 active:bg-white/20 transition-colors"
            >
              <div className="text-left flex-1 min-w-0 mr-2">
                <p className="text-white text-sm truncate">{imp.raw_site_name || '（現場名なし）'}</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {imp.raw_person_name || '−'} · {imp.line_count}品目
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-white font-bold text-sm">
                  {imp.total_amount_in_tax != null ? formatCurrency(imp.total_amount_in_tax) : '−'}
                </span>
                <ChevronRight size={16} className="text-white/40" />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ============================================================
// DeliveryDetailView（納品明細）
// ============================================================

function DeliveryDetailView({
  importItem,
  onBack,
}: {
  importItem: DeliveryImportListItem
  onBack: () => void
}) {
  const [detail, setDetail] = useState<DeliveryImportDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    deliveryImportsApi.getById(importItem.id)
      .then((r) => setDetail(r.data))
      .finally(() => setLoading(false))
  }, [importItem.id])

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="p-1 -ml-1 text-white/60 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-sm truncate">{importItem.raw_site_name || '（現場名なし）'}</h2>
          <p className="text-white/50 text-xs">{formatDate(importItem.delivery_date)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner /></div>
      ) : !detail ? (
        <p className="text-white/40 text-sm text-center py-6">データなし</p>
      ) : (
        <>
          <div className="bg-white/15 rounded-xl px-4 py-3 flex justify-between mb-3">
            <span className="text-white/70 text-sm">税込合計</span>
            <span className="text-white font-bold">
              {detail.total_amount_in_tax != null ? formatCurrency(detail.total_amount_in_tax) : '−'}
            </span>
          </div>

          <div className="bg-white/10 rounded-xl overflow-hidden divide-y divide-white/10">
            {detail.lines.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-4">明細なし</p>
            ) : detail.lines.map((line) => (
              <div key={line.id} className="px-4 py-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm leading-snug">
                      {hankakuToZenkaku(line.item_name_normalized || line.item_name_raw) || '−'}
                    </p>
                    {line.spec_raw && <p className="text-white/50 text-xs mt-0.5">{line.spec_raw}</p>}
                    {line.quantity != null && (
                      <p className="text-white/40 text-xs mt-0.5">
                        {line.quantity}{line.unit}
                        {line.unit_price != null ? ` × ${formatCurrency(line.unit_price)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-white font-semibold text-sm shrink-0">
                    {line.amount_ex_tax != null ? formatCurrency(line.amount_ex_tax) : '−'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ============================================================
// メインページ
// ============================================================

export default function DeliveryAggPage() {
  const [view, setView] = useState<View>({ type: 'top' })
  const [activeTab, setActiveTab] = useState<TopTab>('site')
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const now = new Date()
    return { mode: 'month', year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  const isTop = view.type === 'top'

  const handleDateFilterChange = (f: DateFilter) => {
    setDateFilter(f)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* タイトル（topでは非表示、詳細画面ではヘッダーに組み込み済み） */}
      {isTop && (
        <h1 className="text-xl font-bold text-white mb-3">材料費集計</h1>
      )}

      {/* 月フィルタ（常時表示） */}
      <div className="mb-3">
        <DateFilterBar filter={dateFilter} onChange={handleDateFilterChange} />
      </div>

      {/* タブ（top のみ表示） */}
      {isTop && (
        <TopTabBar active={activeTab} onChange={setActiveTab} />
      )}

      {/* コンテンツ */}
      {view.type === 'top' && activeTab === 'site' && (
        <SiteListView
          dateFilter={dateFilter}
          onSelect={(site) => setView({ type: 'site_detail', site })}
        />
      )}

      {view.type === 'top' && activeTab === 'item' && (
        <ItemListView dateFilter={dateFilter} />
      )}

      {view.type === 'top' && activeTab === 'person' && (
        <PersonListView
          dateFilter={dateFilter}
          onSelect={(person) => setView({ type: 'person_detail', person })}
        />
      )}

      {view.type === 'top' && activeTab === 'date' && (
        <DateListView
          dateFilter={dateFilter}
          onSelect={(date) => setView({ type: 'date_detail', date })}
        />
      )}

      {view.type === 'site_detail' && (
        <SiteDetailView
          site={view.site}
          dateFilter={dateFilter}
          onSelectDelivery={(imp) =>
            setView({ type: 'delivery_detail', importItem: imp, backTo: view })
          }
          onBack={() => setView({ type: 'top' })}
        />
      )}

      {view.type === 'person_detail' && (
        <PersonDetailView
          person={view.person}
          dateFilter={dateFilter}
          onSelectSite={(site) => setView({ type: 'site_detail', site })}
          onBack={() => setView({ type: 'top' })}
        />
      )}

      {view.type === 'date_detail' && (
        <DateDetailView
          date={view.date}
          onSelectDelivery={(imp) =>
            setView({ type: 'delivery_detail', importItem: imp, backTo: view })
          }
          onBack={() => setView({ type: 'top' })}
        />
      )}

      {view.type === 'delivery_detail' && (
        <DeliveryDetailView
          importItem={view.importItem}
          onBack={() => setView(view.backTo)}
        />
      )}
    </div>
  )
}
