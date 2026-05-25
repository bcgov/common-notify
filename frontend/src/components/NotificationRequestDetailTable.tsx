import { Table } from 'react-bootstrap'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { notificationApi } from '@/api'
import type { NotificationRequestDetail } from '@/interfaces/NotificationRequest'

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
      <Table bordered hover responsive size="sm">
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Provider Response ID</th>
            <th>Last Attempt</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={7} className="text-center">
                Loading...
              </td>
            </tr>
          ) : deliveries.length > 0 ? (
            deliveries.map((row) => (
              <tr key={row.id}>
                <td>{row.recipientAddress}</td>
                <td>{row.channel}</td>
                <td>{row.status}</td>
                <td>{row.attemptCount}</td>
                <td>{row.providerResponseId ?? '—'}</td>
                <td>{row.lastAttemptAt ? new Date(row.lastAttemptAt).toLocaleString() : '—'}</td>
                <td>{row.errorMessage ?? '—'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="text-center">
                No request detail records found
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  )
}

export default NotificationRequestDetailTable
