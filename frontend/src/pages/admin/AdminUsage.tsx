import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { getAdminUsageSummary, getAdminUsageTenants } from '@/api/apiKeyUsage.api'
import type { AdminTenantUsageRow, AdminUsageSummary } from '@/api/apiKeyUsage.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { fetchAllTenantsUsage, updateTenantLimits } from '@/redux/thunks/apiKeyUsage.thunks'
import {
  setAdminPage,
  setAdminLimit,
  setAdminSearch,
  setAdminFilter,
} from '@/redux/slices/apiKeyUsage.slice'
import UserService from '@/service/user-service'
import PageHeading from '@/components/PageHeading'
import TypeaheadSearchField from '@/components/TypeaheadSearchField'
import ChannelValues from '@/components/ChannelValues'
import RowActionsMenu from '@/components/RowActionsMenu'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import NotAuthorized from '@/components/NotAuthorized'
import UsageCell from '@/components/UsageCell'
import EditModal from '@/components/EditModal'
import NumberInputField from '@/components/NumberInputField'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'
import TenantSendingCell from './TenantSendingCell'
import TenantSendingDialog from './TenantSendingDialog'
import {
  adoptionSummaryText,
  formatChannel,
  formatFailures,
  formatLastSent,
  groupUsageByTenant,
} from '@/utils/usage'
import type { AdminTenantUsage } from '@/utils/usage'

const rowKeyOf = (row: AdminTenantUsageRow) => `${row.tenantId}-${row.channel}`

const SENDING_ACTION = 'sending'
const LIMITS_ACTION_PREFIX = 'limits:'

/** The ⋮ menu's groups for a tenant: edit each channel that has limits, then the sending toggle. */
function tenantActionGroups(tenant: AdminTenantUsage) {
  return [
    {
      id: 'limits',
      // Limits are created when an API key is bound, so a channel without them has nothing to edit.
      actions: tenant.channels
        .filter((row) => row.dailyLimit !== null && row.annualLimit !== null)
        .map((row) => ({
          id: `${LIMITS_ACTION_PREFIX}${row.channel}`,
          label: `Edit ${formatChannel(row.channel)} limits`,
        })),
    },
    {
      id: SENDING_ACTION,
      actions: [
        {
          id: SENDING_ACTION,
          label: tenant.sendingEnabled ? 'Disable sending' : 'Enable sending',
        },
      ],
    },
  ]
}

