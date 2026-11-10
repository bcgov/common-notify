import { useEffect, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchNotifyTenantOptions } from '@/redux/thunks/adminTenants.thunks'

/**
 * Names of the tenants with Notify connected, for an admin tenant search's suggestions. Fetched
 * once into the store and shared by every screen that asks.
 *
 * @param enabled False to skip the fetch, for a user who isn't an admin
 */
export function useNotifyTenantNames(enabled = true): string[] {
  const dispatch = useAppDispatch()
  const options = useAppSelector((state) => state.adminTenants.notifyOptions)

  // On mount only; the thunk skips the request once the store has it. A failure is retried on the
  // next mount rather than straight away, so a down endpoint isn't hammered.
  useEffect(() => {
    if (enabled) dispatch(fetchNotifyTenantOptions())
  }, [enabled, dispatch])

  return useMemo(() => options.map((tenant) => tenant.name), [options])
}
