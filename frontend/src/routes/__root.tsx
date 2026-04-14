import { createRootRoute, ErrorComponent, Outlet } from '@tanstack/react-router'
import NotFound from '@/components/NotFound'
import Layout from '@/containers/layout'

export const Route = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
})
