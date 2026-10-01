import { createFileRoute, redirect } from '@tanstack/react-router'
import QueueMonitoring from '@/pages/admin/monitoring/QueueMonitoring'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const Route = createFileRoute('/admin/monitoring')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  component: MonitoringPage,
})

function MonitoringPage() {
  return <QueueMonitoring />
}
