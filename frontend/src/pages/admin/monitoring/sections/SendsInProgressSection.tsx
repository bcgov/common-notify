import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import MeterBar from '@/components/MeterBar'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { SendInProgress } from '@/interfaces/queueMonitoring.interface'
import { formatAgo, formatMessageChannel, formatRate } from '@/utils/monitoring'

interface SendsInProgressSectionProps {
  sends: SendInProgress[]
  /** Reference time for "ago" labels: when the snapshot was taken. */
  now: number
}

function progressText(send: SendInProgress): string {
  const failed = send.failed > 0 ? `, ${send.failed.toLocaleString()} failed` : ''
  return `${send.sent.toLocaleString()} of ${send.total.toLocaleString()} sent${failed}`
}

function batchesText(send: SendInProgress): string {
  if (send.batches === 0) return '—'
  const waiting = send.batches - send.batchesDone - send.batchesSending
  return [
    `${send.batchesDone.toLocaleString()} of ${send.batches.toLocaleString()} done`,
    `${send.batchesSending.toLocaleString()} sending`,
    ...(waiting > 0 ? [`${waiting.toLocaleString()} waiting`] : []),
  ].join(', ')
}

function timeLeftText(send: SendInProgress): string {
  if (send.estimatedMinutesLeft === null) return 'Not sending yet'
  return `~${send.estimatedMinutesLeft.toLocaleString()} min at ${formatRate(send.perMinute)}`
}

/** Each request still sending, with its merge batches rolled up into one row. */
const SendsInProgressSection: FC<SendsInProgressSectionProps> = ({ sends, now }) => {
  const columns: TableColumn<SendInProgress>[] = [
    {
      key: 'notificationId',
      label: 'Notification ID',
      render: (_, row) => <code>{row.notificationId}</code>,
    },
    { key: 'tenantName', label: 'Tenant', render: (_, row) => row.tenantName ?? row.tenantId },
    {
      key: 'channels',
      label: 'Channel',
      render: (_, row) => row.channels.map(formatMessageChannel).join(', ') || '—',
    },
    {
      key: 'sent',
      label: 'Progress',
      render: (_, row) => {
        const done = row.total > 0 ? ((row.sent + row.failed) / row.total) * 100 : 0
        return (
          <div className="queue-monitoring__progress">
            <MeterBar
              label={`Notification ${row.notificationId} progress`}
              percent={Math.round(done)}
              valueText={progressText(row)}
              status={row.failed > 0 ? 'warning' : 'healthy'}
            />
            <span>{progressText(row)}</span>
          </div>
        )
      },
    },
    { key: 'batches', label: 'Batches', render: (_, row) => batchesText(row) },
    { key: 'estimatedMinutesLeft', label: 'Time left', render: (_, row) => timeLeftText(row) },
    { key: 'acceptedAt', label: 'Accepted', render: (_, row) => formatAgo(row.acceptedAt, now) },
  ]

  return (
    <section className="page__section">
      <PageSubHeading title="Sends in progress" />
      <DataTable
        columns={columns}
        data={sends}
        keyExtractor={(row) => row.notificationId}
        label="Sends in progress"
        emptyMessage="Nothing is sending right now."
        multiline
      />
    </section>
  )
}

export default SendsInProgressSection
