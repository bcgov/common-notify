import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import { fetchCstarTenants } from '@/redux/thunks/cstar.thunks'
import { fetchAllFeatureFlags } from '@/redux/slices/featureFlags.slice'
import { fetchAllNotifyTenants } from '@/redux/thunks/adminTenants.thunks'
import NotFound from '@/components/NotFound'
import Layout from '@/components/Layout'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})

function RootLayout() {
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)

  // Track which user we've already fetched tenants for to avoid duplicate fetches
  const fetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Load code tables once when app starts
    dispatch(fetchCodeTables())
  }, [dispatch])

  useEffect(() => {
    // Load feature flags and admin tenants once when app starts
    // The backend will return 401/403 if user isn't an admin, which is handled gracefully
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
    dispatch(fetchCstarTenants(user.id))
  }, [dispatch, user?.id]) // Only depend on user?.id, not Redux state

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
