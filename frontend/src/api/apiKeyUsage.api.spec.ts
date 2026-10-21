import { describe, expect, it, vi } from 'vitest'
import { getApiKeyUsage } from './apiKeyUsage.api'
import { get } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  patch: vi.fn(),
  generateApiParameters: vi.fn((url: string) => ({ url })),
  STATUS_CODES: { Unauthorized: 401, Forbidden: 403 },
}))

describe('apiKeyUsage.api errors', () => {
  it("surfaces the server's message for any other failure", async () => {
    vi.mocked(get).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { message: 'database is down' } },
      }),
    )

    await expect(getApiKeyUsage()).rejects.toThrow('Failed to load usage: database is down')
  })
})
