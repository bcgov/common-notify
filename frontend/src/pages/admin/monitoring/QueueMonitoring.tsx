import { useCallback, useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { Button, Switch } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import TabBar from '@/components/TabBar'
import type { TabBarItem } from '@/components/TabBar'
import { StatusBadge } from '@/components/StatusBadge'
import Alert from '@/components/Alert'
import NotAuthorized from '@/components/NotAuthorized'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import { usePolling } from '@/hooks/usePolling'
import { useLiveUpdates } from '@/hooks/useLiveUpdates'
import type { LiveStatus } from '@/hooks/useLiveUpdates'
import { connectQueueMonitoringStream, getQueueMonitoring } from '@/api/monitoring.api'
import type { HealthStatus } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatQueueName } from '@/utils/monitoring'
import OverviewCards from './sections/OverviewCards'
import MessagesSection from './sections/MessagesSection'
import SendsInProgressSection from './sections/SendsInProgressSection'
import RedisSection from './sections/RedisSection'
import QueuesSection from './sections/QueuesSection'
import WorkersSection from './sections/WorkersSection'
import ReconcilerSection from './sections/ReconcilerSection'
import ProvidersSection, { providerLabel } from './sections/ProvidersSection'
import RecentFailuresSection from './sections/RecentFailuresSection'
import '@/scss/components/queue-monitoring.scss'

/** Polled while the live stream is up: catches time-based changes (ages, stale heartbeats). */
export const BACKSTOP_INTERVAL_MS = 60_000
/** Polled while the stream is down or refused. */
export const FALLBACK_INTERVAL_MS = 15_000

const LIVE_STATUS_TEXT: Record<LiveStatus, string> = {
  off: 'Paused',
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: `Reconnecting… (updating every ${FALLBACK_INTERVAL_MS / 1000}s)`,
  unavailable: `Live updates unavailable (updating every ${FALLBACK_INTERVAL_MS / 1000}s)`,
}

/**
 * Admin view of the Bull queues, the pods working them and the Redis instance they live in.
 * Read-only: it shows whether notifications are flowing; acting on failures is out of scope.
 */
export type MonitoringTab = 'overview' | 'failures' | 'system'
export const MONITORING_TABS: MonitoringTab[] = ['overview', 'failures', 'system']

interface QueueMonitoringProps {
  tab: MonitoringTab
  onTabChange: (tab: MonitoringTab) => void
}

const QueueMonitoring: FC<QueueMonitoringProps> = ({ tab, onTabChange }) => {
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const [liveUpdates, setLiveUpdates] = useState(true)

  // The stream only says "something changed"; the snapshot still comes from the endpoint.
  const refreshRef = useRef<() => void>(() => {})
  const onChange = useCallback(() => {
    refreshRef.current()
  }, [])
  const liveStatus = useLiveUpdates(connectQueueMonitoringStream, isAdmin && liveUpdates, onChange)

  const { data, error, isLoading, isRefreshing, refresh } = usePolling(getQueueMonitoring, {
    intervalMs: liveStatus === 'live' ? BACKSTOP_INTERVAL_MS : FALLBACK_INTERVAL_MS,
    paused: !liveUpdates,
    skip: !isAdmin,
  })
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // Announce only changes in overall health, not every refresh.
  const [announcement, setAnnouncement] = useState('')
  const [announcedStatus, setAnnouncedStatus] = useState<HealthStatus | null>(null)
  if (data && data.status !== announcedStatus) {
    if (announcedStatus !== null) {
      setAnnouncement(`Queue health changed to ${HEALTH_LABELS[data.status]}`)
    }
    setAnnouncedStatus(data.status)
  }

  if (!isAdmin) {
    return <NotAuthorized />
  }

  const now = data ? new Date(data.generatedAt).getTime() : 0
  const pendingMessages = data?.messages.reduce((sum, m) => sum + m.pending, 0) ?? 0
  const slowest = data?.messages.reduce<number | null>((longest, m) => {
    if (m.estimatedClearMinutes === null || m.estimatedClearMinutes === 0) return longest
    return Math.max(longest ?? 0, m.estimatedClearMinutes)
  }, null)
  // Warnings live on the System tab but surface here, so none is hidden behind a tab.
  const warnings = data
    ? [
        ...data.redis.reasons.map((reason) => `Redis: ${reason}`),
        ...data.reconciler.reasons.map((reason) => `Delivery recovery: ${reason}`),
        ...data.providers.flatMap((provider) =>
          provider.reasons.map((reason) => `${providerLabel(provider)}: ${reason}`),
        ),
        ...data.queues.flatMap((queue) =>
          queue.reasons.map((reason) => `${formatQueueName(queue.name)}: ${reason}`),
        ),
      ]
    : []

  const tabs: TabBarItem<MonitoringTab>[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'failures', label: `Failures (${data?.recentFailures.length ?? 0})` },
    { id: 'system', label: 'System' },
  ]

  return (
    <div className="page queue-monitoring">
      <PageHeading title="Monitoring" meta="Notification delivery across every pod. Read-only." />

      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announcement}
      </div>

      <div className="queue-monitoring__toolbar">
        <div className="queue-monitoring__overall">
          {data && (
            <>
              <StatusBadge status={data.status} statusLabel={HEALTH_LABELS[data.status]} />
              <span>{pendingMessages.toLocaleString()} messages pending</span>
              {slowest != null && <span>Clears in ~{slowest.toLocaleString()} min</span>}
            </>
          )}
        </div>
        <div className="queue-monitoring__controls">
          {data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
          <span className="queue-monitoring__live" data-status={liveStatus}>
            {LIVE_STATUS_TEXT[liveStatus]}
          </span>
          <Switch isSelected={liveUpdates} onChange={setLiveUpdates}>
            Live updates
          </Switch>
          {/* A live stream already refetches on every change; manual refresh is for when it isn't. */}
          {liveStatus !== 'live' && (
            <Button variant="secondary" size="small" onPress={refresh} isDisabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <Alert variant="warning" role="status">
          <ul className="queue-monitoring__warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {tab !== 'system' && (
            <button
              type="button"
              className="queue-monitoring__link"
              onClick={() => onTabChange('system')}
            >
              View details on the System tab
            </button>
          )}
        </Alert>
      )}

      {error && (
        <Alert variant="danger">
          {error}
          {data && ' Showing the last successful snapshot.'}
        </Alert>
      )}

      {isLoading && !data && <output className="text-muted d-block">Loading queue health…</output>}

      {data && (
        <>
          <TabBar items={tabs} selected={tab} onSelect={onTabChange} label="Monitoring views" />

          {tab === 'overview' && (
            <>
              <OverviewCards overview={data.overview} messages={data.messages} redis={data.redis} />
              <MessagesSection messages={data.messages} />
              <SendsInProgressSection sends={data.sendsInProgress} now={now} />
            </>
          )}

          {tab === 'failures' && <RecentFailuresSection failures={data.recentFailures} now={now} />}

          {tab === 'system' && (
            <>
              <QueuesSection queues={data.queues} />
              <WorkersSection workers={data.workers} now={now} />
              <ProvidersSection providers={data.providers} />
              <ReconcilerSection reconciler={data.reconciler} now={now} />
              <RedisSection redis={data.redis} />
            </>
          )}
        </>
      )}
    </div>
  )
}

export default QueueMonitoring
