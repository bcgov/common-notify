import { createFileRoute, redirect } from '@tanstack/react-router'
import TemplateCreate from '@/pages/templates/TemplateCreate'
import UserService, { UserRole } from '@/service/user-service'

export const Route = createFileRoute('/template-create')({
  beforeLoad: () => {
    if (!UserService.hasRole([UserRole.NOTIFY_OPERATIONS_ADMIN, UserRole.NOTIFY_TEMPLATE_EDITOR])) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: TemplateCreate,
})
