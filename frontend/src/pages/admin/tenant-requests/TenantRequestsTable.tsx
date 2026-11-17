import { useEffect, useState } from 'react'
import type { FC } from 'react'
import DataTable from '@/components/DataTable/DataTable'
import NoDataCard from '@/components/NoDataCard'
import type { TableColumn } from '@/components/DataTable/DataTable'
import RowActionsMenu from '@/components/RowActionsMenu'
import type { RowActionGroup } from '@/components/RowActionsMenu'
import TypeaheadSearchField from '@/components/TypeaheadSearchField'
import TenantRequestStatusBadge, {
  TENANT_REQUEST_STATUSES,
  tenantRequestStatusLabel,
} from '@/components/TenantRequestStatusBadge'
import { getTenantRequests } from '@/api/tenantRequests.api'
import type { TenantRequest, TenantRequestCode } from '@/api/tenantRequests.api'
import { useNotifyTenantNames } from '@/hooks/useNotifyTenantNames'
import { toFilterParams } from '@/redux/utils/listFilters'
import { formatDate } from '@/utils/dates'

/** What can be done with a request in each status. A decided one is a record only. */
const REQUEST_ACTIONS: Partial<Record<string, RowActionGroup['actions']>> = {
  pending: [
    { id: 'approve', label: 'Approve' },
    { id: 'reject', label: 'Reject' },
  ],
  approved: [{ id: 'release', label: 'Release' }],
}

export type TenantRequestAction = 'approve' | 'reject' | 'release'

/** The admin's queue: new requests, until they choose to see the rest. */
const DEFAULT_STATUSES = ['pending']
const PAGE_SIZES = [15, 30]

/** "Approved by Pat Admin Nov 17, 2026": who did something and when. */
const ByWhen: FC<{ verb: string; by: string | null; at: string }> = ({ verb, by, at }) => (
  <span className="tenant-requests__detail">
    {verb}
    {by ? ` by ${by}` : ''} <time dateTime={at}>{formatDate(at)}</time>
  </span>
)

/**
 * Who decided a request and when, what it granted, and who released it if anyone has. A cancelled
 * request was never decided, so shows who cancelled it.
 */
const RequestDecision: FC<{ request: TenantRequest }> = ({ request }) => {
  if (request.cancelledAt) {
    return <ByWhen verb="Cancelled" by={request.cancelledBy} at={request.cancelledAt} />
  }
  if (!request.decidedAt) return <span className="tenant-requests__detail">Not yet decided</span>
  const verb = request.statusCode === 'rejected' ? 'Rejected' : 'Approved'
  return (
    <div className="tenant-requests__stack">
      {request.outcome && <span>{request.outcome}</span>}
      {request.decisionReason && <span>{request.decisionReason}</span>}
      <ByWhen verb={verb} by={request.decidedBy} at={request.decidedAt} />
      {request.releasedAt && (
        <ByWhen verb="Released" by={request.releasedBy} at={request.releasedAt} />
      )}
    </div>
  )
}

/** A filter for each column with something selected: an empty filter is no filter. */
function activeFiltersOf(filters: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length > 0))
}

interface TenantRequestsTableProps {
  /** The request types, for the Type column and its filter. */
  types: readonly TenantRequestCode[]
  /** The status code table, for the Status filter. Falls back to the statuses the badge knows. */
  statuses?: readonly TenantRequestCode[]
  /** Changed by the page after it saves something, to load the current page again. */
  reloadKey: number
  onAction: (action: TenantRequestAction, request: TenantRequest) => void
}

/**
 * Every tenant's requests, a page at a time, newest first. Shows pending requests of every type
 * until the admin filters from the Type or Status column; searches by tenant name.
 */
