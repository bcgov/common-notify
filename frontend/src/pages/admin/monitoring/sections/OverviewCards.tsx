import type { FC } from 'react'
import SummaryCard from '@/components/SummaryCard'
import type {
  MessageChannelStats,
  MonitoringOverview,
} from '@/interfaces/queueMonitoring.interface'
import { backlogSummary, formatAgo, formatDuration } from '@/utils/monitoring'

interface OverviewCardsProps {
  overview: MonitoringOverview
  messages: MessageChannelStats[]
  now: number
}

/** The totals' day and month boundaries are Pacific, so the label is too. */
const MONTH_DAY = new Intl.DateTimeFormat('en-CA', {
  month: 'long',
  day: 'numeric',
  timeZone: 'America/Vancouver',
})

/** What the backlog card says under its count: nothing waiting, stalled, or an estimate. */
function backlogLabel(pending: number, stuck: boolean, clears: number | null): string {
  if (pending === 0) return 'Nothing waiting'
  if (stuck) return 'Not sending'
  return `Clears in ~${(clears ?? 0).toLocaleString()} min`
}

/** Failed as a share of everything that finished today, to one decimal place. */
function failureShare(failed: number, sent: number): number {
  const finished = failed + sent
  return finished > 0 ? Math.round((failed / finished) * 1000) / 10 : 0
}

/** The headline numbers: the last hour, what is waiting, today and this month, and failures. */
const OverviewCards: FC<OverviewCardsProps> = ({ overview, messages, now }) => {
  const {
    pending,
    oldestPendingAgeMs: oldest,
    clearsInMinutes: clears,
    stuck,
  } = backlogSummary(messages)
  const { totals } = overview

  return (
    <div className="summary-card-grid">
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

      <SummaryCard title="Today" value={`${totals.sentToday.toLocaleString()} sent`}>
        <p>Since midnight, Pacific time</p>
      </SummaryCard>

      <SummaryCard title="This month" value={`${totals.sentThisMonth.toLocaleString()} sent`}>
        <p>Since {MONTH_DAY.format(new Date(totals.monthStart))}</p>
      </SummaryCard>

      <SummaryCard title="Failures" value={`${totals.failedToday.toLocaleString()} today`}>
        <p>{failureShare(totals.failedToday, totals.sentToday)}% of today’s messages</p>
        <p>{overview.messagesFailed.toLocaleString()} in the last hour</p>
        <p>
          {totals.lastFailureAt
            ? `Last failure ${formatAgo(totals.lastFailureAt, now)}`
            : 'None this month'}
        </p>
      </SummaryCard>
    </div>
  )
}

export default OverviewCards
