import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { CstarApiClient } from './cstar-api.client'
import type { CstarCacheStore } from './cstar-cache.store'

/**
 * Covers the client's request coalescing and its never-cache-a-failure rule. The store's
 * own behaviour lives in cstar-cache.store.spec.ts.
 */
describe('CstarApiClient.getUserTenants', () => {
  const USER = 'idir-guid'
  let fetchMock: ReturnType<typeof vi.fn>

  /** In-memory stand-in for the Redis store, with the same TTL semantics. */
  const fakeStore = (ttlMs: number) => {
    const entries = new Map<string, { expiresAt: number; value: unknown }>()
    const read = async (key: string) => {
      if (ttlMs <= 0) return null
      const hit = entries.get(key)
      if (!hit || hit.expiresAt <= Date.now()) return null
      return hit.value
    }
    const write = async (key: string, value: unknown) => {
      if (ttlMs <= 0) return
      entries.set(key, { expiresAt: Date.now() + ttlMs, value })
    }
    return {
      entries,
      readTenants: vi.fn((user: string) => read(`t:${user}`)),
      writeTenants: vi.fn((user: string, value: unknown) => write(`t:${user}`, value)),
      readRoles: vi.fn((tenant: string, user: string) => read(`r:${tenant}:${user}`)),
      writeRoles: vi.fn((tenant: string, user: string, value: unknown) =>
        write(`r:${tenant}:${user}`, value),
      ),
    }
  }

  const build = (ttlMs = 15000) => {
    const config = {
      get: vi.fn((key: string) => (key === 'cstar.baseUrl' ? 'https://cstar.example' : ttlMs)),
    } as unknown as ConfigService
    return new CstarApiClient(config, fakeStore(ttlMs) as unknown as CstarCacheStore)
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

  it('coalesces even while the cache read is still outstanding', async () => {
    // Both callers can miss before either registers an in-flight request.
    let releaseRead: () => void = () => {}
    const slowRead = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    const config = {
      get: vi.fn((key: string) => (key === 'cstar.baseUrl' ? 'https://cstar.example' : 15000)),
    } as unknown as ConfigService
    const store = {
      readTenants: vi.fn(async () => {
        await slowRead
        return null
      }),
      writeTenants: vi.fn(async () => {}),
      readRoles: vi.fn(async () => null),
      writeRoles: vi.fn(async () => {}),
    }
    fetchMock.mockResolvedValue(ok([{ id: 'tenant-a' }]))
    const client = new CstarApiClient(config, store as unknown as CstarCacheStore)

    const all = Promise.all([client.getUserTenants(USER), client.getUserTenants(USER)])
    releaseRead()
    await all

    expect(store.readTenants).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls CSTAR when the cache is unavailable, rather than failing the request', async () => {
    const config = {
      get: vi.fn((key: string) => (key === 'cstar.baseUrl' ? 'https://cstar.example' : 15000)),
    } as unknown as ConfigService
    // The store reports a miss when Redis is unavailable; the client proceeds to CSTAR.
    const store = {
      readTenants: vi.fn(async () => null),
      writeTenants: vi.fn(async () => {}),
      readRoles: vi.fn(async () => null),
      writeRoles: vi.fn(async () => {}),
    }
    fetchMock.mockResolvedValue(ok([{ id: 'tenant-a' }]))
    const client = new CstarApiClient(config, store as unknown as CstarCacheStore)

    await expect(client.getUserTenants(USER)).resolves.toEqual([{ id: 'tenant-a' }])
    await expect(client.getUserTenants(USER)).resolves.toEqual([{ id: 'tenant-a' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
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

/**
 * The group lookups behind the events Email tab: listing a tenant's groups for the picker, and
 * resolving a group's members to the email addresses a notification is actually sent to.
 */
describe('CstarApiClient group lookups', () => {
  const TENANT = 'cstar-tenant-1'
  const GROUP = '3a3fafee-d41b-4fbe-92df-62dbebf0f73a'
  let fetchMock: ReturnType<typeof vi.fn>

  const build = () => {
    const config = {
      get: vi.fn((key: string) => (key === 'cstar.baseUrl' ? 'https://cstar.example' : 15000)),
    } as unknown as ConfigService
    const store = {
      readTenants: vi.fn(async () => null),
      writeTenants: vi.fn(async () => {}),
      readRoles: vi.fn(async () => null),
      writeRoles: vi.fn(async () => {}),
    }
    return new CstarApiClient(config, store as unknown as CstarCacheStore)
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists a tenant groups, passing the caller token through', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { groups: [{ id: GROUP, name: 'Development Team' }] } }),
    })

    const groups = await build().getTenantGroups(TENANT, 'Bearer token')

    expect(groups).toEqual([{ id: GROUP, name: 'Development Team' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/groups`)
    expect(init.headers.Authorization).toBe('Bearer token')
  })

  it('resolves group members to unique, lowercased email addresses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          users: [
            { ssoUser: { email: 'Alice@gov.bc.ca' } },
            { ssoUser: { email: 'alice@gov.bc.ca ' } },
            { ssoUser: { email: 'bob@gov.bc.ca' } },
            // A user with no address, and one with no SSO user at all: neither is a recipient,
            // and neither may become a blank entry in the list.
            { ssoUser: { email: null } },
            { ssoUser: null },
          ],
        },
      }),
    })

    const emails = await build().getGroupMemberEmails(TENANT, [GROUP], 'Bearer token')

    expect(emails).toEqual(['alice@gov.bc.ca', 'bob@gov.bc.ca'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/users?groupIds=${GROUP}`)
    expect(init.headers.Authorization).toBe('Bearer token')
  })

  it('resolves every requested group in a single call', async () => {
    const OTHER_GROUP = '8f01087b-edfe-4957-97c4-f0aece2bc514'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { users: [{ ssoUser: { email: 'alice@gov.bc.ca' } }] } }),
    })

    await build().getGroupMemberEmails(TENANT, [GROUP, OTHER_GROUP])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://cstar.example/api/v1/tenants/${TENANT}/users?groupIds=${GROUP}%2C${OTHER_GROUP}`,
    )
  })

  it('returns no addresses for a group with no members', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { users: [] } }),
    })

    await expect(build().getGroupMemberEmails(TENANT, [GROUP])).resolves.toEqual([])
  })

  it('asks CSTAR nothing when no groups were selected', async () => {
    await expect(build().getGroupMemberEmails(TENANT, [])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a group the caller cannot see as forbidden rather than a server error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '{"message":"Tenant not found"}',
    })

    await expect(build().getGroupMemberEmails(TENANT, [GROUP])).rejects.toThrow(ForbiddenException)
  })

  it('surfaces a CSTAR outage as a server error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(build().getTenantGroups(TENANT)).rejects.toThrow(InternalServerErrorException)
  })
})

