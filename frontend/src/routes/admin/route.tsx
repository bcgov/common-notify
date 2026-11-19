import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

/**
 * Parent of every /admin/* page. Its beforeLoad runs before any child's, so an admin page is
 * guarded by being in this folder rather than by remembering to add the check itself.
 */
export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: Outlet,
})
