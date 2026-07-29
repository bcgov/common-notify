import { useNavigate } from '@tanstack/react-router'
import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { setPage, setSort, setFilter, selectNotifications } from '@/redux/slices/notification.slice'
import { setLimit } from '@/redux/slices/notification.slice'
import { CodeTable, selectStatuses } from '@/redux/slices/codeTables.slice'
import { connectNotificationSSE, fetchNotifications } from '@/redux/thunks/notification.thunks'
import { fetchFeatureFlags } from '@/redux/slices/featureFlags.slice'
import { selectFeatureFlag } from '@/config/featureFlags/featureFlagsSelectors'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { ChannelBadge } from '@/components/ChannelBadge'
import { RecipientsModal } from './RecipientsModal'
import { RecipientsCell } from './RecipientsCell'

/** Channels the request targeted, derived from the recipients present on each channel. */
const channelsFromRequest = (row: NotificationRequest): string[] => {
  const channels: string[] = []
  if (row.recipients?.email?.length) channels.push('EMAIL')
  if (row.recipients?.sms?.length) channels.push('SMS')
  if (row.recipients?.msgApp?.length) channels.push('MSGAPP')
  return channels
}

/**
 * NotificationStatusTable Component
 * Displays a filterable table of notification requests with their status and creation date
 * Filtering is done on the backend
 */
const NotificationStatusTable: FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { sortBy, sortOrder, filters, page, limit, count, isLoading, hasLoaded } = useAppSelector(
    (state) => state.notification,
  )
  const notifications = useAppSelector(selectNotifications)
  const statuses = useAppSelector(selectStatuses)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)

  // Get SSE flag status from Redux (no hook, just read the state)
  const sseEnabled = useAppSelector((state) => selectFeatureFlag(state, 'sse_notifications'))

  const [selectedNotification, setSelectedNotification] = useState<NotificationRequest | null>(null)
  const [showRecipientsModal, setShowRecipientsModal] = useState(false)

  // Fetch notifications when status filter, page, limit, or selected tenant changes
  // Only fetch if a tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchNotifications())
    }
  }, [sortBy, sortOrder, filters, page, limit, selectedTenant, dispatch])

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

  const handleShowRecipients = (notification: NotificationRequest) => {
    setSelectedNotification(notification)
    setShowRecipientsModal(true)
  }

  const handleSort = (key: string, order: 'asc' | 'desc' | null) => {
    dispatch(setSort({ sortBy: order != null ? key : null, sortOrder: order }))
  }

  const handleFilter = (key: string, values: string[]) => {
    dispatch(setFilter({ field: key, values }))
  }

  const columns: TableColumn<NotificationRequest>[] = [
    {
      key: 'id',
      label: 'Request ID',
      className: 'data-table__id-col',
      render: (_, row) => (
        <span className="data-table__truncate" title={row.id}>
          {row.id}
        </span>
      ),
    },
    {
      key: 'requestRoute',
      label: 'Notification Event',
      width: '19%',
      render: (_, row) => row.requestRoute ?? '-',
    },
    {
      key: 'channel',
      label: 'Channel',
      width: '17%',
      render: (_, row) => <ChannelBadge channels={channelsFromRequest(row)} />,
    },
    {
      key: 'status',
      label: 'Notification Status',
      width: '17%',
      sortable: true,
      filterOptions: statuses.map((s: CodeTable) => ({ label: s.label, value: s.id })),
      render: (_, row) => (
        <StatusBadge status={row.status.code} statusLabel={row.status.displayName} />
      ),
    },
    {
      key: 'recipients',
      label: 'Recipients',
      className: 'data-table__recipients-col',
      render: (_, row) => (
        <RecipientsCell recipients={row.recipients} onViewAll={() => handleShowRecipients(row)} />
      ),
    },
    {
      key: 'delayedSendTime',
      label: 'Sent Date',
      width: '16%',
      sortable: true,
      sortType: 'date',
      render: (_, row) => new Date(row.delayedSendTime ?? row.createdAt).toLocaleString(),
    },
  ]

  return (
    <div>
      <DataTable
        columns={columns}
        data={notifications ?? []}
        keyExtractor={(row) => row.id}
        onRowClick={(row) =>
          navigate({
            to: '/request-status/$notificationRequestId',
            params: { notificationRequestId: row.id },
          })
        }
        isLoading={isLoading && !hasLoaded}
        emptyMessage="No notifications found"
        label="Notification Status"
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        sortBy={sortBy ?? undefined}
        sortOrder={sortOrder}
        onSort={handleSort}
        activeFilters={filters}
        onFilter={handleFilter}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
        onPageSizeChange={(newLimit) => dispatch(setLimit(newLimit))}
        pageSizeOptions={[15, 30]}
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
