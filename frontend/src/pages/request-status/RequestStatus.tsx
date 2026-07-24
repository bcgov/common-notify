import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { NotificationRequestDetail } from '@/interfaces/NotificationRequest'
import { DataTable } from '@/components/DataTable'
import type { TableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import PageHeading from '@/components/PageHeading'
import { ChannelBadge } from '@/components/ChannelBadge'
import SearchField from '@/components/SearchField'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import {
  setPage,
  setLimit,
  setSearch,
  setSort,
  setFilter,
} from '@/redux/slices/notificationDetail.slice'
import {
  fetchNotificationDetails,
  fetchNotificationRequest,
} from '@/redux/thunks/notificationDetail.thunks'
import RequestStatusSummary from '@/components/RequestStatusSummary'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

interface RequestStatusProps {
  notificationRequestId: string
}

/** Channels the request targeted, derived from the recipients present on each channel. */
function channelsFromRequest(request: NotificationRequest): string[] {
  const channels: string[] = []
  if (request.recipients?.email?.length) channels.push('EMAIL')
  if (request.recipients?.sms?.length) channels.push('SMS')
  if (request.recipients?.msgApp?.length) channels.push('MSGAPP')
  return channels
}

/** Total recipient-channel entries across all channels on the parent request. */
function recipientCountFromRequest(request: NotificationRequest): number {
  const { email = [], sms = [], msgApp = [] } = request.recipients ?? {}
  return email.length + sms.length + msgApp.length
}

const columns: TableColumn<NotificationRequestDetail>[] = [
  {
    key: 'recipientAddress',
    label: 'Recipient',
    sortable: true,
  },
  {
    key: 'channel',
    label: 'Channel',
    sortable: true,
    filterOptions: [
      { label: 'Email', value: 'EMAIL' },
      { label: 'SMS', value: 'SMS' },
      { label: 'MsgApp', value: 'MSGAPP' },
    ],
    render: (_, row) => <ChannelBadge channels={[row.channel]} />,
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    filterOptions: [
      { label: 'Pending', value: 'pending' },
      { label: 'Sent', value: 'sent' },
      { label: 'Failed', value: 'failed' },
    ],
    render: (_, row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'errorMessage',
    label: 'Failure Reason',
    render: (_, row) => row.errorMessage ?? '-',
  },
]

const RequestStatus: FC<RequestStatusProps> = ({ notificationRequestId }) => {
  const dispatch = useAppDispatch()
  const {
    notificationRequest,
    items: details,
    page,
    limit,
    count,
    search,
    sortBy,
    sortOrder,
    filters,
    isLoading,
    hasLoaded,
  } = useAppSelector((state) => state.notificationDetail)
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    dispatch(fetchNotificationRequest(notificationRequestId))
  }, [notificationRequestId, dispatch])

  useEffect(() => {
    dispatch(fetchNotificationDetails(notificationRequestId))
  }, [notificationRequestId, page, limit, search, sortBy, sortOrder, filters, dispatch])

  function handleSearch() {
    dispatch(setSearch(searchInput))
  }

  function handleLimitChange(newLimit: number) {
    dispatch(setLimit(newLimit))
  }

  function handleSort(key: string, order: 'asc' | 'desc' | null) {
    dispatch(setSort({ sortBy: order != null ? key : null, sortOrder: order }))
  }

  function handleFilter(key: string, values: string[]) {
    dispatch(setFilter({ field: key, values }))
  }

  return (
    <div>
      <PageHeading title="Notification Status" />

      {notificationRequest && (
        <RequestStatusSummary
          channels={channelsFromRequest(notificationRequest)}
          recipientsCount={recipientCountFromRequest(notificationRequest)}
          sentDate={new Date(notificationRequest.delayedSendTime ?? notificationRequest.createdAt)}
          overallStatus={notificationRequest.status}
        />
      )}

      <SearchField
        value={searchInput}
        onChange={setSearchInput}
        onSearch={handleSearch}
        placeholder="Search recipients..."
        ariaLabel="Search delivery records"
      />

      <DataTable
        columns={columns}
        data={details}
        keyExtractor={(row) => row.id}
        isLoading={isLoading && !hasLoaded}
        emptyMessage="No delivery records found"
        label="Notification Delivery Records"
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        sortBy={sortBy ?? undefined}
        sortOrder={sortOrder}
        onSort={handleSort}
        activeFilters={filters}
        onFilter={handleFilter}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
        onPageSizeChange={handleLimitChange}
        pageSizeOptions={[15, 30]}
      />
    </div>
  )
}

export default RequestStatus
