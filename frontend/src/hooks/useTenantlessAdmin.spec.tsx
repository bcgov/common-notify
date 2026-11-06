import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactNode } from 'react'
import tenantReducer from '@/redux/slices/tenant.slice'
import cstarReducer from '@/redux/slices/cstar.slice'
import UserService from '@/service/user-service'
import { isAdminPath, useTenantlessAdmin } from './useTenantlessAdmin'

const router = vi.hoisted(() => ({ pathname: '/', navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: router.pathname }),
  useNavigate: () => router.navigate,
}))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn() } }))

const TENANT = { id: 'tenant-1', name: 'Tenant One' }

function run({
  admin = true,
  pathname = '/',
  tenants = [] as (typeof TENANT)[],
  selectedTenant = null as typeof TENANT | null,
  hasLoaded = true,
  error = null as string | null,
} = {}) {
  vi.mocked(UserService.hasRole).mockReturnValue(admin)
  router.pathname = pathname
  const store = configureStore({
    reducer: { tenant: tenantReducer, cstar: cstarReducer },
    preloadedState: {
      tenant: { selectedTenant: selectedTenant as never, showTenantModal: false },
      cstar: { tenants: tenants as never, isLoading: false, hasLoaded, error },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  return renderHook(() => useTenantlessAdmin(), { wrapper }).result.current
}

describe('useTenantlessAdmin', () => {
  beforeEach(() => router.navigate.mockReset())

  it('sends an admin with no tenants from a tenant page to the admin Overview', () => {
    expect(run({ pathname: '/templates' })).toBe(true)
    expect(router.navigate).toHaveBeenCalledWith({ to: '/admin', replace: true })
  })

  it('treats CSTAR not knowing the admin the same as having no tenants', () => {
    expect(run({ error: 'User not found in CSTAR' })).toBe(true)
    expect(router.navigate).toHaveBeenCalledWith({ to: '/admin', replace: true })
  })

  it('leaves an admin with no tenants where they are inside the admin section', () => {
    expect(run({ pathname: '/admin/usage' })).toBe(true)
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-admin', { admin: false }],
    ['an admin with tenants', { tenants: [TENANT] }],
    ['an admin with a tenant selected', { selectedTenant: TENANT }],
    ['an admin before CSTAR has answered', { hasLoaded: false }],
  ])('does nothing for %s', (_, options) => {
    expect(run({ pathname: '/templates', ...options })).toBe(false)
    expect(router.navigate).not.toHaveBeenCalled()
  })
})

describe('isAdminPath', () => {
  it.each([
    ['/admin', true],
    ['/admin/monitoring', true],
    ['/administrator', false],
    ['/', false],
  ])('%s → %s', (pathname, expected) => {
    expect(isAdminPath(pathname)).toBe(expected)
  })
})
