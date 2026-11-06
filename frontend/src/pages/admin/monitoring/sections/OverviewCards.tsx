import type { FC } from 'react'
import SummaryCard from '@/components/SummaryCard'
import MeterBar from '@/components/MeterBar'
import { StatusBadge } from '@/components/StatusBadge'
import type {
  MessageChannelStats,
  MonitoringOverview,
  RedisStats,
} from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, backlogSummary, formatBytes, formatDuration } from '@/utils/monitoring'

interface OverviewCardsProps {
  overview: MonitoringOverview
  messages: MessageChannelStats[]
  redis: RedisStats
}

/** What the backlog card says under its count: nothing waiting, stalled, or an estimate. */
function backlogLabel(pending: number, stuck: boolean, clears: number | null): string {
  if (pending === 0) return 'Nothing waiting'
  if (stuck) return 'Not sending'
  return `Clears in ~${(clears ?? 0).toLocaleString()} min`
}

type TimeToSend = MonitoringOverview['timeToSend']

/** A batch's rows queue behind each other, so it is described by its start and finish. */
function batchLine(batch: NonNullable<TimeToSend['batch']>): string {
  const finish =
    batch.finishMedianMs === null
      ? 'none finished yet'
      : `finish in ~${formatDuration(batch.finishMedianMs)}`
  return `Batches (${batch.batches.toLocaleString()}): start in ~${formatDuration(batch.startMedianMs)}, ${finish}`
}

const TimeToSendDetail: FC<{ timeToSend: TimeToSend }> = ({ timeToSend: { single, batch } }) => {
  if (!single && !batch) return <p>Nothing sent in the last hour</p>
  return (
    <>
      {single && (
        <p>
          95% within {formatDuration(single.p95Ms)} · {single.requests.toLocaleString()} single
          sends in the last hour
        </p>
      )}
      {batch && <p>{batchLine(batch)}</p>}
    </>
  )
}

/** The four headline numbers: how fast, how much, how far behind, and how close to full. */
const OverviewCards: FC<OverviewCardsProps> = ({ overview, messages, redis }) => {
  const {
    pending,
    oldestPendingAgeMs: oldest,
    clearsInMinutes: clears,
    stuck,
  } = backlogSummary(messages)
  const memoryText =
    redis.maxMemoryBytes === null
      ? `${formatBytes(redis.usedMemoryBytes)} used, no cap set`
      : `${formatBytes(redis.usedMemoryBytes)} of ${formatBytes(redis.maxMemoryBytes)}`

  return (
    <div className="summary-card-grid">
      <SummaryCard
        title="Time to send"
        value={
          overview.timeToSend.single
            ? `${formatDuration(overview.timeToSend.single.medianMs)} median`
            : '—'
        }
      >
        <TimeToSendDetail timeToSend={overview.timeToSend} />
      </SummaryCard>

      <SummaryCard title="Last hour" value={`${overview.messagesSent.toLocaleString()} sent`}>
        <p>
          {overview.sendingRate
            ? `Sends ~${overview.sendingRate.perMinute.toLocaleString()}/min (measured over ${formatDuration(overview.sendingRate.busySeconds * 1000)} of sending)`
            : 'Not enough sending to estimate a rate'}
        </p>
        <p>{overview.requestsReceived.toLocaleString()} requests received</p>
        <p>
          {overview.messagesFailed.toLocaleString()} failed ({overview.failurePercent}%)
        </p>
      </SummaryCard>

      <SummaryCard title="Backlog" value={`${pending.toLocaleString()} pending`}>
        <p>Oldest {oldest === null ? '—' : formatDuration(oldest)}</p>
        <p>{backlogLabel(pending, stuck, clears)}</p>
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