const TenantRequestsTable: FC<TenantRequestsTableProps> = ({
  types,
  statuses,
  reloadKey,
  onAction,
}) => {
  const tenantNames = useNotifyTenantNames()
  const [requests, setRequests] = useState<TenantRequest[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(PAGE_SIZES[0])
  const [statusFilter, setStatusFilter] = useState<string[]>(DEFAULT_STATUSES)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Loading until the query on screen is the one last answered.
  const query = JSON.stringify([page, limit, search, statusFilter, typeFilter, reloadKey])
  const [answered, setAnswered] = useState<string | null>(null)
  const loading = answered !== query

  useEffect(() => {
    // A newer query replaces a slower older one, rather than the other way round.
    let current = true
    getTenantRequests({
      page,
      limit,
      search: search || undefined,
      filter: toFilterParams({ statusCode: statusFilter, requestTypeCode: typeFilter }),
    })
      .then((result) => {
        if (!current) return
        setRequests(result.data)
        setCount(result.count)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!current) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load requests')
      })
      .finally(() => {
        if (current) setAnswered(query)
      })
    return () => {
      current = false
    }
  }, [page, limit, search, statusFilter, typeFilter, query])

  function applySearch(term: string) {
    setSearch(term.trim())
    setPage(1)
  }

  function clearSearch() {
    setSearchInput('')
    applySearch('')
  }

  const statusCodes = statuses?.length
    ? statuses.map((status) => status.code)
    : TENANT_REQUEST_STATUSES
  const statusOptions = statusCodes.map((code) => ({
    label: tenantRequestStatusLabel(code),
    value: code,
  }))
  const typeOptions = types.map((type) => ({ label: type.description, value: type.code }))
  const typeLabel = (code: string) => types.find((type) => type.code === code)?.description ?? code

  const columns: TableColumn<TenantRequest>[] = [
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, request) => <span className="fw-semibold">{request.tenantName}</span>,
    },
    {
      key: 'requestTypeCode',
      label: 'Type',
      filterOptions: typeOptions,
      render: (_, request) => typeLabel(request.requestTypeCode),
    },
    {
      key: 'statusCode',
      label: 'Status',
      filterOptions: statusOptions,
      render: (_, request) => <TenantRequestStatusBadge status={request.statusCode} />,
    },
    {
      key: 'requestedAt',
      label: 'Requested',
      render: (_, request) => (
        <div className="tenant-requests__stack">
          <time dateTime={request.requestedAt}>{formatDate(request.requestedAt)}</time>
          {request.requestedBy && (
            <span className="tenant-requests__detail">By {request.requestedBy}</span>
          )}
        </div>
      ),
    },
    {
      key: 'decidedAt',
      label: 'Decision',
      render: (_, request) => <RequestDecision request={request} />,
    },
    {
      key: 'id',
      label: 'Actions',
      render: (_, request) => {
        const actions = REQUEST_ACTIONS[request.statusCode]
        return actions ? (
          <RowActionsMenu
            label={`Actions for ${request.tenantName}'s request`}
            groups={[{ id: 'request', actions }]}
            onAction={(actionId) => onAction(actionId as TenantRequestAction, request)}
          />
        ) : null
      },
    },
  ]

  // Nothing to show in the usual view (every type, pending or every status, no search): a card, as
  // on the other list pages. A search or another filter keeps the table, with its own empty state.
  const pendingOnly = statusFilter.length === 1 && statusFilter[0] === 'pending'
  const usualView = !search && typeFilter.length === 0 && (pendingOnly || statusFilter.length === 0)
  if (!loading && !error && count === 0 && usualView) {
    return pendingOnly ? (
      <NoDataCard
        title="No pending requests."
        message="New requests from tenants appear here for review. Requests already decided are kept under their other statuses."
        actionLabel="Show all requests"
        onAction={() => {
          setStatusFilter([])
          setPage(1)
        }}
      />
    ) : (
      <NoDataCard
        title="No tenant requests yet."
        message="Tenants ask for things like an SMS number from their settings. Their requests will appear here for review."
      />
    )
  }

  return (
    <>
      {error && <div role="alert">{error}</div>}
      <div className="page__toolbar">
        <TypeaheadSearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={applySearch}
          suggestions={tenantNames}
          placeholder="Search tenants..."
          ariaLabel="Search requests by tenant"
        />
      </div>
      <DataTable
        columns={columns}
        data={requests}
        keyExtractor={(request) => request.id}
        multiline
        isLoading={loading}
        emptyMessage="No tenant has made a request."
        search={search}
        onClearSearch={clearSearch}
        activeFilters={activeFiltersOf({ statusCode: statusFilter, requestTypeCode: typeFilter })}
        onFilter={(key, values) => {
          if (key === 'requestTypeCode') setTypeFilter(values)
          else setStatusFilter(values)
          setPage(1)
        }}
        currentPage={page}
        pageSize={limit}
        totalCount={count}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setLimit(size)
          setPage(1)
        }}
        pageSizeOptions={PAGE_SIZES}
        label="Tenant requests"
      />
    </>
  )
}

export default TenantRequestsTable
