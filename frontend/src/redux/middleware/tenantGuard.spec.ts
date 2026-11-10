import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAllTenantsUsage,
  getApiKeyUsage,
  type PaginatedAdminUsageResponse,
  type TenantUsageResponse,
} from '@/api/apiKeyUsage.api'
import { issueApiKey as issueApiKeyApi } from '@/api/apiKeys.api'
import { updateTenantSettings as updateTenantSettingsApi } from '@/api/settings.api'
import cstarApi from '@/api/cstar.api'
import type { Tenant } from '@/interfaces/CstarTenant'
import tenant, { selectTenant } from '../slices/tenant.slice'
import cstar from '../slices/cstar.slice'
import user from '../slices/user.slice'
import apiKeys from '../slices/apiKeys.slice'
import apiKeyUsage from '../slices/apiKeyUsage.slice'
import tenantSettings from '../slices/tenantSettings.slice'
import { fetchAllTenantsUsage, fetchApiKeyUsage } from '../thunks/apiKeyUsage.thunks'
import { issueApiKey } from '../thunks/apiKeys.thunks'
import { updateTenantSettings } from '../thunks/settings.thunks'
import { fetchCstarRoles, fetchCstarTenants } from '../thunks/cstar.thunks'
import type { AppDispatch } from '../store'
import { tenantGuardMiddleware } from './tenantGuard'

vi.mock('@/api/apiKeyUsage.api', () => ({ getApiKeyUsage: vi.fn(), getAllTenantsUsage: vi.fn() }))
vi.mock('@/api/apiKeys.api', () => ({ issueApiKey: vi.fn() }))
vi.mock('@/api/settings.api', () => ({ updateTenantSettings: vi.fn() }))
vi.mock('@/api/cstar.api', () => ({
  default: { fetchUserTenants: vi.fn(), fetchUserRoles: vi.fn() },
}))

function makeTenant(id: string): Tenant {
  return {
    id,
    name: id,
    ministryName: 'Ministry',
    createdDateTime: '',
    updatedDateTime: '',
    createdBy: '',
    updatedBy: '',
    users: [],
  }
}

const tenantA = makeTenant('tenant-a')
const tenantB = makeTenant('tenant-b')

function usage(tenantId: string, rateLimitPerMinute: number): TenantUsageResponse {
  return {
    tenantId,
    fiscalYearStart: '2026-04-01',
    channels: [
      {
        channel: 'EMAIL',
        rateLimitPerMinute,
        dailyLimit: 10000,
        annualLimit: 100000,
        warnThresholdPercent: 80,
        usedThisMinute: 0,
        usedToday: 0,
        usedThisYear: 0,
      },
    ],
  }
}

