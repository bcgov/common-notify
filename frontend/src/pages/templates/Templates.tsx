import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import { deleteTemplate, getTemplateUsage, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse, TemplateUsageEvent } from '@/api/templates.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { setPage, setLimit, setSearch, setSort, setFilter } from '@/redux/slices/templates.slice'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import PageHeading from '@/components/PageHeading'
import SearchField from '@/components/SearchField'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import GenericModal from '@/components/GenericModal'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import '@/scss/components/templates.scss'

const baseColumns: TableColumn<TemplateResponse>[] = [
  {
    key: 'name',
    label: 'Template Title',
    sortable: true,
    render: (_, row) => (
      <Link
        to={`/template-edit/$templateId`}
        params={{ templateId: row.id }}
        className="data-table__cell-link"
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

type DeleteDialog =
  | { kind: 'confirm'; template: TemplateResponse }
  | { kind: 'blocked'; events: TemplateUsageEvent[] }

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
  const [dialog, setDialog] = useState<DeleteDialog | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const columns: TableColumn<TemplateResponse>[] = [
    ...baseColumns,
    {
      key: 'id',
      label: 'Action',
      width: '120px',
      className: 'templates__action-cell',
      render: (_, row) => (
        <Button
          variant="link"
          size="small"
          isDisabled={!canEdit}
          onPress={() => handleDeleteClick(row)}
          aria-label={`Delete ${row.name}`}
        >
          Delete
        </Button>
      ),
    },
  ]

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

  async function handleDeleteClick(row: TemplateResponse) {
    try {
      const { events } = await getTemplateUsage(row.id)
      setDialog(
        events.length > 0 ? { kind: 'blocked', events } : { kind: 'confirm', template: row },
      )
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to delete the template')
    }
  }

  async function handleConfirmDelete() {
    if (dialog?.kind !== 'confirm') return
    const { template } = dialog
    setIsDeleting(true)
    try {
      await deleteTemplate(template.id)
      showSuccessToast(`${template.name} deleted`)
      setDialog(null)
      // The deleted row was the only one on this page, so staying here would show an empty
      // table. Stepping back a page refetches through the effect above.
      if (templates.length === 1 && page > 1) {
        dispatch(setPage(page - 1))
      } else {
        dispatch(fetchTemplates())
      }
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to delete the template')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeading title="Notification Templates" />

      <div className="page__toolbar">
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search Notification Templates..."
          ariaLabel="Search templates"
        >
          <Button onPress={() => navigate({ to: '/template-create' })} isDisabled={!canEdit}>
            Create New Template
          </Button>
        </SearchField>
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

      {dialog?.kind === 'confirm' && (
        <GenericModal
          isOpen
          onClose={() => setDialog(null)}
          title="Delete template?"
          onSubmit={handleConfirmDelete}
          submitText="Yes, delete"
          isSubmitLoading={isDeleting}
        >
          <p>
            Are you sure you want to delete &ldquo;{dialog.template.name}&rdquo;?
            <br />
            {/* No last-used data exists on a template yet; the label is here for when it does. */}
            Last used:
            <br />
            Deleted templates can be restored from the Archive.
          </p>
        </GenericModal>
      )}

      {dialog?.kind === 'blocked' && (
        <GenericModal
          isOpen
          onClose={() => setDialog(null)}
          title="Template can't be deleted"
          cancelText="OK"
        >
          <p>
            This template is currently being used in the following event(s) and cannot be deleted.
            To delete this template, first remove it from:
          </p>
          <ul className="templates__usage-list">
            {dialog.events.map((event) => (
              <li key={`${event.id}-${event.channelCode}`}>
                <Link
                  to="/events/$eventId"
                  params={{ eventId: event.id }}
                  // The template is set on a channel tab, so link to the one it is used for.
                  search={{ tab: event.channelCode === NotificationChannel.SMS ? 'sms' : 'email' }}
                >
                  {event.name}
                </Link>
              </li>
            ))}
          </ul>
        </GenericModal>
      )}
    </div>
  )
}

export default Templates
