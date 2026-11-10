import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import {
  setDateRange,
  setFilter,
  setLimit,
  setPage,
  setSearch,
} from '@/redux/slices/adminNotifications.slice'
import { fetchAdminNotifications } from '@/redux/thunks/adminNotifications.thunks'
import { selectStatuses } from '@/redux/slices/codeTables.slice'
import type { AdminNotificationRow } from '@/api/adminNotifications.api'
import PageHeading from '@/components/PageHeading'
import TypeaheadSearchField from '@/components/TypeaheadSearchField'
import DateRangeFields from '@/components/DateRangeFields'
import type { DateRange } from '@/components/DateRangeFields'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { ChannelBadge } from '@/components/ChannelBadge'
import { showErrorToast } from '@/redux/utils/toastUtils'
import { CHANNEL_FILTER_OPTIONS, formatDateTime } from './adminNotificationFormat'
import '@/scss/components/admin-notifications.scss'

/**
 * Notification requests from every tenant, for troubleshooting a send. Shows what happened to
 * each request, never who it went to or what it said.
 */
const AdminNotifications: FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { items, page, limit, count, search, filters, from, to, isLoading, hasLoaded, error } =
    useAppSelector((state) => state.adminNotifications)
  const statuses = useAppSelector(selectStatuses)
  const tenants = useAppSelector((state) => state.adminTenants.items)
  const tenantNames = useMemo(() => tenants.map((tenant) => tenant.name), [tenants])
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    dispatch(fetchAdminNotifications())
  }, [page, limit, search, filters, from, to, dispatch])

  useEffect(() => {
    if (error) showErrorToast(error, undefined, { toastId: 'admin-notifications-error' })
  }, [error])

  function clearSearch() {
    setSearchInput('')
    dispatch(setSearch(''))
  }

  const columns: TableColumn<AdminNotificationRow>[] = [
    {
      key: 'createdAt',
      label: 'Received',
      render: (_, row) => <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>,
    },
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, row) => <strong>{row.tenantName}</strong>,
    },
    {
      key: 'requestRoute',
      label: 'Source',
      render: (_, row) => row.requestRoute ?? '-',
    },
    {
      key: 'channels',
      label: 'Channel',
      filterKey: 'channel',
      filterOptions: CHANNEL_FILTER_OPTIONS,
      render: (_, row) => <ChannelBadge channels={row.channels} />,
    },
    {
      key: 'status',
      label: 'Status',
      filterOptions: statuses.map((status) => ({ label: status.label, value: status.id })),
      render: (_, row) => (
        <StatusBadge status={row.status.code} statusLabel={row.status.displayName} />
      ),
    },
    {
      key: 'recipientCount',
      label: 'Recipients',
      render: (_, row) => row.recipientCount.toLocaleString(),
    },
    {
      key: 'failedCount',
      label: 'Failed',
      render: (_, row) => row.failedCount.toLocaleString(),
    },
  ]

  return (
    <div className="page admin-notifications">
      <PageHeading
        title="Notifications"
        meta="Requests from every tenant. Recipient addresses and message content are not shown."
      />

      <div className="page__toolbar admin-notifications__toolbar">
        <div className="admin-notifications__search">
          <TypeaheadSearchField
            value={searchInput}
            onChange={setSearchInput}
            onSearch={(term) => dispatch(setSearch(term.trim()))}
            suggestions={tenantNames}
            placeholder="Search tenants..."
            ariaLabel="Search by tenant"
          />
        </div>
        <DateRangeFields
          from={from}
          to={to}
          fromLabel="Received from"
          toLabel="Received to"
          onChange={(range: DateRange) => dispatch(setDateRange(range))}
        />
      </div>

      <DataTable
        columns={columns}
        data={items}
        keyExtractor={(row) => row.id}
        onRowClick={(row) =>
          navigate({
            to: '/admin/notifications/$notificationRequestId',
            params: { notificationRequestId: row.id },
          })
        }
        isLoading={isLoading && (!hasLoaded || items.length === 0)}
        emptyMessage="No notifications in this date range"
        label="Notifications"
        search={search}
        onClearSearch={clearSearch}
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        activeFilters={filters}
        onFilter={(field, values) => dispatch(setFilter({ field, values }))}
        onPageChange={(next) => dispatch(setPage(next))}
        onPageSizeChange={(next) => dispatch(setLimit(next))}
        pageSizeOptions={[15, 30, 50]}
      />
    </div>
  )
}

export default AdminNotifications