/** A promise the test settles by hand, standing in for a slow API call. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setupStore() {
  const store = configureStore({
    reducer: { tenant, cstar, user, apiKeys, apiKeyUsage, tenantSettings },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(tenantGuardMiddleware),
  })
  store.dispatch(selectTenant(tenantA))
  return { ...store, dispatch: store.dispatch as AppDispatch }
}

describe('tenantGuardMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('drops a result that resolves after switching tenant', async () => {
    const store = setupStore()
    const response = deferred<TenantUsageResponse>()
    vi.mocked(getApiKeyUsage).mockReturnValue(response.promise)

    const request = store.dispatch(fetchApiKeyUsage())
    store.dispatch(selectTenant(tenantB))
    response.resolve(usage(tenantA.id, 999))
    await request

    // Neither the usage panel nor the Settings rate limit shows tenant A's numbers under B.
    expect(store.getState().apiKeyUsage.usage).toBeNull()
    expect(store.getState().tenantSettings.rateLimitPerMinute).toBeUndefined()
  })

  it('drops a rejection that arrives after switching tenant', async () => {
    const store = setupStore()
    const response = deferred<Awaited<ReturnType<typeof updateTenantSettingsApi>>>()
    vi.mocked(updateTenantSettingsApi).mockReturnValue(response.promise)

    const request = store.dispatch(
      updateTenantSettings({ alertEmail: null, defaultSenderEmail: null }),
    )
    store.dispatch(selectTenant(tenantB))
    response.reject(new Error('Tenant A failed'))
    await request

    // Tenant A's save error isn't shown on tenant B's Settings.
    expect(store.getState().tenantSettings.error).toBeUndefined()
  })

  it('passes through results for the tenant still selected', async () => {
    const store = setupStore()
    vi.mocked(getApiKeyUsage).mockResolvedValue(usage(tenantA.id, 500))

    await store.dispatch(fetchApiKeyUsage())

    expect(store.getState().apiKeyUsage.usage).toEqual(usage(tenantA.id, 500))
    expect(store.getState().tenantSettings.rateLimitPerMinute).toEqual({ EMAIL: 500, SMS: null })
  })

  it('still settles the thunk promise for callers when the result is dropped', async () => {
    const store = setupStore()
    const response = deferred<TenantUsageResponse>()
    vi.mocked(getApiKeyUsage).mockReturnValue(response.promise)

    const request = store.dispatch(fetchApiKeyUsage())
    store.dispatch(selectTenant(tenantB))
    response.resolve(usage(tenantA.id, 999))

    await expect(request.unwrap()).resolves.toEqual(usage(tenantA.id, 999))
  })

  it('lets opted-out cross-tenant thunks through a switch', async () => {
    const store = setupStore()
    const adminResponse = deferred<PaginatedAdminUsageResponse>()
    const tenantsResponse = deferred<{ data: { tenants: Tenant[] } }>()
    vi.mocked(getAllTenantsUsage).mockReturnValue(adminResponse.promise)
    vi.mocked(cstarApi.fetchUserTenants).mockReturnValue(
      tenantsResponse.promise as ReturnType<typeof cstarApi.fetchUserTenants>,
    )

    const adminRequest = store.dispatch(fetchAllTenantsUsage())
    const tenantsRequest = store.dispatch(fetchCstarTenants())
    store.dispatch(selectTenant(tenantB))
    adminResponse.resolve({ data: [], count: 7, page: 1, limit: 15, totalPages: 1 })
    tenantsResponse.resolve({ data: { tenants: [tenantA, tenantB] } })
    await Promise.all([adminRequest, tenantsRequest])

    expect(store.getState().apiKeyUsage.adminCount).toBe(7)
    expect(store.getState().cstar.tenants).toEqual([tenantA, tenantB])
    expect(store.getState().tenant.selectedTenant).toEqual(tenantB)
  })

  it('does not leave a save flag stuck after switching tenant mid-save', async () => {
    const store = setupStore()
    const settingsSave = deferred<Awaited<ReturnType<typeof updateTenantSettingsApi>>>()
    const keyIssue = deferred<Awaited<ReturnType<typeof issueApiKeyApi>>>()
    vi.mocked(updateTenantSettingsApi).mockReturnValue(settingsSave.promise)
    vi.mocked(issueApiKeyApi).mockReturnValue(keyIssue.promise)

    const settingsRequest = store.dispatch(
      updateTenantSettings({ alertEmail: null, defaultSenderEmail: null }),
    )
    const keyRequest = store.dispatch(issueApiKey(undefined))
    expect(store.getState().tenantSettings.saving).toBe(true)
    expect(store.getState().apiKeys.saving).toBe(true)

    store.dispatch(selectTenant(tenantB))
    settingsSave.resolve({} as Awaited<ReturnType<typeof updateTenantSettingsApi>>)
    keyIssue.resolve({} as Awaited<ReturnType<typeof issueApiKeyApi>>)
    await Promise.all([settingsRequest, keyRequest])

    expect(store.getState().tenantSettings.saving).toBe(false)
    expect(store.getState().apiKeys.saving).toBe(false)
    expect(store.getState().apiKeys.keys).toEqual([])
  })

  it("keeps the selected tenant's roles when the previous tenant's roles arrive last", async () => {
    const store = setupStore()
    const rolesA = deferred<{ data: { roles: string[] } }>()
    const rolesB = deferred<{ data: { roles: string[] } }>()
    vi.mocked(cstarApi.fetchUserRoles).mockImplementation(
      (tenantId: string) =>
        (tenantId === tenantA.id ? rolesA.promise : rolesB.promise) as ReturnType<
          typeof cstarApi.fetchUserRoles
        >,
    )

    const requestA = store.dispatch(fetchCstarRoles({ tenantId: tenantA.id }))
    store.dispatch(selectTenant(tenantB))
    const requestB = store.dispatch(fetchCstarRoles({ tenantId: tenantB.id }))
    rolesB.resolve({ data: { roles: ['viewer'] } })
    await requestB
    rolesA.resolve({ data: { roles: [] } })
    await requestA

    expect(store.getState().user.rolesTenantId).toBe(tenantB.id)
    expect(store.getState().user.rolesLoading).toBe(false)
    expect(store.getState().user.rolesError).toBeNull()
  })
})
