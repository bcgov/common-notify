import { describe, expect, it, vi } from 'vitest'
import { createFeatureFlag } from './featureFlags.thunks'
import { post } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  deleteMethod: vi.fn(),
}))

describe('createFeatureFlag', () => {
  it("rejects with the server's message", async () => {
    vi.mocked(post).mockRejectedValue({ response: { data: { message: 'code already exists' } } })

    const action = await createFeatureFlag({ code: 'X', enabled: true })(
      vi.fn(),
      vi.fn(),
      undefined,
    )

    expect(action.payload).toBe('code already exists')
  })
})
