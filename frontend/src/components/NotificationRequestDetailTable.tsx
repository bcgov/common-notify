import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { notificationApi } from '@/api'
import type { NotificationRequestDetail } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'

const columns: TableColumn<NotificationRequestDetail>[] = [
  { key: 'recipientAddress', label: 'Recipient' },
  { key: 'channel', label: 'Channel' },
  { key: 'status', label: 'Status' },
  { key: 'attemptCount', label: 'Attempts' },
  {
    key: 'providerResponseId',
    label: 'Provider Response ID',
    render: (value) => (value as string | undefined) ?? '—',
  },
  {
    key: 'lastAttemptAt',
    label: 'Last Attempt',
    render: (value) => (value ? new Date(value as string).toLocaleString() : '—'),
  },
  {
    key: 'errorMessage',
    label: 'Error',
    render: (value) => (value as string | undefined) ?? '—',
  },
]

/**
 * NotificationRequestDetailTable Component
 * Displays all delivery records for the authenticated tenant.
 */
const NotificationRequestDetailTable: FC = () => {
  const [deliveries, setDeliveries] = useState<NotificationRequestDetail[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    notificationApi
      .listAllRequestDetails()
      .then(setDeliveries)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load request detail records'),
      )
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div>
      {error && <p className="text-danger">{error}</p>}
      <DataTable
        columns={columns}
        data={deliveries}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyMessage="No request detail records found"
        label="Notification Request Details"
      />
    </div>
  )
}

export default NotificationRequestDetailTable
