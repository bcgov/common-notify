import { Link, Select } from '@bcgov/design-system-react-components'
import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setPage, setStatusFilter, selectNotifications } from '@/redux/slices/notification.slice'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import { connectNotificationSSE, fetchNotifications } from '@/redux/thunks/notification.thunks'
import { fetchFeatureFlags } from '@/redux/slices/featureFlags.slice'
import { selectFeatureFlag } from '@/config/featureFlags/featureFlagsSelectors'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { RecipientsModal, getTotalRecipientCount } from './RecipientsModal'

/**
 * NotificationStatusTable Component
 * Displays a filterable table of notification requests with their status and creation date
 * Filtering is done on the backend
 */
const NotificationStatusTable: FC = () => {
  const dispatch = useAppDispatch()
  const { statusFilter, page, limit, count, isLoading, hasLoaded } = useAppSelector(
    (state) => state.notification,
  )
  const notifications = useAppSelector(selectNotifications)
  const statuses = useAppSelector(selectStatuses)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  // Get SSE flag status from Redux (no hook, just read the state)
  const sseEnabled = useAppSelector((state) => selectFeatureFlag(state, 'sse_notifications'))

  const [selectedNotification, setSelectedNotification] = useState<NotificationRequest | null>(null)
  const [showRecipientsModal, setShowRecipientsModal] = useState(false)

  // Fetch notifications when status filter, page, or selected tenant changes
  // Only fetch if a tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchNotifications())
    }
  }, [statusFilter, page, selectedTenant, dispatch])

  // Fetch feature flags for the selected tenant
  // This ensures byCode contains flags that apply to this tenant (global + tenant-specific)
  useEffect(() => {
    if (selectedTenant?.id) {
      dispatch(fetchFeatureFlags(selectedTenant.id) as any)
    }
  }, [dispatch, selectedTenant?.id])

  // Connect to SSE stream when tenant is selected and feature is enabled
  useEffect(() => {
    if (!selectedTenant || !sseEnabled) {
      return
    }
    const controller = connectNotificationSSE(dispatch, selectedTenant.id)
    return () => controller.abort()
  }, [dispatch, selectedTenant, sseEnabled])

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
      render: (_, row) => <StatusBadge status={row.status} />,
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

      <DataTable
        columns={columns}
        data={notifications ?? []}
        keyExtractor={(row) => row.id}
        isLoading={isLoading && !hasLoaded}
        emptyMessage="No notifications found"
        label="Notification Status"
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
      />

      <RecipientsModal
        show={showRecipientsModal}
        notification={selectedNotification}
        onHide={() => setShowRecipientsModal(false)}
      />
    </div>
  )
}

export default NotificationStatusTable
