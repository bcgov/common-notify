import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAppDispatch } from '@/redux/hooks'
import { fetchCodeTables } from '@/redux/thunks/codeTables.thunks'
import NotFound from '@/components/NotFound'
import Layout from '@/components/Layout'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})

function RootLayout() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    // Load code tables once when app starts
    dispatch(fetchCodeTables())
  }, [dispatch])

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
