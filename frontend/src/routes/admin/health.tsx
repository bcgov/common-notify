import { createFileRoute, redirect } from '@tanstack/react-router'

/** No page of its own: provider and Redis details are on System, so links here go there. */
export const Route = createFileRoute('/admin/health')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/monitoring', replace: true })
  },
})
