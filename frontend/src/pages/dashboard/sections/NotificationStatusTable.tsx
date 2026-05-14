import { Table, Button } from 'react-bootstrap'
import { Select } from '@bcgov/design-system-react-components'
import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setStatusFilter, selectNotifications } from '@/redux/slices/notification.slice'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import { connectNotificationSSE, fetchNotifications } from '@/redux/thunks/notification.thunks'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { RecipientsModal, getTotalRecipientCount } from './RecipientsModal'

/**
 * Helper to get status badge CSS class
 */
function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'completed':
      return 'badge bg-success text-white'
    case 'failed':
      return 'badge bg-danger text-white'
    case 'sending':
      return 'badge bg-warning text-dark'
    case 'processing':
      return 'badge bg-primary text-white'
    case 'queued':
      return 'badge bg-secondary text-white'
    case 'pending':
      return 'badge bg-info text-dark'
    case 'scheduled':
      return 'badge bg-dark text-light'
    default:
      return 'badge bg-secondary text-white'
  }
}

/**
 * NotificationStatusTable Component
 * Displays a filterable table of notification requests with their status and creation date
 * Filtering is done on the backend
 */
const NotificationStatusTable: FC = () => {
  const dispatch = useAppDispatch()
  const { statusFilter, isLoading } = useAppSelector((state) => state.notification)
  const notifications = useAppSelector(selectNotifications)
  const statuses = useAppSelector(selectStatuses)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  const [selectedNotification, setSelectedNotification] = useState<NotificationRequest | null>(null)
  const [showRecipientsModal, setShowRecipientsModal] = useState(false)

  // Fetch notifications when status filter or selected tenant changes
  // Only fetch if a tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchNotifications())
    }
  }, [statusFilter, selectedTenant, dispatch])

  // Connect to SSE stream when tenant is selected
  useEffect(() => {
    if (!selectedTenant) {
      return
    }
    const controller = connectNotificationSSE(dispatch, selectedTenant.id)
    return () => controller.abort()
  }, [dispatch, selectedTenant])

  // Build status filter items from Redux
  const statusFilterItems = [
    { id: 'all', label: 'All' },
    ...statuses.map((s) => ({
      id: s.id,
      label: s.label,
    })),
  ]

  const handleShowRecipients = (notification: NotificationRequest) => {
    setSelectedNotification(notification)
    setShowRecipientsModal(true)
  }

  return (
    <div>
      <div className="mb-3" style={{ maxWidth: '220px' }}>
        <Select
          label="Filter by status"
          items={statusFilterItems}
          selectedKey={statusFilter}
          onSelectionChange={(key) => dispatch(setStatusFilter(key as NotificationStatus | 'all'))}
        />
      </div>
      <Table bordered hover responsive>
        <thead>
          <tr>
            <th>Tenant Name</th>
            <th>Channel</th>
            <th>Recipients</th>
            <th>Delayed Send</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6} className="text-center">
                Loading...
              </td>
            </tr>
          ) : notifications && notifications.length > 0 ? (
            notifications.map((row) => (
              <tr key={row.id}>
                <td>{row.tenant?.name || row.tenantId}</td>
                <td>{row.channel?.displayName || 'Unknown'}</td>
                <td>
                  {getTotalRecipientCount(row.recipients) > 0 ? (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => handleShowRecipients(row)}
                      className="p-0"
                    >
                      {getTotalRecipientCount(row.recipients)} recipient
                      {getTotalRecipientCount(row.recipients) !== 1 ? 's' : ''}
                    </Button>
                  ) : (
                    <span className="text-muted">No recipients</span>
                  )}
                </td>
                <td>
                  {row.delayedSendTime ? (
                    new Date(row.delayedSendTime).toLocaleString()
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  <span className={getStatusBadgeClass(row.status)}>{row.status}</span>
                </td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="text-center">
                No notifications found
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <RecipientsModal
        show={showRecipientsModal}
        notification={selectedNotification}
        onHide={() => setShowRecipientsModal(false)}
      />
    </div>
  )
}

export default NotificationStatusTable
