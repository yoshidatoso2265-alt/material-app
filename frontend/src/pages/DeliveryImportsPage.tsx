import { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { deliveryImportsApi, type DeliveryImportListItem } from '@/api/deliveryImports'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

export default function DeliveryImportsPage() {
  const [imports, setImports] = useState<DeliveryImportListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    deliveryImportsApi.list({ limit: 200, page: 1 })
      .then(r => setImports(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white">納品書</h1>

      {/* 取込済みリスト */}
      <section>
        <h2 className="text-white/60 text-xs font-medium uppercase tracking-wide mb-2">取込済み ({imports.length}件)</h2>
        {loading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : imports.length === 0 ? (
          <p className="text-center text-white/40 py-8">データなし</p>
        ) : (
          <div className="space-y-2">
            {imports.map((di) => (
              <a
                key={di.id}
                href={`/delivery-imports/${di.id}`}
                className="block bg-white/10 rounded-xl px-4 py-3 hover:bg-white/15 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{di.raw_site_name || '(現場名なし)'}</p>
                    <p className="text-white/50 text-xs">
                      {di.delivery_date ? formatDate(di.delivery_date) : ''} · {di.raw_person_name || ''}
                    </p>
                  </div>
                  <p className="text-white font-bold text-sm">
                    {di.total_amount_ex_tax != null ? formatCurrency(di.total_amount_ex_tax) : ''}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
