import type { FC } from 'react'
import SummaryCard from '@/components/SummaryCard'
import MeterBar from '@/components/MeterBar'
import { StatusBadge } from '@/components/StatusBadge'
import type {
  MessageChannelStats,
  MonitoringOverview,
  RedisStats,
} from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatBytes, formatDuration } from '@/utils/monitoring'

interface OverviewCardsProps {
  overview: MonitoringOverview
  messages: MessageChannelStats[]
  redis: RedisStats
}

/** The four headline numbers: how fast, how much, how far behind, and how close to full. */
const OverviewCards: FC<OverviewCardsProps> = ({ overview, messages, redis }) => {
  const pending = messages.reduce((sum, m) => sum + m.pending, 0)
  const oldest = messages.reduce<number | null>(
    (max, m) => (m.oldestPendingAgeMs === null ? max : Math.max(max ?? 0, m.oldestPendingAgeMs)),
    null,
  )
  const clears = messages.reduce<number | null>((max, m) => {
    if (m.estimatedClearMinutes === null || m.estimatedClearMinutes === 0) return max
    return Math.max(max ?? 0, m.estimatedClearMinutes)
  }, null)
  const stuck = messages.some((m) => m.pending > 0 && m.estimatedClearMinutes === null)
  const memoryText =
    redis.maxMemoryBytes === null
      ? `${formatBytes(redis.usedMemoryBytes)} used, no cap set`
      : `${formatBytes(redis.usedMemoryBytes)} of ${formatBytes(redis.maxMemoryBytes)}`

  return (
    <div className="summary-card-grid">
      <SummaryCard
        title="Delivery time"
        value={
          overview.deliveryTime ? `${formatDuration(overview.deliveryTime.medianMs)} median` : '—'
        }
      >
        {overview.deliveryTime ? (
          <>
            <p>95% within {formatDuration(overview.deliveryTime.p95Ms)}</p>
            <p>
              Accepted to handed to the provider, {overview.deliveryTime.messages.toLocaleString()}{' '}
              messages in the last hour
            </p>
          </>
        ) : (
          <p>Nothing sent in the last hour</p>
        )}
      </SummaryCard>

      <SummaryCard title="Last hour" value={`${overview.messagesSent.toLocaleString()} sent`}>
        <p>{overview.sentPerMinute.toLocaleString()}/min on average</p>
        <p>{overview.requestsReceived.toLocaleString()} requests received</p>
        <p>
          {overview.messagesFailed.toLocaleString()} failed ({overview.failurePercent}%)
        </p>
      </SummaryCard>

      <SummaryCard title="Backlog" value={`${pending.toLocaleString()} pending`}>
        <p>Oldest {oldest === null ? '—' : formatDuration(oldest)}</p>
        <p>
          {pending === 0
            ? 'Nothing waiting'
            : stuck
              ? 'Not sending'
              : `Clears in ~${(clears ?? 0).toLocaleString()} min`}
        </p>
      </SummaryCard>

      <SummaryCard
        title="Redis memory"
        value={redis.usedMemoryPercent === null ? '—' : `${redis.usedMemoryPercent}%`}
      >
        {redis.usedMemoryPercent !== null && (
          <MeterBar
            label="Redis memory used"
            percent={redis.usedMemoryPercent}
            valueText={`${memoryText} (${redis.usedMemoryPercent}%)`}
            status={redis.status}
          />
        )}
        <p>{memoryText}</p>
        <StatusBadge status={redis.status} statusLabel={HEALTH_LABELS[redis.status]} />
      </SummaryCard>
    </div>
  )
}

export default OverviewCards
