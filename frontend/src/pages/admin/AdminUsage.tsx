import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Modal, AlertDialog, Button } from '@bcgov/design-system-react-components'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { fetchAllTenantsUsage, updateTenantLimits } from '@/redux/thunks/apiKeyUsage.thunks'
import { setAdminPage, setAdminLimit, setAdminSearch } from '@/redux/slices/apiKeyUsage.slice'
import UserService from '@/service/user-service'
import PageHeading from '@/components/PageHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import NotAuthorized from '@/components/NotAuthorized'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

/** Title-case a channel code, e.g. EMAIL -> Email. */
function formatChannel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase()
}

/** Usage as a percentage of a limit, to one decimal place. */
function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.round((used / limit) * 1000) / 10
}

/** Render "used / limit (pct%)", highlighting when at/over the warning threshold. */
function UsageCell({
  used,
  limit,
  thresholdPercent,
}: {
  used: number
  limit: number
  thresholdPercent: number
}) {
  const pct = percentOf(used, limit)
  const warn = pct >= thresholdPercent
  return (
    <span className={warn ? 'text-danger fw-semibold' : ''}>
      {used.toLocaleString()} / {limit.toLocaleString()}{' '}
      <span className="text-muted">({pct}%)</span>
    </span>
  )
}

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
    adminUpdatingKey,
  } = useAppSelector((state) => state.apiKeyUsage)
  const isAdmin = UserService.hasRole('NOTIFY_ADMIN')
  const [searchInput, setSearchInput] = useState(adminSearch)
  const [editingRow, setEditingRow] = useState<AdminTenantUsageRow | null>(null)
  const [dailyLimit, setDailyLimit] = useState(0)
  const [annualLimit, setAnnualLimit] = useState(0)

  // Server-side: refetch whenever the page, page size, or committed search changes.
  useEffect(() => {
    if (isAdmin) {
      dispatch(fetchAllTenantsUsage())
    }
  }, [isAdmin, adminPage, adminLimit, adminSearch, dispatch])

  if (!isAdmin) {
    return <NotAuthorized />
  }

  const isSaving = editingRow ? adminUpdatingKey === rowKeyOf(editingRow) : false

  function handleSearch() {
    // setAdminSearch resets to page 1; the effect above triggers the refetch.
    dispatch(setAdminSearch(searchInput.trim()))
  }

  function handleLimitChange(newLimit: number) {
    dispatch(setAdminLimit(newLimit))
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
    <div>
      <PageHeading title="Tenant Usage & Limits" />


        <DataTable
          columns={columns}
          data={adminRows}
          keyExtractor={(row) => rowKeyOf(row)}
          isLoading={adminLoading}
          emptyMessage="No tenant usage data found."
          currentPage={adminPage}
          pageSize={adminLimit}
          totalCount={adminCount}
          onPageChange={(nextPage) => dispatch(setAdminPage(nextPage))}
          onPageSizeChange={handleLimitChange}
          pageSizeOptions={[15, 30]}
          label="All tenants notification usage"
        />

      <Modal
        isOpen={editingRow !== null}
        isDismissable={!isSaving}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        {editingRow && (
          <AlertDialog
            isIconHidden
            isCloseable
            title={`Edit ${formatChannel(editingRow.channel)} limits`}
            buttons={
              <>
                <Button variant="tertiary" onPress={closeEdit} isDisabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={handleSaveLimits} isDisabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </>
            }
          >
            <p className="text-muted mb-3">{editingRow.tenantName}</p>
            <div className="d-flex flex-column gap-3">
              <div>
                <label className="form-label" htmlFor="edit-daily-limit">
                  Daily maximum
                </label>
                <input
                  id="edit-daily-limit"
                  type="number"
                  min={1}
                  className="form-control"
                  value={dailyLimit}
                  disabled={isSaving}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="edit-annual-limit">
                  Annual maximum
                </label>
                <input
                  id="edit-annual-limit"
                  type="number"
                  min={1}
                  className="form-control"
                  value={annualLimit}
                  disabled={isSaving}
                  onChange={(e) => setAnnualLimit(Number(e.target.value))}
                />
              </div>
            </div>
          </AlertDialog>
        )}
      </Modal>
    </div>
  )
}

export default AdminUsage
