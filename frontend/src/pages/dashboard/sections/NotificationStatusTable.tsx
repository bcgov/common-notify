import { Link, Select } from '@bcgov/design-system-react-components'
import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import PaginationControls from '@/components/PaginationControls'
import { setPage, setStatusFilter, selectNotifications } from '@/redux/slices/notification.slice'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import { connectNotificationSSE, fetchNotifications } from '@/redux/thunks/notification.thunks'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
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
  const { statusFilter, page, limit, count, totalPages, isLoading } = useAppSelector(
    (state) => state.notification,
  )
  const notifications = useAppSelector(selectNotifications)
  const statuses = useAppSelector(selectStatuses)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  const [selectedNotification, setSelectedNotification] = useState<NotificationRequest | null>(null)
  const [showRecipientsModal, setShowRecipientsModal] = useState(false)

  {
    /** delete this later */
  }
  const [variant, setVariant] = useState<'striped' | 'bordered' | 'plain'>('striped')
  const [headerThemed, setHeaderThemed] = useState(false)
  const [headerBordered, setHeaderBordered] = useState(false)
  {
    /*********************/
  }

  // Fetch notifications when status filter, page, or selected tenant changes
  // Only fetch if a tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchNotifications())
    }
  }, [statusFilter, page, selectedTenant, dispatch])

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

  const columns: TableColumn<NotificationRequest>[] = [
    {
      key: 'tenant',
      label: 'Tenant Name',
      render: (_, row) => row.tenant?.name || row.tenantId,
      sortable: true,
    },
    {
      key: 'channel',
      label: 'Channel',
      render: (_, row) => row.channel?.displayName ?? '-',
    },
    {
      key: 'recipients',
      label: 'Recipients',
      render: (_, row) => {
        const count = getTotalRecipientCount(row.recipients)
        return count > 0 ? (
          <Link
            onClick={() => handleShowRecipients(row)}
            className="p-0"
            style={{ textDecorationLine: 'underline', color: 'blue', cursor: 'pointer' }}
          >
            {count} recipient{count !== 1 ? 's' : ''}
          </Link>
        ) : (
          <span className="text-muted">No recipients</span>
        )
      },
    },
    {
      key: 'delayedSendTime',
      label: 'Delayed Send',
      render: (_, row) =>
        row.delayedSendTime ? (
          new Date(row.delayedSendTime).toLocaleString()
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => <span className={getStatusBadgeClass(row.status)}>{row.status}</span>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (_, row) => new Date(row.createdAt).toLocaleString(),
    },
  ]

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
      {/** delete this later */}
      <div>
        <button
          onClick={() => {
            setVariant(
              variant === 'striped' ? 'bordered' : variant === 'bordered' ? 'plain' : 'striped',
            )
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '5px',
            cursor: 'pointer',
            color: 'black',
          }}
        >
          Change Variant
        </button>
        <button
          onClick={() => setHeaderThemed((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            padding: '5px',
            cursor: 'pointer',
            color: 'black',
          }}
        >
          Toggle Header Color
        </button>
        <button
          onClick={() => setHeaderBordered((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            padding: '5px',
            cursor: 'pointer',
            color: 'black',
          }}
        >
          Toggle Header Border
        </button>
      </div>
      {headerThemed && (
        <style>{`.notification-status-table thead th { background-color: #013366; color: #ffffff; }`}</style>
      )}
      {headerBordered && (
        <style>{`.notification-status-table thead th { border: 1px solid lightgray; }`}</style>
      )}
      {/*******************/}
      <DataTable
        columns={columns}
        data={notifications ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyMessage="No notifications found"
        label="Notification Status"
        variant={variant}
        className={headerThemed || headerBordered ? 'notification-status-table' : ''} // delete later
      />

      <RecipientsModal
        show={showRecipientsModal}
        notification={selectedNotification}
        onHide={() => setShowRecipientsModal(false)}
      />

      <PaginationControls
        page={page}
        totalPages={totalPages}
        count={count}
        limit={limit}
        isLoading={isLoading}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
      />
    </div>
  )
}

export default NotificationStatusTable
