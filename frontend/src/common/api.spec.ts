import axios from 'axios'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { showErrorToast } from '@/redux/utils/toastUtils'

vi.mock('@/config', () => ({ default: {} }))
vi.mock('@/service/user-service', () => ({ default: { getToken: vi.fn() } }))
vi.mock('@/redux/utils/toastUtils', () => ({ showErrorToast: vi.fn() }))
vi.mock('@/redux/utils/globalLoading', () => ({
  trackRequestStart: vi.fn(),
  trackRequestEnd: vi.fn(),
}))

/** The response interceptor's error handler, captured as the module registers it. */
let onRejected: (error: unknown) => Promise<unknown>

/** An axios-shaped 401 for the given url. */
const unauthorized = (data?: unknown, url = '/api/v1/frontend/events') => ({
  config: { url },
  response: { status: 401, data },
})

describe('api response interceptor', () => {
  beforeAll(async () => {
    const use = vi.spyOn(axios.interceptors.response, 'use')
    await import('./api')
    onRejected = use.mock.calls[0][1] as typeof onRejected
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows a 401's tenant message", async () => {
    const error = unauthorized({ message: 'No tenant selected' })

    await expect(onRejected(error)).rejects.toBe(error)
    expect(showErrorToast).toHaveBeenCalledWith('Authorization failed: No tenant selected')
  })

  it('stays quiet for a 401 without a message', async () => {
    const error = unauthorized()

    await expect(onRejected(error)).rejects.toBe(error)
    expect(showErrorToast).not.toHaveBeenCalled()
  })
})
