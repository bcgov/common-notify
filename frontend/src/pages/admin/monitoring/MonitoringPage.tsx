import type { FC, ReactNode } from 'react'
import PageHeading from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import Alert from '@/components/Alert'
import HealthBanner from '@/components/HealthBanner'
import LiveUpdateControls from '@/components/LiveUpdateControls'
import NotAuthorized from '@/components/NotAuthorized'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import type { QueueMonitoring } from '@/interfaces/queueMonitoring.interface'
import {
  HEALTH_LABELS,
  MONITORING_PAGES,
  backlogSummary,
  monitoringWarnings,
} from '@/utils/monitoring'
import { FALLBACK_INTERVAL_MS, useMonitoringSnapshot } from './useMonitoringSnapshot'
import '@/scss/components/queue-monitoring.scss'

interface MonitoringPageProps {
  /** Which monitoring page this is, so the warnings banner doesn't link to the page it is on. */
  page: keyof typeof MONITORING_PAGES
  title: string
  meta: string
  /** The page's sections, given the latest snapshot and the time it was taken. */
  children: (data: QueueMonitoring, now: number) => ReactNode
}

/** The headline beside the controls: overall health, and how much is waiting to send. */
const OverallStatus: FC<{ data: QueueMonitoring }> = ({ data }) => {
  const { pending, clearsInMinutes } = backlogSummary(data.messages)
  return (
    <>
      <StatusBadge status={data.status} statusLabel={HEALTH_LABELS[data.status]} />
      <span>{pending.toLocaleString()} messages pending</span>
      {clearsInMinutes !== null && <span>Clears in ~{clearsInMinutes.toLocaleString()} min</span>}
    </>
  )
}

/**
 * The frame of each admin monitoring page: heading, overall status, live-update controls,
 * every current warning, and the loading and error states. The page supplies its sections.
 */
const MonitoringPage: FC<MonitoringPageProps> = ({ page, title, meta, children }) => {
  // The /admin route already redirects non-admins; this keeps the page from calling the API
  // if it is ever rendered somewhere that guard doesn't cover.
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const snapshot = useMonitoringSnapshot(isAdmin)
  const { data, error, isLoading } = snapshot

  if (!isAdmin) {
    return <NotAuthorized />
  }

  const here = MONITORING_PAGES[page].to
  const warnings = data
    ? monitoringWarnings(data).map((warning) =>
        warning.page?.to === here ? { message: warning.message } : warning,
      )
    : []
  return (
    <div className="page queue-monitoring">
      <PageHeading title={title} meta={meta} />

      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {snapshot.announcement}
      </div>

      <div className="queue-monitoring__toolbar">
        <div className="queue-monitoring__overall">{data && <OverallStatus data={data} />}</div>
        <LiveUpdateControls
          status={snapshot.liveStatus}
          isOn={snapshot.liveUpdates}
          onToggle={snapshot.setLiveUpdates}
          onRefresh={snapshot.refresh}
          isRefreshing={snapshot.isRefreshing}
          updatedAt={data?.generatedAt}
          fallbackSeconds={FALLBACK_INTERVAL_MS / 1000}
        />
      </div>

      <HealthBanner warnings={warnings} />

      {error && (
        <Alert variant="danger">
          {error}
          {data && ' Showing the last successful snapshot.'}
        </Alert>
      )}

      {isLoading && !data && (
        <output className="text-muted d-block">Loading monitoring data…</output>
      )}

      {data && children(data, new Date(data.generatedAt).getTime())}
    </div>
  )
}

export default MonitoringPage
