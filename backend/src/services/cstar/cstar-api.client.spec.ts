import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigService } from '@nestjs/config'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
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

  describe("reading CSTAR's error message", () => {
    const failWith = (status: number, body: string) =>
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        statusText: 'error',
        text: async () => body,
      })

    it('prefers detail over message', async () => {
      failWith(400, JSON.stringify({ detail: 'From detail', message: 'From message' }))

      await expect(buildClient().removeTenantUser(TENANT, TENANT_USER)).rejects.toThrow(
        'From detail',
      )
    })

    it('falls back to the first entry of errors', async () => {
      failWith(400, JSON.stringify({ errors: [{ message: 'From errors' }] }))

      await expect(buildClient().removeTenantUser(TENANT, TENANT_USER)).rejects.toThrow(
        'From errors',
      )
    })

    it('passes a non-JSON body through as the message', async () => {
      failWith(400, 'Bad things happened')

      const result = buildClient().removeTenantUser(TENANT, TENANT_USER)
      await expect(result).rejects.toThrow(BadRequestException)
      await expect(result).rejects.toThrow('Bad things happened')
    })

    it('maps an unexpected status to a server error carrying the message', async () => {
      failWith(502, JSON.stringify({ message: 'Upstream down' }))

      const result = buildClient().removeTenantUser(TENANT, TENANT_USER)
      await expect(result).rejects.toThrow(InternalServerErrorException)
      await expect(result).rejects.toThrow('CSTAR API error: 502 - Upstream down')
    })
  })

  it('keeps mapping a 404 on a read to forbidden', async () => {
    fetchMock.mockResolvedValue(cstarError(404, 'Tenant not found'))

    await expect(buildClient().getTenantUserRoles(TENANT, TENANT_USER)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it("keeps CSTAR's reason on a refused read and logs it as a warning", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    fetchMock.mockResolvedValue(cstarError(403, 'Headless token required'))

    const result = buildClient().getTenantUserRoles(TENANT, TENANT_USER)
    await expect(result).rejects.toThrow(ForbiddenException)
    await expect(result).rejects.toThrow(/^Not authorized to read .+: Headless token required$/)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Headless token required'))
    warn.mockRestore()
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
    fetchMock.mock.calls.filter(([url]) => new URL(String(url)).origin === 'https://cstar.example')

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("resolves a group's members with a client-credentials token", async () => {
    route({ data: { users: [{ displayName: 'Lovelace, Ada', email: 'ada@gov.bc.ca' }] } })

    await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).resolves.toEqual([
      { displayName: 'Lovelace, Ada', email: 'ada@gov.bc.ca' },
    ])

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://sso.example/token')
    expect(tokenInit.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'sa-notify-cstar',
      client_secret: 'secret',
    })
    expect(cstarCalls()[0][0]).toBe(
      `https://cstar.example/api/v1/tenants/${TENANT}/groups/${GROUP}/users`,
    )
    expect(cstarCalls()[0][1].headers.Authorization).toBe('Bearer sa-token-1')
  })

  it('reuses the token until 80% of its lifetime has passed', async () => {
    vi.useFakeTimers()
    route({ data: { users: [] } })
    const client = buildClient()

    await client.getGroupMembersAsServiceAccount(TENANT, GROUP)
    vi.advanceTimersByTime(239_000) // just under 80% of 300s
    await client.getGroupMembersAsServiceAccount(TENANT, GROUP)
    expect(cstarCalls()[1][1].headers.Authorization).toBe('Bearer sa-token-1')

    vi.advanceTimersByTime(2_000)
    await client.getGroupMembersAsServiceAccount(TENANT, GROUP)
    expect(cstarCalls()[2][1].headers.Authorization).toBe('Bearer sa-token-2')
  })

  it('is unavailable when the service account is not configured', async () => {
    await expect(
      buildClient({ 'cstar.clientSecret': undefined }).getGroupMembersAsServiceAccount(
        TENANT,
        GROUP,
      ),
    ).rejects.toThrow(ServiceUnavailableException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('group member emails', () => {
    const OTHER_GROUP = '8f01087b-edfe-4957-97c4-f0aece2bc514'

    /** Answers each group's members route with that group's users. */
    const routeGroups = (usersByGroup: Record<string, unknown[]>) =>
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://sso.example/token') {
          return { ok: true, json: async () => ({ access_token: 'sa-token', expires_in: 300 }) }
        }
        const groupId = String(url).match(/groups\/([^/]+)\/users$/)?.[1] ?? ''
        return { ok: true, json: async () => ({ data: { users: usersByGroup[groupId] ?? [] } }) }
      })

    it('fetches one token, then each group with it', async () => {
      routeGroups({})

      await buildClient().getGroupMemberEmailsAsServiceAccount(TENANT, [GROUP, OTHER_GROUP])

      const tokenCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://sso.example/token')
      expect(tokenCalls).toHaveLength(1)
      expect(cstarCalls().map(([url]) => url)).toEqual([
        `https://cstar.example/api/v1/tenants/${TENANT}/groups/${GROUP}/users`,
        `https://cstar.example/api/v1/tenants/${TENANT}/groups/${OTHER_GROUP}/users`,
      ])
      for (const [, init] of cstarCalls()) {
        expect(init.headers.Authorization).toBe('Bearer sa-token')
      }
    })

    it('returns unique, lowercased addresses across groups, dropping members without one', async () => {
      routeGroups({
        [GROUP]: [{ email: 'Alice@gov.bc.ca' }, { email: 'bob@gov.bc.ca' }, { email: null }],
        [OTHER_GROUP]: [{ email: 'alice@gov.bc.ca ' }, { email: '' }],
      })

      await expect(
        buildClient().getGroupMemberEmailsAsServiceAccount(TENANT, [GROUP, OTHER_GROUP]),
      ).resolves.toEqual(['alice@gov.bc.ca', 'bob@gov.bc.ca'])
    })

    it('asks CSTAR nothing when no groups were selected', async () => {
      await expect(buildClient().getGroupMemberEmailsAsServiceAccount(TENANT, [])).resolves.toEqual(
        [],
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fails the whole lookup when any group cannot be read', async () => {
      fetchMock.mockImplementation(async (url: string) =>
        url === 'https://sso.example/token'
          ? { ok: true, json: async () => ({ access_token: 'sa-token', expires_in: 300 }) }
          : String(url).includes(OTHER_GROUP)
            ? cstarError(404, 'Group not found')
            : { ok: true, json: async () => ({ data: { users: [] } }) },
      )

      await expect(
        buildClient().getGroupMemberEmailsAsServiceAccount(TENANT, [GROUP, OTHER_GROUP]),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('a rejected token', () => {
    /** Issues successive tokens; CSTAR answers 401 for the first `rejections` calls. */
    const routeRejecting = (rejections: number) => {
      let issued = 0
      let cstarCallCount = 0
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://sso.example/token') {
          return {
            ok: true,
            json: async () => ({ access_token: `sa-token-${++issued}`, expires_in: 300 }),
          }
        }
        return ++cstarCallCount <= rejections
          ? cstarError(401, 'Token revoked')
          : { ok: true, json: async () => ({ data: { users: [{ email: 'a@gov.bc.ca' }] } }) }
      })
    }
    const tokenCalls = () =>
      fetchMock.mock.calls.filter(([url]) => url === 'https://sso.example/token')

    it('gets a new token and retries once', async () => {
      routeRejecting(1)

      await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).resolves.toEqual([
        { email: 'a@gov.bc.ca' },
      ])
      expect(tokenCalls()).toHaveLength(2)
      expect(cstarCalls().map(([, init]) => init.headers.Authorization)).toEqual([
        'Bearer sa-token-1',
        'Bearer sa-token-2',
      ])
    })

    it('gives up when the new token is rejected too', async () => {
      routeRejecting(2)

      await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(cstarCalls()).toHaveLength(2)
    })
  })

  it('is unavailable when the token endpoint refuses the credentials', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await expect(buildClient().getGroupMembersAsServiceAccount(TENANT, GROUP)).rejects.toThrow(
      ServiceUnavailableException,
    )
  })
})

/** The group routes behind the NOTIFY_ADMIN CSTAR pages, which forward the admin's token. */
describe('CstarApiClient groups', () => {
  const TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
  const GROUP = '3a3fafee-d41b-4fbe-92df-62dbebf0f73a'
  const GROUP_USER = '8f01087b-edfe-4957-97c4-f0aece2bc514'
  const GROUP_PATH = `https://cstar.example/api/v1/tenants/${TENANT}/groups/${GROUP}`
  const user = {
    ssoUserId: 'fd33f1cef7ca4b19a71104d4ecf7066b',
    firstName: 'John',
    lastName: 'Smith',
    displayName: 'Smith, John',
    idpType: 'idir' as const,
  }
  let fetchMock: ReturnType<typeof vi.fn>

  const respond = (data: unknown, status = 200) =>
    fetchMock.mockResolvedValue({ ok: true, status, json: async () => ({ data }) })

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('always expands group users when getting a group', async () => {
    respond({ group: { id: GROUP, users: [{ id: GROUP_USER }] } })

    await expect(buildClient().getGroup(TENANT, GROUP, 'Bearer admin')).resolves.toEqual({
      id: GROUP,
      users: [{ id: GROUP_USER }],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${GROUP_PATH}?expand=groupUsers`)
    expect(init.headers.Authorization).toBe('Bearer admin')
  })

  it('creates a group with a POST and updates one with a PUT', async () => {
    respond({ group: { id: GROUP, name: 'Editors' } }, 201)
    const client = buildClient()

    await expect(client.createGroup(TENANT, { name: 'Editors' })).resolves.toEqual({
      id: GROUP,
      name: 'Editors',
    })
    expect(fetchMock.mock.calls[0][0]).toBe(`https://cstar.example/api/v1/tenants/${TENANT}/groups`)
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Editors' })

    await client.updateGroup(TENANT, GROUP, { description: 'New' })
    expect(fetchMock.mock.calls[1][0]).toBe(GROUP_PATH)
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ description: 'New' })
  })

  it('adds a group user, sending confirmOtherServices only when given', async () => {
    respond({ groupUser: { id: GROUP_USER } }, 201)
    const client = buildClient()

    await expect(client.addGroupUser(TENANT, GROUP, user, undefined)).resolves.toEqual({
      id: GROUP_USER,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUP_PATH}/users`)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ user })

    await client.addGroupUser(TENANT, GROUP, user, ['chefs'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      user,
      confirmOtherServices: ['chefs'],
    })
  })

  it('removes a group user by its groupUserId', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => undefined })

    await expect(buildClient().removeGroupUser(TENANT, GROUP, GROUP_USER)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe(`${GROUP_PATH}/users/${GROUP_USER}`)
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })

  it("gets and updates a group's shared service roles", async () => {
    const sharedServices = [
      { id: GROUP_USER, sharedServiceRoles: [{ id: GROUP, name: 'NOTIFY_VIEWER', enabled: true }] },
    ]
    respond({ sharedServices })
    const client = buildClient()
    const rolesPath = `${GROUP_PATH}/shared-services/shared-service-roles`

    await expect(client.getGroupRoles(TENANT, GROUP)).resolves.toEqual(sharedServices)
    expect(fetchMock.mock.calls[0][0]).toBe(rolesPath)

    const update = {
      sharedServices: [{ id: GROUP_USER, sharedServiceRoles: [{ id: GROUP, enabled: true }] }],
    }
    await expect(client.updateGroupRoles(TENANT, GROUP, update)).resolves.toEqual(sharedServices)
    expect(fetchMock.mock.calls[1][0]).toBe(rolesPath)
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(update)
  })

  it('passes a duplicate group name through as a conflict', async () => {
    fetchMock.mockResolvedValue(cstarError(409, 'Group with same name already exists'))

    await expect(buildClient().createGroup(TENANT, { name: 'Editors' })).rejects.toThrow(
      ConflictException,
    )
  })

  it('rejects a groupUserId that could change the request path', async () => {
    await expect(buildClient().removeGroupUser(TENANT, GROUP, '../..')).rejects.toThrow(
      BadRequestException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/** The read-only tenant, shared service, SSO user and health lookups. */
describe('CstarApiClient lookups', () => {
  const TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
  const SSO_USER = 'fd33f1cef7ca4b19a71104d4ecf7066b'
  const TENANT_PATH = `https://cstar.example/api/v1/tenants/${TENANT}`
  let fetchMock: ReturnType<typeof vi.fn>

  const respond = (body: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body })

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets a tenant, sending expand only when given', async () => {
    respond({ data: { tenant: { id: TENANT, name: 'Roads' } } })
    const client = buildClient()

    await expect(client.getTenant(TENANT, undefined, 'Bearer admin')).resolves.toEqual({
      id: TENANT,
      name: 'Roads',
    })
    expect(fetchMock.mock.calls[0][0]).toBe(TENANT_PATH)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer admin')

    await client.getTenant(TENANT, 'tenantUserRoles')
    expect(fetchMock.mock.calls[1][0]).toBe(`${TENANT_PATH}?expand=tenantUserRoles`)
  })

  it("gets a tenant's shared services", async () => {
    respond({ data: { sharedServices: [{ id: 'svc', name: 'NOTIFY' }] } })

    await expect(buildClient().getTenantSharedServices(TENANT)).resolves.toEqual([
      { id: 'svc', name: 'NOTIFY' },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe(`${TENANT_PATH}/shared-services`)
  })

  it("gets an SSO user's tenant roles", async () => {
    respond({ data: { roles: [{ id: 'r', name: 'SERVICE_USER' }] } })

    await expect(buildClient().getSsoUserTenantRoles(TENANT, SSO_USER)).resolves.toEqual([
      { id: 'r', name: 'SERVICE_USER' },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe(`${TENANT_PATH}/ssousers/${SSO_USER}/roles`)
  })

  it("gets an SSO user's groups with their roles", async () => {
    respond({ data: { groups: [{ id: 'g', sharedServiceRoles: [{ name: 'NOTIFY_VIEWER' }] }] } })

    await expect(buildClient().getUserGroupsWithRoles(TENANT, SSO_USER)).resolves.toEqual([
      { id: 'g', sharedServiceRoles: [{ name: 'NOTIFY_VIEWER' }] },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${TENANT_PATH}/users/${SSO_USER}/groups/shared-service-roles`,
    )
  })

  it('returns empty lists when CSTAR omits them', async () => {
    respond({ data: {} })
    const client = buildClient()

    await expect(client.getTenantSharedServices(TENANT)).resolves.toEqual([])
    await expect(client.getSsoUserTenantRoles(TENANT, SSO_USER)).resolves.toEqual([])
    await expect(client.getUserGroupsWithRoles(TENANT, SSO_USER)).resolves.toEqual([])
  })

  it('rejects an ssoUserId that could change the request path', async () => {
    await expect(buildClient().getUserGroupsWithRoles(TENANT, '../..')).rejects.toThrow(
      BadRequestException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks health without a token', async () => {
    respond({ apiStatus: 'Healthy', time: '2026-11-20T10:00:00Z' })

    await expect(buildClient().getHealth()).resolves.toEqual({
      apiStatus: 'Healthy',
      time: '2026-11-20T10:00:00Z',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://cstar.example/api/v1/health')
    expect(init.headers.Authorization).toBeUndefined()
  })
})
