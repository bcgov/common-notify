import { useEffect, useState } from 'react'
import { getAdminNotification, listAdminDeliveries } from '@/api/adminNotifications.api'
import type { AdminDelivery, AdminNotificationDetail } from '@/api/adminNotifications.api'
import { showErrorToast } from '@/redux/utils/toastUtils'

/**
 * One request's detail, loaded once. Only its page reads it, so it is fetched here rather than
 * through a slice; the route keys the page by id, so a new id is a new mount.
 */
export function useAdminNotification(id: string) {
  const [detail, setDetail] = useState<AdminNotificationDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    getAdminNotification(id)
      .then((result) => current && setDetail(result))
      .catch((error_: Error) => current && setError(error_.message))
    return () => {
      current = false
    }
  }, [id])

  return { detail, error }
}

interface DeliveryPage {
  query: string
  rows: AdminDelivery[]
  count: number
}

const toFilterParams = (filters: Record<string, string[]>) =>
  Object.entries(filters).map(([field, values]) => `${field}:in:${values.join('|')}`)

/** Without its value when it has none; with it otherwise. */
function withFilter(filters: Record<string, string[]>, field: string, values: string[]) {
  const next = { ...filters }
  if (values.length > 0) next[field] = values
  else delete next[field]
  return next
}

/** A request's deliveries, a page at a time, refetched as the page or filters change. */
export function useAdminDeliveries(id: string) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const query = JSON.stringify({ page, limit, filters })
  const [loaded, setLoaded] = useState<DeliveryPage | null>(null)

  useEffect(() => {
    let current = true
    const keep = (previous: DeliveryPage | null): DeliveryPage => ({
      query,
      rows: previous?.rows ?? [],
      count: previous?.count ?? 0,
    })
    listAdminDeliveries(id, { page, limit, filter: toFilterParams(filters) })
      .then((result) => current && setLoaded({ query, rows: result.data, count: result.count }))
      .catch((error_: Error) => {
        if (!current) return
        showErrorToast(error_.message, undefined, { toastId: 'admin-deliveries-error' })
        // Keep the rows on screen, but stop showing them as loading.
        setLoaded(keep)
      })
    return () => {
      current = false
    }
  }, [id, page, limit, filters, query])

  return {
    rows: loaded?.rows ?? [],
    count: loaded?.count ?? 0,
    // Loading until the rows held are the ones for the current page and filters.
    isLoading: loaded?.query !== query,
    page,
    limit,
    filters,
    setPage,
    setLimit: (next: number) => {
      setLimit(next)
      setPage(1)
    },
    setFilter: (field: string, values: string[]) => {
      setFilters((previous) => withFilter(previous, field, values))
      setPage(1)
    },
  }
}
