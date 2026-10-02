import type { FC } from 'react'
import PageSubHeading from '@/components/PageSubHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import type { WorkerPod } from '@/interfaces/queueMonitoring.interface'
import { formatAgo, formatQueueName } from '@/utils/monitoring'

interface WorkerRow {
  key: string
  podId: string
  queue: string
  concurrency: number
  active: number
  completed: number
  failed: number
  lastFinishedAt: string | null
  lastHeartbeatAt: string
}

interface WorkersSectionProps {
  workers: WorkerPod[]
  /** Reference time for "ago" labels: when the snapshot was taken. */
  now: number
}

const WorkersSection: FC<WorkersSectionProps> = ({ workers, now }) => {
  const rows: WorkerRow[] = workers.flatMap((pod) =>
    pod.queues.map((queue) => ({
      key: `${pod.podId}-${queue.queue}`,
      podId: pod.podId,
      lastHeartbeatAt: pod.lastHeartbeatAt,
      ...queue,
    })),
  )

  const columns: TableColumn<WorkerRow>[] = [
    { key: 'podId', label: 'Pod' },
    { key: 'queue', label: 'Queue', render: (_, row) => formatQueueName(row.queue) },
    {
      key: 'active',
      label: 'Busy',
      render: (_, row) => `${row.active} of ${row.concurrency}`,
    },
    {
      key: 'completed',
      label: 'Completed',
      render: (_, row) => row.completed.toLocaleString(),
    },
    { key: 'failed', label: 'Failed', render: (_, row) => row.failed.toLocaleString() },
    {
      key: 'lastFinishedAt',
      label: 'Last job finished',
      render: (_, row) => formatAgo(row.lastFinishedAt, now),
    },
    {
      key: 'lastHeartbeatAt',
      label: 'Last heartbeat',
      render: (_, row) => formatAgo(row.lastHeartbeatAt, now),
    },
  ]

  return (
    <section className="page__section">
      <PageSubHeading title="Workers" />
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.key}
        label="Workers"
        emptyMessage="No worker heartbeats received. Either no pod is processing jobs, or the running pods predate worker heartbeats."
      />
      <p className="queue-monitoring__legend">
        Completed and failed counts are since each pod started. A pod drops off this list 30 seconds
        after its last heartbeat.
      </p>
    </section>
  )
}

export default WorkersSection
