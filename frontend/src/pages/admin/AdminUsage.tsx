import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
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
import { formatChannel } from '@/utils/usage'

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

  function openEdit(row: AdminTenantUsageRow) {
    setEditingRow(row)
    setDailyLimit(row.dailyLimit)
    setAnnualLimit(row.annualLimit)
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
      render: (_, row) => <span>{row.warnThresholdPercent}%</span>,
    },
    {
      key: 'tenantId',
      label: 'Actions',
      render: (_, row) => (
        <button type="button" className="btn btn-sm btn-link p-0" onClick={() => openEdit(row)}>
          Edit limits
        </button>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeading title="Tenant Usage & Limits" />
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
        emptyMessage="No tenant usage data found."
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
