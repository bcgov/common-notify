import { createFileRoute, redirect } from '@tanstack/react-router'
import NotificationEvents from '@/pages/notification-events/NotificationEvents'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/notification-events')({
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
  component: NotificationEventsPage,
})

function NotificationEventsPage() {
  return <NotificationEvents />
}
