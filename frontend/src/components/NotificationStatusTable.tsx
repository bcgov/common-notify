import { Table } from 'react-bootstrap'
import { Select } from '@bcgov/design-system-react-components'
import type { FC } from 'react'
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import PaginationControls from '@/components/PaginationControls'
import { setPage, setStatusFilter, selectNotifications } from '@/redux/slices/notification.slice'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import { fetchNotifications, connectNotificationSSE } from '@/redux/thunks/notification.thunks'
import type { NotificationStatus } from '@/enum/notification-status.enum'

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

  // Fetch notifications when filter or page changes
  useEffect(() => {
    dispatch(fetchNotifications())
  }, [statusFilter, page, dispatch])

  // Connect to SSE stream
  useEffect(() => {
    const controller = connectNotificationSSE(dispatch)
    return () => controller.abort()
  }, [dispatch])

  // Build status filter items from Redux
  const statusFilterItems = [
    { id: 'all', label: 'All' },
    ...statuses.map((s) => ({
      id: s.id,
      label: s.label,
    })),
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
      <Table bordered hover responsive>
        <thead>
          <tr>
            <th>Tenant Name</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={3} className="text-center">
                Loading...
              </td>
            </tr>
          ) : notifications && notifications.length > 0 ? (
            notifications.map((row) => (
              <tr key={row.id}>
                <td>{row.tenant?.name || row.tenantId}</td>
                <td>{row.status}</td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="text-center">
                No notifications found
              </td>
            </tr>
          )}
        </tbody>
      </Table>
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
