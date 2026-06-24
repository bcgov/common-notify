import DistributionLists from '@/pages/distribution-lists/DistributionLists'
import { createFileRoute, redirect } from '@tanstack/react-router'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/distribution-lists')({
  beforeLoad: () => {
    if (
      !UserService.hasRole([
        UserRole.NOTIFY_OPERATIONS_ADMIN,
        UserRole.NOTIFY_TEMPLATE_EDITOR,
        UserRole.NOTIFY_VIEWER,
      ])
    ) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <DistributionLists />
}
