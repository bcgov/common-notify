import { useEffect, useState } from 'react'
import { cstarApi } from '@/api/cstar.api'
import type { CstarGroup } from '@/api/cstar.api'
import { useAppSelector } from '@/redux/hooks'

export type CstarGroupsStatus = 'loading' | 'ready' | 'disabled' | 'error'

/** Load tenant-scoped options and distinguish operator disablement from lookup failure. */
export function useCstarGroups() {
  const tenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const [state, setState] = useState<{
    tenantId: string | undefined
    groups: CstarGroup[]
    status: CstarGroupsStatus
  }>({ tenantId: undefined, groups: [], status: 'loading' })

  useEffect(() => {
    if (!tenantId) return
    let active = true
    cstarApi.fetchTenantGroupAvailability().then(
      ({ groups, enabled }) => {
        if (active) setState({ tenantId, groups, status: enabled ? 'ready' : 'disabled' })
      },
      () => {
        if (active) setState({ tenantId, groups: [], status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [tenantId])

  return state.tenantId === tenantId && tenantId
    ? state
    : { groups: [], status: 'loading' as const }
}
