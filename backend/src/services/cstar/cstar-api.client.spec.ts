import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { CstarApiClient } from './cstar-api.client'

/**
 * Covers the request coalescing and caching added because rapid navigation fired one
 * CSTAR call per request, and the resulting failures surfaced as
 * "Authorization failed: Failed to verify tenant access".
 */
describe('CstarApiClient.getUserTenants', () => {
  const USER = 'idir-guid'
  let fetchMock: ReturnType<typeof vi.fn>

  const build = (ttlMs = 15000) => {
    const config = {
      get: vi.fn((key: string) => (key === 'cstar.baseUrl' ? 'https://cstar.example' : ttlMs)),
    } as unknown as ConfigService
    return new CstarApiClient(config)
  }

  const ok = (tenants: unknown[]) => ({
    ok: true,
    json: async () => ({ data: { tenants } }),
  })

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('makes a single CSTAR call when requests overlap', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    fetchMock.mockImplementation(async () => {
      await pending
      return ok([{ id: 'tenant-a' }])
    })

    const client = build()
    const all = Promise.all([
      client.getUserTenants(USER),
      client.getUserTenants(USER),
      client.getUserTenants(USER),
    ])
    release(null)
    const results = await all

    expect(fetchMock).toHaveBeenCalledTimes(1)
    results.forEach((r) => expect(r).toEqual([{ id: 'tenant-a' }]))
  })

  it('reuses a recent result instead of calling CSTAR again', async () => {
    fetchMock.mockResolvedValue(ok([{ id: 'tenant-a' }]))
    const client = build()

    await client.getUserTenants(USER)
    await client.getUserTenants(USER)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls CSTAR again once the cached result has expired', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(ok([{ id: 'tenant-a' }]))
    const client = build(1000)

    await client.getUserTenants(USER)
    vi.advanceTimersByTime(1001)
    await client.getUserTenants(USER)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures, so a transient CSTAR error is retried', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    fetchMock.mockResolvedValueOnce(ok([{ id: 'tenant-a' }]))
    const client = build()

    await expect(client.getUserTenants(USER)).rejects.toThrow()
    await expect(client.getUserTenants(USER)).resolves.toEqual([{ id: 'tenant-a' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps users separate', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      ok([{ id: url.includes('user-a') ? 'tenant-a' : 'tenant-b' }]),
    )
    const client = build()

    expect(await client.getUserTenants('user-a')).toEqual([{ id: 'tenant-a' }])
    expect(await client.getUserTenants('user-b')).toEqual([{ id: 'tenant-b' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a missing user id rather than caching it under one shared key', async () => {
    const client = build()
    await expect(client.getUserTenants(undefined as unknown as string)).rejects.toThrow(
      /Invalid ssoUserId/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps roles separate per tenant for the same user', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        data: { sharedServiceRoles: [{ name: url.includes('tenant-a') ? 'Admin' : 'Viewer' }] },
      }),
    }))
    const client = build()

    const a = await client.getUserRoles('tenant-a', USER)
    const b = await client.getUserRoles('tenant-b', USER)

    expect(a).not.toEqual(b)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Second read of tenant-a comes from cache, and is still tenant-a's roles.
    expect(await client.getUserRoles('tenant-a', USER)).toEqual(a)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('coalesces overlapping role lookups too', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    fetchMock.mockImplementation(async () => {
      await pending
      return { ok: true, json: async () => ({ data: { sharedServiceRoles: [{ name: 'Admin' }] } }) }
    })
    const client = build()

    const all = Promise.all([
      client.getUserRoles('tenant-a', USER),
      client.getUserRoles('tenant-a', USER),
    ])
    release(null)
    await all

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still coalesces when caching is disabled', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    fetchMock.mockImplementation(async () => {
      await pending
      return ok([{ id: 'tenant-a' }])
    })
    const client = build(0)

    const all = Promise.all([client.getUserTenants(USER), client.getUserTenants(USER)])
    release(null)
    await all

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await client.getUserTenants(USER)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
