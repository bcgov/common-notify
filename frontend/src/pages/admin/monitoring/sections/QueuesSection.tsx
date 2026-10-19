import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import { StatusBadge } from '@/components/StatusBadge'
import Sparkline from '@/components/Sparkline'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { QueueStats } from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatDuration, formatQueueName, formatRate } from '@/utils/monitoring'

type QueueRow = QueueStats & {
  waiting: number
  active: number
  delayed: number
  failedCount: number
}

function drainText(row: QueueRow): string {
  if (row.estimatedDrainMinutes === 0) return 'Empty'
  if (row.estimatedDrainMinutes === null) return 'Not draining'
  return `~${row.estimatedDrainMinutes.toLocaleString()} min`
}

const columns: TableColumn<QueueRow>[] = [
  {
    key: 'name',
    label: 'Queue',
    render: (_, row) => (
      <div>
        <span className="fw-semibold">{formatQueueName(row.name)}</span>
        {row.reasons.length > 0 && (
          <ul className="queue-monitoring__reasons">
            {row.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (_, row) => <StatusBadge status={row.status} statusLabel={HEALTH_LABELS[row.status]} />,
  },
  { key: 'waiting', label: 'Waiting', render: (_, row) => row.waiting.toLocaleString() },
  { key: 'active', label: 'Active', render: (_, row) => row.active.toLocaleString() },
  { key: 'delayed', label: 'Delayed', render: (_, row) => row.delayed.toLocaleString() },
  { key: 'failedCount', label: 'Failed', render: (_, row) => row.failedCount.toLocaleString() },
  {
    key: 'oldestWaitingAgeMs',
    label: 'Oldest waiting',
    render: (_, row) =>
      row.oldestWaitingAgeMs === null ? '—' : formatDuration(row.oldestWaitingAgeMs),
  },
  {
    key: 'throughput',
    label: 'In / out',
    render: (_, row) => (
      <div className="queue-monitoring__rates">
        <span>In {formatRate(row.throughput.inPerMinute)}</span>
        <span>Out {formatRate(row.throughput.outPerMinute)}</span>
        <Sparkline
          label={`${formatQueueName(row.name)}, last 60 minutes: ${row.throughput.added.reduce((a, b) => a + b, 0).toLocaleString()} added, ${row.throughput.completed.reduce((a, b) => a + b, 0).toLocaleString()} completed, ${row.throughput.failed.reduce((a, b) => a + b, 0).toLocaleString()} failed`}
          series={[
            { variant: 'in', values: row.throughput.added },
            {
              variant: 'out',
              values: row.throughput.completed.map((value, i) => value + row.throughput.failed[i]),
            },
          ]}
        />
      </div>
    ),
  },
  { key: 'estimatedDrainMinutes', label: 'Time to drain', render: (_, row) => drainText(row) },
  {
    key: 'liveWorkerPods',
    label: 'Worker pods',
    render: (_, row) => row.liveWorkerPods.toLocaleString(),
  },
]

interface QueuesSectionProps {
  queues: QueueStats[]
}

const QueuesSection: FC<QueuesSectionProps> = ({ queues }) => {
  const rows: QueueRow[] = queues.map((queue) => ({
    ...queue,
    waiting: queue.counts.waiting + queue.counts.paused,
    active: queue.counts.active,
    delayed: queue.counts.delayed,
    failedCount: queue.counts.failed,
  }))

  return (
    <section className="page__section">
      <PageSubHeading title="Queues" />
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.name}
        label="Queues"
        emptyMessage="No queues are configured."
        multiline
      />
      <p className="queue-monitoring__legend">
        <span className="sparkline-key sparkline-key--in" aria-hidden="true" /> Jobs added{' '}
        <span className="sparkline-key sparkline-key--out ms-3" aria-hidden="true" /> Jobs finished,
        over the last 60 minutes. Rates average the last 5 whole minutes. Failed jobs are kept for 7
        days.
      </p>
    </section>
  )
}

export default QueuesSection
