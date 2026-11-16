import { createFileRoute, redirect } from '@tanstack/react-router'

/** The page moved to Manage Tenants; old links and bookmarks go there. */
export const Route = createFileRoute('/admin/usage')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/tenants', replace: true })
  },
})
