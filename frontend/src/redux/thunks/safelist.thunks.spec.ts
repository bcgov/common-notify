import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSafelistEntry, fetchSafelist, removeSafelistEntry } from './safelist.thunks'
import { deleteMethod, get, post } from '@/common/api'
import type { RootState } from '../store'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  deleteMethod: vi.fn(),
}))

const getState = () => ({ tenant: { selectedTenant: { id: 'tenant-1' } } }) as RootState

describe('safelist thunks errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects a failed load with the server's message", async () => {
    vi.mocked(get).mockRejectedValue({ response: { data: { message: 'database is down' } } })

    const action = await fetchSafelist()(vi.fn(), getState, undefined)

    expect(action.payload).toBe('database is down')
  })

  it('rejects a failed add with the fallback when there is no message', async () => {
    vi.mocked(post).mockRejectedValue('boom')

    const action = await addSafelistEntry({ channelCode: 'EMAIL', recipient: 'a@b.ca' })(
      vi.fn(),
      getState,
      undefined,
    )

    expect(action.payload).toBe('Failed to add the recipient')
  })

  it("rejects a failed remove with the error's own message", async () => {
    vi.mocked(deleteMethod).mockRejectedValue(new Error('Network Error'))

    const action = await removeSafelistEntry('id-1')(vi.fn(), getState, undefined)

    expect(action.payload).toBe('Network Error')
  })
})
