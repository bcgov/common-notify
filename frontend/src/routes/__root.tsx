import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
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

  useEffect(() => {
    // Load code tables once when app starts
    dispatch(fetchCodeTables())
  }, [dispatch])

  useEffect(() => {
    if (!user?.id) {
      return
    }

    dispatch(fetchCstarTenants(user.id))
  }, [dispatch, user])

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
