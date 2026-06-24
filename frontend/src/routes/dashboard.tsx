import { createFileRoute, redirect } from '@tanstack/react-router'
import Dashboard from '@/pages/dashboard/Dashboard'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => {
    if (
      !UserService.hasRole([
        UserRole.NOTIFY_OPERATIONS_ADMIN,
        UserRole.NOTIFY_TEMPLATE_EDITOR,
        UserRole.NOTIFY_VIEWER,
      ])
    ) {
      if (UserService.hasRole(UserRole.NOTIFY_ADMIN)) {
        throw redirect({ to: '/admin/feature-flags' })
      }
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <Dashboard />
}
