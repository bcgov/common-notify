import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import { EventStatus } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { setPage, setLimit, setSearch, setSort, setFilter } from '@/redux/slices/events.slice'
import { fetchEvents } from '@/redux/thunks/events.thunks'
import PageHeading from '@/components/PageHeading'
import SearchField from '@/components/SearchField'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import { ChannelBadge } from '@/components/ChannelBadge'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import '@/scss/components/events.scss'

const formatDate = (value: string): string =>
  new Date(value).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

const columns: TableColumn<EventResponse>[] = [
  {
    key: 'name',
    label: 'Notification Event',
    sortable: true,
    render: (_, row) => (
      <Link to="/events/$eventId" params={{ eventId: row.id }} style={{ color: 'black' }}>
        {row.name}
      </Link>
    ),
  },
  {
    key: 'channelCodes',
    label: 'Channel',
    width: '17%',
    filterOptions: [
      { label: 'Email', value: 'EMAIL' },
      { label: 'SMS', value: 'SMS' },
      { label: 'MsgApp', value: 'MSGAPP' },
    ],
    render: (_, row) => <ChannelBadge channels={row.channelCodes ?? []} />,
  },
  {
    key: 'description',
    label: 'Event Description',
    width: '30%',
    render: (_, row) => (
      <span className="events-page__description" title={row.description}>
        {row.description}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Event Status',
    filterOptions: [
      { label: 'Active', value: EventStatus.ACTIVE },
      { label: 'Draft', value: EventStatus.DRAFT },
    ],
    render: (_, row) => <span>{row.status === EventStatus.ACTIVE ? 'Active' : 'Draft'}</span>,
  },
  {
    key: 'updatedAt',
    label: 'Last Updated Date',
    width: '18%',
    sortable: true,
    sortType: 'date',
    render: (_, row) => <span>{formatDate(row.updatedAt)}</span>,
  },
]

const Events: FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const {
    items: events,
    page,
    limit,
    count,
    search,
    sortBy,
    sortOrder,
    filters,
    isLoading,
    hasLoaded,
  } = useAppSelector((state) => state.events)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { canEdit } = useCstarRoles()
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchEvents())
    }
  }, [page, limit, search, sortBy, sortOrder, filters, selectedTenant, dispatch])

  function handleSearch() {
    dispatch(setSearch(searchInput))
    dispatch(fetchEvents())
  }

  function handleLimitChange(newLimit: number) {
    dispatch(setLimit(newLimit))
    dispatch(fetchEvents())
  }

  function handleSort(key: string, order: 'asc' | 'desc' | null) {
    dispatch(setSort({ sortBy: order != null ? key : null, sortOrder: order }))
  }

  function handleFilter(key: string, values: string[]) {
    dispatch(setFilter({ field: key, values }))
  }

  return (
    <div>
      <PageHeading title="Notification Events" />

      <div className="events-page__search">
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search Notification Events..."
          ariaLabel="Search events"
        >
          <Button onPress={() => navigate({ to: '/events/create' })} isDisabled={!canEdit}>
            Create New Event
          </Button>
        </SearchField>
      </div>

      <DataTable
        columns={columns}
        data={events}
        keyExtractor={(row) => row.id}
        emptyMessage="No events found"
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        isLoading={isLoading && !hasLoaded}
        sortBy={sortBy ?? undefined}
        sortOrder={sortOrder}
        onSort={handleSort}
        activeFilters={filters}
        onFilter={handleFilter}
        onPageChange={(nextPage) => dispatch(setPage(nextPage))}
        onPageSizeChange={handleLimitChange}
        pageSizeOptions={[15, 30]}
        label="Notification Events"
      />
    </div>
  )
}

export default Events
