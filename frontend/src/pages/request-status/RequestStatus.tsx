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
import { fetchNotificationDetails } from '@/redux/thunks/notificationDetail.thunks'

interface RequestStatusProps {
  notificationRequestId: string
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
