import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { setPage, setLimit, setSearch, setSort, setFilter } from '@/redux/slices/templates.slice'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import PageHeading from '@/components/PageHeading'
import SearchField from '@/components/SearchField'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import { useCstarRoles } from '@/hooks/useCstarRoles'

const columns: TableColumn<TemplateResponse>[] = [
  {
    key: 'name',
    label: 'Template Title',
    sortable: true,
    render: (_, row) => (
      <Link
        to={`/template-edit/$templateId`}
        params={{ templateId: row.id }}
        style={{ color: 'black' }}
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: 'channelCode',
    label: 'Template Type',
    sortable: true,
    filterOptions: [
      { label: 'Email', value: 'EMAIL' },
      { label: 'SMS', value: 'SMS' },
    ],
    render: (_, row) => {
      const channelCode = row.channelCode === 'EMAIL' ? 'Email' : row.channelCode
      return <span>{channelCode}</span>
    },
  },
  {
    key: 'active',
    label: 'Template Status',
    render: (_, row) => <span>{row.active ? 'Active' : 'Inactive'}</span>,
  },
  {
    key: 'createdAt',
    label: 'Initiated Date',
    sortable: true,
    sortType: 'date',
    render: (_, row) => {
      const formatted = new Date(row.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      return <span>{formatted}</span>
    },
  },
  {
    key: 'updatedAt',
    label: 'Last Updated Date',
    sortable: true,
    sortType: 'date',
    render: (_, row) => {
      const formatted = new Date(row.updatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      return <span>{formatted}</span>
    },
  },
]

const Templates: FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const {
    items: templates,
    page,
    limit,
    count,
    search,
    sortBy,
    sortOrder,
    filters,
    isLoading,
    hasLoaded,
  } = useAppSelector((state) => state.templates)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { canEdit } = useCstarRoles()
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchTemplates())
    }
  }, [page, limit, search, sortBy, sortOrder, filters, selectedTenant, dispatch])

  function handleSearch() {
    dispatch(setSearch(searchInput))
    dispatch(fetchTemplates())
  }

  function handleLimitChange(newLimit: number) {
    dispatch(setLimit(newLimit))
    dispatch(fetchTemplates())
  }

  function handleSort(key: string, order: 'asc' | 'desc' | null) {
    dispatch(setSort({ sortBy: order != null ? key : null, sortOrder: order }))
  }

  function handleFilter(key: string, values: string[]) {
    dispatch(setFilter({ field: key, values }))
  }

  return (
    <div>
      <PageHeading title="Notification Templates" />

      <div className="row mb-5 g-2 align-items-center">
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search Notification Templates..."
          ariaLabel="Search templates"
        />
        <div className="col-auto ms-auto">
          <Button onPress={() => navigate({ to: '/template-create' })} isDisabled={!canEdit}>
            Create New Template
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={templates}
        keyExtractor={(row) => row.id}
        emptyMessage="No templates found"
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
        label="Notification Templates"
      />
    </div>
  )
}

export default Templates
