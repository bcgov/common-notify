import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfigService } from '@nestjs/config'

const clientMock = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(async () => 'OK'),
  disconnect: vi.fn(),
}

vi.mock('../../queue/redis-connection', () => ({
  createRedisClient: vi.fn(() => clientMock),
}))

import { CstarCacheStore } from './cstar-cache.store'
import { createRedisClient } from '../../queue/redis-connection'

/**
 * The store caches an authorization input, so its only permitted failure mode is "cache
 * miss": a null return sends the caller to CSTAR.
 */
describe('CstarCacheStore', () => {
  const USER = 'idir-guid'

  const build = (ttlMs = 15000) => {
    const config = {
      get: vi.fn((key: string) =>
        key === 'cstar.userTenantsCacheTtlMs' ? ttlMs : { host: 'localhost', port: 6379, db: 0 },
      ),
    } as unknown as ConfigService
    return new CstarCacheStore(config)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clientMock.quit.mockResolvedValue('OK')
  })

  it('returns a cached tenant list', async () => {
    clientMock.get.mockResolvedValue(JSON.stringify([{ id: 'tenant-a' }]))
    expect(await build().readTenants(USER)).toEqual([{ id: 'tenant-a' }])
  })

  it('accepts a tenant list of bare id strings, the other shape CSTAR has returned', async () => {
    clientMock.get.mockResolvedValue(JSON.stringify(['tenant-a']))
    expect(await build().readTenants(USER)).toEqual(['tenant-a'])
  })

  it('writes with a millisecond TTL so entries expire without a sweeper', async () => {
    await build(30000).writeRoles('tenant-a', USER, ['Admin'])
    expect(clientMock.set).toHaveBeenCalledWith(
      'cstar:roles:tenant-a:idir-guid',
      JSON.stringify(['Admin']),
      'PX',
      30000,
    )
  })

  it('reports a miss when Redis is unavailable instead of throwing', async () => {
    // A Redis outage costs the cache, not the service.
    clientMock.get.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await build().readTenants(USER)).toBeNull()
  })

  it('swallows a failed write, since the cost is only a miss next time', async () => {
    clientMock.set.mockRejectedValue(new Error('OOM command not allowed'))
    await expect(build().writeTenants(USER, [{ id: 'tenant-a' }])).resolves.toBeUndefined()
  })

  it('discards an entry whose shape does not match, rather than trusting it', async () => {
    // Redis contents outlive the process, so a deploy can read the old schema's JSON.
    clientMock.get.mockResolvedValue(JSON.stringify([{ tenantId: 'tenant-a' }]))
    expect(await build().readTenants(USER)).toBeNull()
  })

  it('discards a roles entry that is not an array of strings', async () => {
    clientMock.get.mockResolvedValue(JSON.stringify([{ name: 'Admin' }]))
    expect(await build().readRoles('tenant-a', USER)).toBeNull()
  })

  it('discards an unparseable entry', async () => {
    clientMock.get.mockResolvedValue('not json')
    expect(await build().readTenants(USER)).toBeNull()
  })

  it('keeps roles keyed by tenant and user together', async () => {
    clientMock.get.mockResolvedValue(null)
    const store = build()
    await store.readRoles('tenant-a', USER)
    await store.readRoles('tenant-b', USER)
    expect(clientMock.get).toHaveBeenNthCalledWith(1, 'cstar:roles:tenant-a:idir-guid')
    expect(clientMock.get).toHaveBeenNthCalledWith(2, 'cstar:roles:tenant-b:idir-guid')
  })

  it('encodes identifiers so one cannot span the key separator into another entry', async () => {
    clientMock.get.mockResolvedValue(null)
    // Without encoding, tenant "a:victim" + user "u" would read the same key as
    // tenant "a" + user "victim:u".
    await build().readRoles('a:victim', 'u')
    expect(clientMock.get).toHaveBeenCalledWith('cstar:roles:a%3Avictim:u')
  })

  it('does not touch Redis at all when the TTL is zero', async () => {
    const store = build(0)
    expect(await store.readTenants(USER)).toBeNull()
    await store.writeTenants(USER, [{ id: 'tenant-a' }])
    expect(clientMock.get).not.toHaveBeenCalled()
    expect(clientMock.set).not.toHaveBeenCalled()
  })

  it('fails fast rather than queueing commands while disconnected', async () => {
    // A queued command would stall the guard for the length of a Redis outage.
    build()
    expect(createRedisClient).toHaveBeenCalledWith(
      expect.anything(),
      'CstarCacheStore',
      expect.objectContaining({ enableOfflineQueue: false, commandTimeout: expect.any(Number) }),
    )
  })

  it('deletes both entries when invalidating a user within a tenant', async () => {
    await build().invalidateUser(USER, 'tenant-a')
    expect(clientMock.del).toHaveBeenCalledWith(
      'cstar:tenants:idir-guid',
      'cstar:roles:tenant-a:idir-guid',
    )
  })
})
