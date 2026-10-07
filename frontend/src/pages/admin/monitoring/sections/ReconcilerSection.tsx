import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import { StatusBadge } from '@/components/StatusBadge'
import StatTile from '@/components/StatTile'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type {
  ReconcilerAction,
  ReconcilerActionType,
  ReconcilerStats,
} from '@/interfaces/queueMonitoring.interface'
import { HEALTH_LABELS, formatAgo, formatDuration } from '@/utils/monitoring'

const KIND_LABELS: Record<string, string> = {
  pending: 'Never queued',
  ingestion: 'Never fanned out',
  scheduled: 'Scheduled send',
  batch: 'Merge batch',
  delivery: 'Send',
}

const ACTION_LABELS: Record<ReconcilerActionType, string> = {
  retried: 'Retried',
  requeued: 'Re-queued',
  'gave-up': 'Gave up',
}

interface ReconcilerSectionProps {
  reconciler: ReconcilerStats
  /** Reference time for "ago" labels: when the snapshot was taken. */
  now: number
}

const ReconcilerSection: FC<ReconcilerSectionProps> = ({ reconciler, now }) => {
  const windowLabel = `Last ${reconciler.windowMinutes} min`
  const lastPassHint =
    reconciler.intervalMs === null
      ? 'Not run yet'
      : `Every ${formatDuration(reconciler.intervalMs)}; checked ${(reconciler.lastPassFound ?? 0).toLocaleString()}`

  const columns: TableColumn<ReconcilerAction>[] = [
    {
      key: 'at',
      label: 'When',
      render: (_, row) => <span title={row.at}>{formatAgo(row.at, now)}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (_, row) =>
        row.action === 'gave-up' ? (
          <StatusBadge status="warning" statusLabel={ACTION_LABELS[row.action]} />
        ) : (
          ACTION_LABELS[row.action]
        ),
    },
    { key: 'kind', label: 'What was stuck', render: (_, row) => KIND_LABELS[row.kind] ?? row.kind },
    { key: 'tenantName', label: 'Tenant', render: (_, row) => row.tenantName ?? row.tenantId },
    {
      key: 'notificationId',
      label: 'Notification ID',
      render: (_, row) => <code>{row.notificationId}</code>,
    },
  ]

  return (
    <section className="page__section">
      <PageSubHeading title="Delivery recovery" />
      <div className="page__section-body">
        <div className="queue-monitoring__memory-caption">
          <span>Finds sends that stopped moving and puts them back on the queue</span>
          <StatusBadge status={reconciler.status} statusLabel={HEALTH_LABELS[reconciler.status]} />
        </div>
        {reconciler.reasons.length > 0 && (
          <ul className="queue-monitoring__reasons">
            {reconciler.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}

        <dl className="stat-tile-grid">
          <StatTile
            label="Last pass"
            value={reconciler.lastPassAt ? formatAgo(reconciler.lastPassAt, now) : '—'}
            hint={lastPassHint}
          />
          <StatTile
            label="Retried"
            value={reconciler.retried.toLocaleString()}
            hint={windowLabel}
          />
          <StatTile
            label="Re-queued"
            value={reconciler.requeued.toLocaleString()}
            hint={windowLabel}
          />
          <StatTile label="Gave up" value={reconciler.gaveUp.toLocaleString()} hint={windowLabel} />
        </dl>

        <DataTable
          columns={columns}
          data={reconciler.recentActions}
          keyExtractor={(row) => `${row.at}-${row.kind}-${row.jobId}`}
          label="Recent recoveries"
          emptyMessage="Nothing has needed recovering."
        />
        <p className="queue-monitoring__legend">
          Every pass compares what Postgres says is still owed with what the queues hold, and puts
          stuck work back: a failed job is retried, a lost one re-queued. After repeated attempts it
          gives up and marks what was owed as failed, so a send that cannot succeed ends visibly.
          Recent recoveries are listed newest first.
        </p>
      </div>
    </section>
  )
}

export default ReconcilerSection
