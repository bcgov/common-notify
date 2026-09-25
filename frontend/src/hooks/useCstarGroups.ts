import { useEffect, useState } from 'react'
import { cstarApi } from '@/api/cstar.api'
import type { CstarGroup } from '@/api/cstar.api'
import { useAppSelector } from '@/redux/hooks'

/**
 * The selected tenant's CSTAR groups, for the group picker on an event's Email Notification tab.
 *
 * The list is tenant-scoped and the backend takes the tenant from the request header, so this
 * waits for a selected tenant and re-fetches when it changes.
 *
 * Failures are deliberately not surfaced: the form around the picker is still usable without the
 * list, and the page reports its own save errors.
 */
export function useCstarGroups(): CstarGroup[] {
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const [groups, setGroups] = useState<CstarGroup[]>([])

  useEffect(() => {
    if (!selectedTenantId) return

    let active = true

    cstarApi
      .fetchTenantGroups()
      .then((fetched) => {
        if (active) {
          setGroups(fetched)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [selectedTenantId])

  return groups
}
