import { createRootRoute, ErrorComponent, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import { fetchCstarTenants } from '@/redux/thunks/cstar.thunks'
import { fetchAllFeatureFlags } from '@/redux/slices/featureFlags.slice'
import { fetchAllNotifyTenants } from '@/redux/thunks/adminTenants.thunks'
import NotFound from '@/components/NotFound'
import Layout from '@/components/Layout'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})

function RootLayout() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)
  const cstarTenants = useAppSelector((state) => state.cstar.tenants)
  const cstarIsLoading = useAppSelector((state) => state.cstar.isLoading)
  const cstarHasLoaded = useAppSelector((state) => state.cstar.hasLoaded)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  // Track which user we've already fetched tenants for to avoid duplicate fetches
  const fetchedUserIdRef = useRef<string | null>(null)
  const checkAuthorizationRef = useRef<boolean>(false)
  const adminDataFetchedRef = useRef<boolean>(false)

  useEffect(() => {
    // Load code tables once when app starts
    dispatch(fetchCodeTables())
  }, [dispatch])

  useEffect(() => {
    // Load feature flags and admin tenants only if user is NOTIFY_ADMIN
    // The backend will return 401/403 if user isn't an admin, so skip the fetch entirely
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      adminDataFetchedRef.current = true
      return
    }

    if (adminDataFetchedRef.current) {
      return
    }

    adminDataFetchedRef.current = true
    dispatch(fetchAllFeatureFlags()).catch(() => {
      // Silently fail if user isn't admin
    })
    dispatch(fetchAllNotifyTenants()).catch(() => {
      // Silently fail if user isn't admin
    })
  }, [dispatch])

  useEffect(() => {
    // Fetch tenants only once per user session
    // Don't re-fetch based on Redux state changes
    if (!user?.id) {
      return
    }

    // Only fetch if we haven't already fetched for this user
    if (fetchedUserIdRef.current === user.id) {
      return
    }

    fetchedUserIdRef.current = user.id
    dispatch(fetchCstarTenants())
  }, [dispatch, user?.id]) // Only depend on user?.id, not Redux state

  useEffect(() => {
    // Check authorization status after tenants have been loaded
    // If user is authenticated but has no tenants, show NotAuthorized page
    if (!user?.id) {
      checkAuthorizationRef.current = false
      return
    }

    // Only check once CSTAR has actually returned.
    // `cstarIsLoading` is not enough on its own: the effect above dispatches the
    // tenant fetch in this same commit, so this effect still sees the pre-dispatch
    // snapshot (isLoading === false, tenants === []). On a first login there is no
    // tenant in localStorage either, so the check below would fire before CSTAR had
    // been asked and strand the user on /not-authorized.
    if (!cstarHasLoaded || cstarIsLoading) {
      return
    }

    // Only check once per session
    if (checkAuthorizationRef.current) {
      return
    }

    checkAuthorizationRef.current = true

    // Check user's authorization status
    const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)

    // If user has no CSTAR tenants AND no tenant is selected:
    // - If they are NOTIFY_ADMIN: redirect to feature flags (bootstrap/admin access)
    // - If they are not NOTIFY_ADMIN: redirect to not-authorized (no access)
    // NOTE: Only show not-authorized if tenant is not set. A tenant may be set from
    // localStorage even if CSTAR failed/returned no tenants during this session.
    if (cstarTenants.length === 0 && !selectedTenant) {
      if (isAdmin) {
        navigate({ to: '/admin/feature-flags' })
      } else {
        navigate({ to: '/not-authorized' })
      }
    }
  }, [user?.id, cstarTenants, cstarIsLoading, cstarHasLoaded, selectedTenant, navigate])

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