/** Shared setup for the tenant user and service account blocks below. */
const buildClient = (overrides: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    'cstar.baseUrl': 'https://cstar.example',
    'cstar.tokenUrl': 'https://sso.example/token',
    'cstar.clientId': 'sa-notify-cstar',
    'cstar.clientSecret': 'secret',
    ...overrides,
  }
  const config = { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService
  return new CstarApiClient(config, {} as unknown as CstarCacheStore)
}

const cstarError = (status: number, message: string) => ({
  ok: false,
  status,
  statusText: 'error',
  text: async () => JSON.stringify({ message }),
})

/** The tenant user routes behind the NOTIFY_ADMIN CSTAR pages, which forward the admin's token. */
describe('CstarApiClient tenant users', () => {
  const TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
  const TENANT_USER = '6c6e1b2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b'
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists a tenant's users with the caller's token", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { users: [{ id: TENANT_USER }] } }),
    })

    await expect(buildClient().getTenantUsers(TENANT, 'Bearer admin')).resolves.toEqual([
      { id: TENANT_USER },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/users`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer admin')
  })

  it('gets one tenant user with expand, and without a query when expand is absent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { tenantUser: { id: TENANT_USER } } }),
    })
    const client = buildClient()

    await expect(client.getTenantUser(TENANT, TENANT_USER, 'groups,roles')).resolves.toEqual({
      id: TENANT_USER,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://cstar.example/api/v1/tenants/${TENANT}/users/${TENANT_USER}?expand=groups%2Croles`,
    )

    await client.getTenantUser(TENANT, TENANT_USER, undefined)
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://cstar.example/api/v1/tenants/${TENANT}/users/${TENANT_USER}`,
    )
  })

  it('posts only the user when adding a tenant user', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { user: { id: TENANT_USER } } }),
    })
    const user = {
      ssoUserId: 'fd33f1cef7ca4b19a71104d4ecf7066b',
      firstName: 'John',
      lastName: 'Smith',
      displayName: 'Smith, John',
      idpType: 'idir' as const,
    }

    await expect(buildClient().addTenantUser(TENANT, user, 'Bearer admin')).resolves.toEqual({
      id: TENANT_USER,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/users`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ user })
  })

  it('removes a tenant user, accepting an empty 204', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body')
      },
    })

    await expect(buildClient().removeTenantUser(TENANT, TENANT_USER)).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/users/${TENANT_USER}`)
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it.each([
    [400, BadRequestException],
    [403, ForbiddenException],
    [404, NotFoundException],
    [409, ConflictException],
  ])('maps a %s on a write to %o, keeping the CSTAR reason', async (status, exception) => {
    fetchMock.mockResolvedValue(cstarError(status, 'Cannot remove the last tenant owner'))

    const result = buildClient().removeTenantUser(TENANT, TENANT_USER)
    await expect(result).rejects.toThrow(exception)
    await expect(result).rejects.toThrow('Cannot remove the last tenant owner')
  })

  it('keeps mapping a 404 on a read to forbidden', async () => {
    fetchMock.mockResolvedValue(cstarError(404, 'Tenant not found'))

    await expect(buildClient().getTenantUserRoles(TENANT, TENANT_USER)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('rejects a path segment that could change the request path', async () => {
    await expect(buildClient().getTenantUser(TENANT, '../roles', undefined)).rejects.toThrow(
      BadRequestException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends only the search params that have a value', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ username: 'x@idir' }] }),
    })

    await expect(
      buildClient().searchIdirUsers({ tenantId: TENANT, lastName: 'Smith & Co', email: undefined }),
    ).resolves.toEqual([{ username: 'x@idir' }])
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://cstar.example/api/v1/users/bcgovssousers/idir/search?tenantId=${TENANT}&lastName=Smith+%26+Co`,
    )
  })
})

