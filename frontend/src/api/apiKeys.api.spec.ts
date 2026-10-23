import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApiKeys } from './apiKeys.api'
import { get } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url })),
  STATUS_CODES: {
    Unauthorized: 401,
    Forbidden: 403,
    Conflict: 409,
    ServiceUnavailable: 503,
  },
}))

/** An axios-shaped rejection, which is what the api layer branches on. */
const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  })

describe('apiKeys.api errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [503, { message: 'gateway down' }, 'gateway down'],
    [503, undefined, 'The API gateway is unavailable right now. Please try again shortly.'],
    [409, { message: 'key exists' }, 'key exists'],
    [409, undefined, 'This tenant already has an API key'],
    [500, { message: 'database is down' }, 'Failed to load the API key: database is down'],
  ])('explains a %i', async (status, data, message) => {
    vi.mocked(get).mockRejectedValue(httpError(status, data))

    await expect(getApiKeys()).rejects.toThrow(message)
  })
})
