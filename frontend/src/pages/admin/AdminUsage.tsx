import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { getAdminUsageSummary } from '@/api/apiKeyUsage.api'
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
import SearchField from '@/components/SearchField'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import NotAuthorized from '@/components/NotAuthorized'
import UsageCell from '@/components/UsageCell'
import EditModal from '@/components/EditModal'
import NumberInputField from '@/components/NumberInputField'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'
import { adoptionSummaryText, formatChannel, formatLastSent } from '@/utils/usage'

const rowKeyOf = (row: AdminTenantUsageRow) => `${row.tenantId}-${row.channel}`

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

  // Totals across every tenant, so they don't change with the table's search or filters and
  // are fetched once. Only this screen reads them, so there is no slice.
  useEffect(() => {
    if (!isAdmin) return
    getAdminUsageSummary()
      .then(setSummary)
      .catch((error: Error) => showErrorToast(error.message))
  }, [isAdmin])

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

  function handleSearch() {
    dispatch(setAdminSearch(searchInput.trim()))
  }

  function clearSearch() {
    setSearchInput('')
    dispatch(setAdminSearch(''))
  }

  function handleFilter(key: string, values: string[]) {
    dispatch(setAdminFilter({ field: key, values }))
  }

  function openEdit(row: AdminTenantUsageRow, limits: { daily: number; annual: number }) {
    setEditingRow(row)
    setDailyLimit(limits.daily)
    setAnnualLimit(limits.annual)
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

  const columns: TableColumn<AdminTenantUsageRow>[] = [
    {
      key: 'tenantName',
      label: 'Tenant',
      render: (_, row) => <span className="fw-semibold">{row.tenantName}</span>,
    },
    {
      key: 'channel',
      label: 'Channel',
      filterOptions: [
        { label: 'Email', value: 'EMAIL' },
        { label: 'SMS', value: 'SMS' },
      ],
      render: (_, row) => <span>{formatChannel(row.channel)}</span>,
    },
    {
      key: 'lastSentAt',
      label: 'Last sent',
      render: (_, row) =>
        row.lastSentAt === null ? (
          <span className="text-muted">Never</span>
        ) : (
          <time dateTime={row.lastSentAt} title={new Date(row.lastSentAt).toLocaleString()}>
            {formatLastSent(row.lastSentAt, Date.now())}
          </time>
        ),
    },
    {
      key: 'averageMonthlySends',
      label: 'Avg / month',
      render: (_, row) =>
        row.averageMonthlySends === null ? (
          <span className="text-muted">
            —<span className="visually-hidden">No full month of sending yet</span>
          </span>
        ) : (
          <span>{row.averageMonthlySends.toLocaleString()}</span>
        ),
    },
    {
      key: 'dailyLimit',
      label: 'Daily',
      render: (_, row) => (
        <UsageCell
          used={row.usedToday}
          limit={row.dailyLimit}
          thresholdPercent={row.warnThresholdPercent}
        />
      ),
    },
    {
      key: 'annualLimit',
      label: 'Annual (fiscal year)',
      render: (_, row) => (
        <UsageCell
          used={row.usedThisYear}
          limit={row.annualLimit}
          thresholdPercent={row.warnThresholdPercent}
        />
      ),
    },
    {
      key: 'warnThresholdPercent',
      label: 'Alert threshold',
      render: (_, row) =>
        row.warnThresholdPercent === null ? (
          <span className="text-muted">Not set</span>
        ) : (
          <span>{row.warnThresholdPercent}%</span>
        ),
    },
    {
      key: 'tenantId',
      label: 'Actions',
      // Limits are created when an API key is bound, so there is nothing to edit until then.
      render: (_, row) => {
        const { dailyLimit: daily, annualLimit: annual } = row
        if (daily === null || annual === null) {
          return <span className="text-muted">No limits to edit</span>
        }
        return (
          <button
            type="button"
            className="btn btn-sm btn-link p-0"
            onClick={() => openEdit(row, { daily, annual })}
          >
            Edit limits
          </button>
        )
      },
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
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          onSearch={handleSearch}
          placeholder="Search tenants..."
          ariaLabel="Search tenants"
        />
      </div>

      <DataTable
        columns={columns}
        data={adminRows}
        keyExtractor={(row) => rowKeyOf(row)}
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
