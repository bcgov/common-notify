import { createFileRoute, redirect } from '@tanstack/react-router'
import Templates from '@/pages/templates/Templates'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/templates')({
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
  component: TemplatesPage,
})

function TemplatesPage() {
  return <Templates />
}