/** The group reads that run with no user present, authenticated as Notify's CSTAR service account. */
describe('CstarApiClient service account', () => {
  const TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
  const GROUP = '3a3fafee-d41b-4fbe-92df-62dbebf0f73a'
  let fetchMock: ReturnType<typeof vi.fn>

  /** Answers the token endpoint with successive tokens and CSTAR with the given body. */
  const route = (cstarBody: unknown) => {
    let issued = 0
    fetchMock.mockImplementation(async (url: string) =>
      url === 'https://sso.example/token'
        ? {
            ok: true,
            json: async () => ({ access_token: `sa-token-${++issued}`, expires_in: 300 }),
          }
        : { ok: true, json: async () => cstarBody },
    )
  }

  const cstarCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://cstar.example'))

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("lists a tenant's groups with a client-credentials token", async () => {
    route({ data: { groups: [{ id: GROUP, name: 'Dev' }] } })

    await expect(buildClient().getTenantGroupsAsServiceAccount(TENANT)).resolves.toEqual([
      { id: GROUP, name: 'Dev' },
    ])

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://sso.example/token')
    expect(tokenInit.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'sa-notify-cstar',
      client_secret: 'secret',
    })
    expect(cstarCalls()[0][1].headers.Authorization).toBe('Bearer sa-token-1')
  })

  it("resolves a group's members with the service account", async () => {
    route({ data: { users: [{ displayName: 'Lovelace, Ada', email: 'ada@gov.bc.ca' }] } })

    await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).resolves.toEqual([
      { displayName: 'Lovelace, Ada', email: 'ada@gov.bc.ca' },
    ])
    expect(cstarCalls()[0][0]).toBe(
      `https://cstar.example/api/v1/tenants/${TENANT}/groups/${GROUP}/users`,
    )
    expect(cstarCalls()[0][1].headers.Authorization).toBe('Bearer sa-token-1')
  })

  it('reuses the token until 80% of its lifetime has passed', async () => {
    vi.useFakeTimers()
    route({ data: { groups: [] } })
    const client = buildClient()

    await client.getTenantGroupsAsServiceAccount(TENANT)
    vi.advanceTimersByTime(239_000) // just under 80% of 300s
    await client.getTenantGroupsAsServiceAccount(TENANT)
    expect(cstarCalls()[1][1].headers.Authorization).toBe('Bearer sa-token-1')

    vi.advanceTimersByTime(2_000)
    await client.getTenantGroupsAsServiceAccount(TENANT)
    expect(cstarCalls()[2][1].headers.Authorization).toBe('Bearer sa-token-2')
  })

  it('sends the scope when one is configured', async () => {
    route({ data: { groups: [] } })

    await buildClient({ 'cstar.scope': 'cstar' }).getTenantGroupsAsServiceAccount(TENANT)
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('scope')).toBe('cstar')
  })

  it('is unavailable when the service account is not configured', async () => {
    await expect(
      buildClient({ 'cstar.clientSecret': undefined }).getTenantGroupsAsServiceAccount(TENANT),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is unavailable when the token endpoint refuses the credentials', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })
})
