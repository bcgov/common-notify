import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import { fetchCstarTenants } from '@/redux/thunks/cstar.thunks'
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
    console.log('[App Init] Dispatching fetchCodeTables...')
    dispatch(fetchCodeTables())
  }, [dispatch])

  useEffect(() => {
    // Fetch tenants only once per user session
    // Don't re-fetch based on Redux state changes
    if (!user?.id) {
      console.log('[App Init] Waiting for user...')
      return
    }

    // Only fetch if we haven't already fetched for this user
    if (fetchedUserIdRef.current === user.id) {
      console.log('[App Init] Already fetched tenants for user:', user.id)
      return
    }

    console.log('[App Init] Dispatching fetchCstarTenants for user:', user.id)
    fetchedUserIdRef.current = user.id
    dispatch(fetchCstarTenants(user.id))
  }, [dispatch, user?.id]) // Only depend on user?.id, not Redux state

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
