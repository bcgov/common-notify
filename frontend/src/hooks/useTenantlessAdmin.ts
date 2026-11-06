import { useEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '@/redux/hooks'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const isAdminPath = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/')

/**
 * NOTIFY_ADMIN is the one role that works without a tenant, and only in the admin section:
 * every /admin page is cross-tenant. Once CSTAR has answered with no tenants (or failed, as it
 * does for a user it has never seen), an admin anywhere else is sent to the admin Overview.
 *
 * @returns whether the user is an admin with no tenant, so callers can skip tenant gating
 */
export function useTenantlessAdmin(): boolean {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tenantCount = useAppSelector((state) => state.cstar.tenants.length)
  const settled = useAppSelector((state) => state.cstar.hasLoaded && !state.cstar.isLoading)
  const hasTenant = useAppSelector((state) => state.tenant.selectedTenant !== null)

  const tenantlessAdmin =
    settled && !hasTenant && tenantCount === 0 && UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const leaveForAdmin = tenantlessAdmin && !isAdminPath(pathname)

  useEffect(() => {
    if (leaveForAdmin) navigate({ to: '/admin', replace: true })
  }, [leaveForAdmin, navigate])

  return tenantlessAdmin
}
