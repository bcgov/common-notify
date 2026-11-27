import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cstarApi } from '@/api/cstar.api'
import { useCstarGroups } from './useCstarGroups'

let tenantId: string | undefined
vi.mock('@/redux/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ tenant: { selectedTenant: tenantId ? { id: tenantId } : null } }),
}))
vi.mock('@/api/cstar.api', () => ({
  cstarApi: { fetchTenantGroupAvailability: vi.fn() },
}))

describe('CSTAR recipient availability', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    tenantId = 'tenant-a'
  })

  it('distinguishes disabled tools from an enabled tenant with no groups', async () => {
    vi.mocked(cstarApi.fetchTenantGroupAvailability).mockResolvedValue({
      groups: [],
      enabled: false,
    })
    const { result, rerender } = renderHook(() => useCstarGroups())
    await waitFor(() => expect(result.current.status).toBe('disabled'))
    vi.mocked(cstarApi.fetchTenantGroupAvailability).mockResolvedValue({
      groups: [],
      enabled: true,
    })
    tenantId = 'tenant-b'
    rerender()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('reports upstream failure instead of treating it as disablement', async () => {
    vi.mocked(cstarApi.fetchTenantGroupAvailability).mockRejectedValue(new Error('Bad gateway'))
    const { result } = renderHook(() => useCstarGroups())
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('clears previous tenant options and ignores a late response from that tenant', async () => {
    let finish!: (value: { groups: []; enabled: boolean }) => void
    vi.mocked(cstarApi.fetchTenantGroupAvailability)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce({ groups: [{ id: 'b', name: 'B', description: '' }], enabled: true })
    const { result, rerender } = renderHook(() => useCstarGroups())
    tenantId = 'tenant-b'
    rerender()
    expect(result.current.groups).toEqual([])
    await waitFor(() => expect(result.current.groups[0]?.id).toBe('b'))
    await act(async () => {
      finish({ groups: [], enabled: false })
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.groups[0]?.id).toBe('b')
  })
})
