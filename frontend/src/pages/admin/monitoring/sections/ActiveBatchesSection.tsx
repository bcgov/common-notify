import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import MeterBar from '@/components/MeterBar'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { ActiveBatch } from '@/interfaces/queueMonitoring.interface'
import { formatAgo, formatQueueName } from '@/utils/monitoring'

interface ActiveBatchesSectionProps {
  batches: ActiveBatch[]
  now: number
}

function progressText(batch: ActiveBatch): string {
  const failed = batch.failed > 0 ? `, ${batch.failed.toLocaleString()} failed` : ''
  return `${batch.sent.toLocaleString()} of ${batch.total.toLocaleString()} sent${failed}`
}

/** Merge batches being worked right now: one job each, with per-recipient progress. */
const ActiveBatchesSection: FC<ActiveBatchesSectionProps> = ({ batches, now }) => {
  const columns: TableColumn<ActiveBatch>[] = [
    { key: 'queue', label: 'Queue', render: (_, row) => formatQueueName(row.queue) },
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, row) => row.tenantName ?? row.tenantId ?? '—',
    },
    {
      key: 'notificationId',
      label: 'Notification ID',
      render: (_, row) => <code>{row.notificationId ?? '—'}</code>,
    },
    {
      key: 'sent',
      label: 'Progress',
      render: (_, row) => {
        const done = row.total > 0 ? ((row.sent + row.failed) / row.total) * 100 : 0
        return (
          <div className="queue-monitoring__progress">
            <MeterBar
              label={`Batch ${row.jobId} progress`}
              percent={Math.round(done)}
              valueText={progressText(row)}
              status={row.failed > 0 ? 'warning' : 'healthy'}
            />
            <span>{progressText(row)}</span>
          </div>
        )
      },
    },
    { key: 'startedAt', label: 'Started', render: (_, row) => formatAgo(row.startedAt, now) },
  ]

  return (
    <section className="page__section">
      <PageSubHeading title="Batches in progress" />
      <DataTable
        columns={columns}
        data={batches}
        keyExtractor={(row) => `${row.queue}-${row.jobId}`}
        label="Batches in progress"
        emptyMessage="No batches are sending right now."
      />
    </section>
  )
}

export default ActiveBatchesSection
