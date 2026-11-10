import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import adminTenantsReducer from '@/redux/slices/adminTenants.slice'
import { getAdminUsageTenants } from '@/api/apiKeyUsage.api'
import { useNotifyTenantNames } from './useNotifyTenantNames'

vi.mock('@/api/apiKeyUsage.api', () => ({ getAdminUsageTenants: vi.fn() }))
vi.mock('@/api/admin.api', () => ({ default: { getAllTenants: vi.fn() } }))

function setup(enabled?: boolean) {
  const store = configureStore({ reducer: { adminTenants: adminTenantsReducer } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return { store, wrapper, ...renderHook(() => useNotifyTenantNames(enabled), { wrapper }) }
}

describe('useNotifyTenantNames', () => {
  beforeEach(() => {
    vi.mocked(getAdminUsageTenants).mockReset()
  })

  it('fetches the names once and shares them with every screen that asks', async () => {
    vi.mocked(getAdminUsageTenants).mockResolvedValue([
      { id: 't-1', name: 'Parks' },
      { id: 't-2', name: 'Roads' },
    ])
    const { result, wrapper } = setup()

    await waitFor(() => expect(result.current).toEqual(['Parks', 'Roads']))
    const second = renderHook(() => useNotifyTenantNames(), { wrapper })
    expect(second.result.current).toEqual(['Parks', 'Roads'])
    expect(getAdminUsageTenants).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when disabled', () => {
    const { result } = setup(false)
    expect(result.current).toEqual([])
    expect(getAdminUsageTenants).not.toHaveBeenCalled()
  })

  it('leaves the names empty on failure, and tries again on the next mount, not in a loop', async () => {
    vi.mocked(getAdminUsageTenants).mockRejectedValueOnce(new Error('down'))
    const { result, store, wrapper } = setup()

    await waitFor(() => expect(store.getState().adminTenants.notifyOptionsRequested).toBe(false))
    expect(result.current).toEqual([])
    expect(getAdminUsageTenants).toHaveBeenCalledTimes(1)

    vi.mocked(getAdminUsageTenants).mockResolvedValue([{ id: 't-1', name: 'Parks' }])
    const next = renderHook(() => useNotifyTenantNames(), { wrapper })
    await waitFor(() => expect(next.result.current).toEqual(['Parks']))
    expect(getAdminUsageTenants).toHaveBeenCalledTimes(2)
  })
})
