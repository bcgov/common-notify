import { createFileRoute, redirect } from '@tanstack/react-router'
import QueueMonitoring, { MONITORING_TABS } from '@/pages/admin/monitoring/QueueMonitoring'
import type { MonitoringTab } from '@/pages/admin/monitoring/QueueMonitoring'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'

export const Route = createFileRoute('/admin/monitoring')({
  beforeLoad: () => {
    if (!UserService.hasRole(SsoRole.NOTIFY_ADMIN)) {
      throw redirect({ to: '/not-authorized' })
    }
  },
  // The tab is in the URL so a refresh or a shared link opens the same view.
  validateSearch: (search: Record<string, unknown>): { tab?: MonitoringTab } =>
    typeof search.tab === 'string' && MONITORING_TABS.includes(search.tab as MonitoringTab)
      ? { tab: search.tab as MonitoringTab }
      : {},
  component: MonitoringPage,
})

function MonitoringPage() {
  const { tab = 'overview' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <QueueMonitoring
      tab={tab}
      onTabChange={(next) =>
        navigate({ search: next === 'overview' ? {} : { tab: next }, replace: true })
      }
    />
  )
}
