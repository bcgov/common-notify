import { useState } from 'react'
import type { FC } from 'react'
import { Button, Switch } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import { StatusBadge } from '@/components/StatusBadge'
import Alert from '@/components/Alert'
import NotAuthorized from '@/components/NotAuthorized'
import UserService from '@/service/user-service'
import { SsoRole } from '@/enum/sso-role.enum'
import { usePolling } from '@/hooks/usePolling'
import { getQueueMonitoring } from '@/api/monitoring.api'
import type { HealthStatus } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatDuration, formatQueueName } from '@/utils/monitoring'
import RedisSection from './sections/RedisSection'
import QueuesSection from './sections/QueuesSection'
import WorkersSection from './sections/WorkersSection'
import RecentFailuresSection from './sections/RecentFailuresSection'
import '@/scss/components/queue-monitoring.scss'

export const REFRESH_INTERVAL_MS = 15_000

/**
 * Admin view of the Bull queues, the pods working them and the Redis instance they live in.
 * Read-only: it shows whether notifications are flowing; acting on failures is out of scope.
 */
const QueueMonitoring: FC = () => {
  const isAdmin = UserService.hasRole(SsoRole.NOTIFY_ADMIN)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { data, error, isLoading, isRefreshing, refresh } = usePolling(getQueueMonitoring, {
    intervalMs: REFRESH_INTERVAL_MS,
    paused: !autoRefresh,
    skip: !isAdmin,
  })

  // Announce only changes in overall health, not every 15-second refresh.
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
  const backlog = data?.queues.reduce((sum, q) => sum + q.counts.waiting + q.counts.paused, 0) ?? 0
  const slowest = data?.queues.reduce<number | null>((longest, q) => {
    if (q.estimatedDrainMinutes === null || q.estimatedDrainMinutes === 0) return longest
    return Math.max(longest ?? 0, q.estimatedDrainMinutes)
  }, null)
  const notDraining = data?.queues.filter(
    (q) => q.estimatedDrainMinutes === null && q.counts.waiting + q.counts.paused > 0,
  )

  return (
    <div className="page queue-monitoring">
      <PageHeading
        title="Monitoring"
        meta="Queues, workers and Redis across every pod. Read-only."
      />

      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announcement}
      </div>

      <div className="queue-monitoring__toolbar">
        <div className="queue-monitoring__overall">
          {data && (
            <>
              <StatusBadge status={data.status} statusLabel={HEALTH_LABELS[data.status]} />
              <span>{backlog.toLocaleString()} waiting</span>
              {notDraining && notDraining.length > 0 ? (
                <span>
                  Not draining: {notDraining.map((q) => formatQueueName(q.name)).join(', ')}
                </span>
              ) : (
                slowest != null && <span>Clears in ~{slowest.toLocaleString()} min</span>
              )}
            </>
          )}
        </div>
        <div className="queue-monitoring__controls">
          {data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
          <Switch isSelected={autoRefresh} onChange={setAutoRefresh}>
            Auto-refresh every {formatDuration(REFRESH_INTERVAL_MS)}
          </Switch>
          <Button variant="secondary" size="small" onPress={refresh} isDisabled={isRefreshing}>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger">
          {error}
          {data && ' Showing the last successful snapshot.'}
        </Alert>
      )}

      {isLoading && !data && (
        <p role="status" className="text-muted">
          Loading queue health…
        </p>
      )}

      {data && (
        <>
          <RedisSection redis={data.redis} />
          <QueuesSection queues={data.queues} />
          <WorkersSection workers={data.workers} now={now} />
          <RecentFailuresSection failures={data.recentFailures} now={now} />
        </>
      )}
    </div>
  )
}

export default QueueMonitoring
