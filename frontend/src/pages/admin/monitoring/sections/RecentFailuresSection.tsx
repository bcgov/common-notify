import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { RecentFailure } from '@/interfaces/queueMonitoring.interface'
import { formatAgo, formatQueueName } from '@/utils/monitoring'

interface RecentFailuresSectionProps {
  failures: RecentFailure[]
  now: number
}

const RecentFailuresSection: FC<RecentFailuresSectionProps> = ({ failures, now }) => {
  const columns: TableColumn<RecentFailure>[] = [
    {
      key: 'failedAt',
      label: 'Failed',
      render: (_, row) => (
        <span title={row.failedAt ?? undefined}>{formatAgo(row.failedAt, now)}</span>
      ),
    },
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
    { key: 'attemptsMade', label: 'Attempts' },
    {
      key: 'reason',
      label: 'Reason',
      render: (_, row) => <span className="queue-monitoring__reason-text">{row.reason}</span>,
    },
  ]

  return (
    <section className="page__section">
      <PageSubHeading title="Recent failures" />
      <DataTable
        columns={columns}
        data={failures}
        keyExtractor={(row) => `${row.queue}-${row.jobId}`}
        label="Recent failed jobs"
        emptyMessage="No failed jobs."
        multiline
      />
    </section>
  )
}

export default RecentFailuresSection
