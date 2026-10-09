import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import Sparkline from '@/components/Sparkline'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { MessageChannelStats } from '@/interfaces/queueMonitoring.interface'
import { formatDuration, formatMessageChannel, formatRate } from '@/utils/monitoring'

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

function clearText(row: MessageChannelStats): string {
  if (row.estimatedClearMinutes === 0) return 'Nothing pending'
  if (row.estimatedClearMinutes === null) return 'Not sending'
  return `~${row.estimatedClearMinutes.toLocaleString()} min`
}

const columns: TableColumn<MessageChannelStats>[] = [
  {
    key: 'channel',
    label: 'Channel',
    render: (_, row) => <span className="fw-semibold">{formatMessageChannel(row.channel)}</span>,
  },
  { key: 'pending', label: 'Pending', render: (_, row) => row.pending.toLocaleString() },
  {
    key: 'oldestPendingAgeMs',
    label: 'Oldest pending',
    render: (_, row) =>
      row.oldestPendingAgeMs === null ? '—' : formatDuration(row.oldestPendingAgeMs),
  },
  { key: 'sentPerMinute', label: 'Sending', render: (_, row) => formatRate(row.sentPerMinute) },
  { key: 'failedPerMinute', label: 'Failing', render: (_, row) => formatRate(row.failedPerMinute) },
  {
    key: 'sent',
    label: 'Last 60 min',
    render: (_, row) => (
      <Sparkline
        label={`${formatMessageChannel(row.channel)}, last 60 minutes: ${sum(row.sent).toLocaleString()} sent, ${sum(row.failed).toLocaleString()} failed`}
        series={[
          { variant: 'out', values: row.sent },
          { variant: 'failed', values: row.failed },
        ]}
      />
    ),
  },
  { key: 'estimatedClearMinutes', label: 'Time to clear', render: (_, row) => clearText(row) },
]

interface MessagesSectionProps {
  messages: MessageChannelStats[]
}

/** Individual emails and texts, as opposed to the jobs that carry them. */
const MessagesSection: FC<MessagesSectionProps> = ({ messages }) => (
  <section className="page__section">
    <PageSubHeading title="Right now" />
    <DataTable
      columns={columns}
      data={messages}
      keyExtractor={(row) => row.channel}
      label="Right now"
      emptyMessage="No messages in the last 24 hours."
      multiline
    />
    <p className="queue-monitoring__legend">
      Rates average the last 5 minutes.{' '}
      <span className="sparkline-key sparkline-key--out ms-2" aria-hidden="true" /> Sent{' '}
      <span className="sparkline-key sparkline-key--failed ms-3" aria-hidden="true" /> Failed
    </p>
  </section>
)

export default MessagesSection