const AdminUsage: FC = () => {
  const dispatch = useAppDispatch()
  const {
    adminRows,
    adminLoading,
    adminPage,
    adminLimit,
    adminCount,
    adminSearch,
    adminFilters,
    adminUpdatingKey,
    adminError,
  } = useAppSelector((state) => state.apiKeyUsage)
  const isAdmin = UserService.hasRole('NOTIFY_ADMIN')
  const [searchInput, setSearchInput] = useState(adminSearch)
  const [editingRow, setEditingRow] = useState<AdminTenantUsageRow | null>(null)
  const [dailyLimit, setDailyLimit] = useState(0)
  const [annualLimit, setAnnualLimit] = useState(0)
  const [summary, setSummary] = useState<AdminUsageSummary | null>(null)
  const [sendingTarget, setSendingTarget] = useState<AdminTenantUsage | null>(null)
  const [tenantNames, setTenantNames] = useState<string[]>([])

  // Totals across every tenant, so they don't change with the table's search or filters: fetched
  // on arrival and after a change that moves them. Only this screen reads them, so no slice.
  const loadSummary = useCallback(() => {
    getAdminUsageSummary()
      .then(setSummary)
      .catch((error: Error) => showErrorToast(error.message))
  }, [])

  useEffect(() => {
    if (isAdmin) loadSummary()
  }, [isAdmin, loadSummary])

  // Fetched once: the search's suggestions. Without them the search still works on typed text,
  // so a failure leaves the list empty rather than raising an error over the table.
  useEffect(() => {
    if (!isAdmin) return
    getAdminUsageTenants()
      .then((tenants) => setTenantNames(tenants.map((tenant) => tenant.name)))
      .catch(() => setTenantNames([]))
  }, [isAdmin])

  // The API returns a row per tenant and channel; the table shows a row per tenant.
  const tenants = useMemo(() => groupUsageByTenant(adminRows), [adminRows])

  // Server-side: refetch whenever the page, page size, committed search or filters change.
  useEffect(() => {
    if (isAdmin) {
      dispatch(fetchAllTenantsUsage())
    }
  }, [isAdmin, adminPage, adminLimit, adminSearch, adminFilters, dispatch])

  if (!isAdmin) {
    return <NotAuthorized />
  }

  const isSaving = editingRow ? adminUpdatingKey === rowKeyOf(editingRow) : false

  function handleLimitChange(newLimit: number) {
    dispatch(setAdminLimit(newLimit))
  }

  function handleSearch(term: string) {
    dispatch(setAdminSearch(term.trim()))
  }

  function clearSearch() {
    setSearchInput('')
    dispatch(setAdminSearch(''))
  }

  function handleFilter(key: string, values: string[]) {
    dispatch(setAdminFilter({ field: key, values }))
  }

  function openEdit(row: AdminTenantUsageRow) {
    setEditingRow(row)
    setDailyLimit(row.dailyLimit ?? 0)
    setAnnualLimit(row.annualLimit ?? 0)
  }

  function handleTenantAction(tenant: AdminTenantUsage, actionId: string) {
    if (actionId === SENDING_ACTION) {
      setSendingTarget(tenant)
      return
    }
    const channel = actionId.slice(LIMITS_ACTION_PREFIX.length)
    const row = tenant.channels.find((candidate) => candidate.channel === channel)
    if (row) openEdit(row)
  }

  function closeEdit() {
    setEditingRow(null)
  }

  async function handleSaveLimits() {
    if (!editingRow) return
    if (
      !Number.isInteger(dailyLimit) ||
      dailyLimit < 1 ||
      !Number.isInteger(annualLimit) ||
      annualLimit < 1
    ) {
      showErrorToast('Daily and annual limits must be whole numbers of at least 1')
      return
    }
    try {
      await dispatch(
        updateTenantLimits({
          tenantId: editingRow.tenantId,
          channel: editingRow.channel,
          dailyLimit,
          annualLimit,
        }),
      ).unwrap()
      showSuccessToast(
        `${formatChannel(editingRow.channel)} limits updated for ${editingRow.tenantName}`,
      )
      closeEdit()
    } catch (error) {
      showErrorToast(typeof error === 'string' ? error : 'Failed to update limits')
    }
  }

  const columns: TableColumn<AdminTenantUsage>[] = [
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, tenant) => <span className="fw-semibold">{tenant.tenantName}</span>,
    },
    {
      key: 'sendingEnabled',
      label: 'Sending',
      filterKey: 'status',
      filterOptions: [
        { label: 'Enabled', value: 'active' },
        { label: 'Disabled', value: 'disabled' },
      ],
      render: (_, tenant) => <TenantSendingCell {...tenant} />,
    },
    {
      key: 'channels',
      label: 'Channel',
      filterKey: 'channel',
      filterOptions: [
        { label: 'Email', value: 'EMAIL' },
        { label: 'SMS', value: 'SMS' },
      ],
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          labelled={false}
          render={(row) => formatChannel(row.channel)}
        />
      ),
    },
    {
      key: 'channels',
      id: 'lastSent',
      label: 'Last sent',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) =>
            row.lastSentAt === null ? (
              <span className="text-muted">Never</span>
            ) : (
              <time dateTime={row.lastSentAt} title={new Date(row.lastSentAt).toLocaleString()}>
                {formatLastSent(row.lastSentAt, Date.now())}
              </time>
            )
          }
        />
      ),
    },
    {
      key: 'channels',
      id: 'averageMonthly',
      label: 'Avg / month',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) =>
            row.averageMonthlySends === null ? (
              <span className="text-muted">
                —<span className="visually-hidden">No full month of sending yet</span>
              </span>
            ) : (
              row.averageMonthlySends.toLocaleString()
            )
          }
        />
      ),
    },
    {
      key: 'channels',
      id: 'failed',
      label: 'Failed (30 days)',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) => (
            <span className={row.failedLast30Days > 0 ? 'text-danger fw-semibold' : undefined}>
              {formatFailures(row.failedLast30Days, row.recipientsLast30Days)}
            </span>
          )}
        />
      ),
    },
    {
      key: 'channels',
      id: 'daily',
      label: 'Daily',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) => (
            <UsageCell
              used={row.usedToday}
              limit={row.dailyLimit}
              thresholdPercent={row.warnThresholdPercent}
            />
          )}
        />
      ),
    },
    {
      key: 'channels',
      id: 'annual',
      label: 'Annual (fiscal year)',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) => (
            <UsageCell
              used={row.usedThisYear}
              limit={row.annualLimit}
              thresholdPercent={row.warnThresholdPercent}
            />
          )}
        />
      ),
    },
    {
      key: 'channels',
      id: 'threshold',
      label: 'Alert threshold',
      render: (_, tenant) => (
        <ChannelValues
          rows={tenant.channels}
          render={(row) =>
            row.warnThresholdPercent === null ? (
              <span className="text-muted">Not set</span>
            ) : (
              `${row.warnThresholdPercent}%`
            )
          }
        />
      ),
    },
    {
      key: 'tenantId',
      label: 'Actions',
      render: (_, tenant) => (
        <RowActionsMenu
          label={`Actions for ${tenant.tenantName}`}
          groups={tenantActionGroups(tenant)}
          onAction={(actionId) => handleTenantAction(tenant, actionId)}
        />
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeading
        title="Tenant Usage & Limits"
        meta={summary ? adoptionSummaryText(summary) : undefined}
      />
      {adminError && <div role="alert">{adminError}</div>}

      <div className="page__toolbar">
        <TypeaheadSearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          suggestions={tenantNames}
          placeholder="Search tenants..."
          ariaLabel="Search tenants"
        />
      </div>

      <DataTable
        columns={columns}
        data={tenants}
        keyExtractor={(tenant) => tenant.tenantId}
        multiline
        isLoading={adminLoading}
        emptyMessage="No tenants found."
        search={adminSearch}
        onClearSearch={clearSearch}
        activeFilters={adminFilters}
        onFilter={handleFilter}
        currentPage={adminPage}
        pageSize={adminLimit}
        totalCount={adminCount}
        onPageChange={(nextPage) => dispatch(setAdminPage(nextPage))}
        onPageSizeChange={handleLimitChange}
        pageSizeOptions={[15, 30]}
        label="All tenants notification usage"
      />

      {sendingTarget && (
        <TenantSendingDialog
          key={sendingTarget.tenantId}
          tenant={sendingTarget}
          onClose={() => setSendingTarget(null)}
          onChanged={() => {
            dispatch(fetchAllTenantsUsage())
            loadSummary()
          }}
        />
      )}

      <EditModal
        isOpen={editingRow !== null}
        title={editingRow ? `Edit ${formatChannel(editingRow.channel)} limits` : ''}
        isSaving={isSaving}
        onClose={closeEdit}
        onSave={handleSaveLimits}
      >
        <p className="text-muted mb-3">{editingRow?.tenantName}</p>
        <div className="d-flex flex-column gap-3">
          <NumberInputField
            id="edit-daily-limit"
            label="Daily maximum"
            value={dailyLimit}
            min={1}
            disabled={isSaving}
            onChange={setDailyLimit}
          />
          <NumberInputField
            id="edit-annual-limit"
            label="Annual maximum"
            value={annualLimit}
            min={1}
            disabled={isSaving}
            onChange={setAnnualLimit}
          />
        </div>
      </EditModal>
    </div>
  )
}

export default AdminUsage
