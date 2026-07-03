import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Modal, AlertDialog, Button } from '@bcgov/design-system-react-components'
import type { ChannelUsage, UsageHistoryEntry } from '@/api/apiKeyUsage.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  updateThreshold,
} from '@/redux/thunks/apiKeyUsage.thunks'
import PageHeading from '@/components/PageHeading'
import Card from '@/components/Card'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'

const OPERATIONS_ADMIN_ROLE = 'NOTIFY_OPERATIONS_ADMIN'

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

/** Fiscal-year label from the window start date, e.g. 2025-04-01 -> "FY2025". */
function fiscalYearLabel(isoDate: string): string {
  if (!isoDate) return '—'
  const year = new Date(isoDate).getUTCFullYear()
  return `FY${year}`
}

const Usage: FC = () => {
  const dispatch = useAppDispatch()
  const { usage, isLoading, historyLoading, updatingChannel } = useAppSelector(
    (state) => state.apiKeyUsage,
  )
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const cstarRoles = useAppSelector((state) => state.user.current?.cstarRoles)

  const canEditThreshold = Array.isArray(cstarRoles) && cstarRoles.includes(OPERATIONS_ADMIN_ROLE)

  const [editingChannel, setEditingChannel] = useState<ChannelUsage | null>(null)
  const [thresholdValue, setThresholdValue] = useState(80)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchApiKeyUsage())
      dispatch(fetchApiKeyUsageHistory())
    }
  }, [selectedTenant, dispatch])

  const isSaving = editingChannel ? updatingChannel === editingChannel.channel : false

  function openEdit(row: ChannelUsage) {
    setEditingChannel(row)
    setThresholdValue(row.warnThresholdPercent)
  }

  function closeEdit() {
    setEditingChannel(null)
  }

  async function handleSaveThreshold() {
    if (!editingChannel) return
    if (!Number.isInteger(thresholdValue) || thresholdValue < 1 || thresholdValue > 100) {
      showErrorToast('Threshold must be a whole number between 1 and 100')
      return
    }
    try {
      await dispatch(
        updateThreshold({ channel: editingChannel.channel, warnThresholdPercent: thresholdValue }),
      ).unwrap()
      showSuccessToast(
        `${formatChannel(editingChannel.channel)} alert threshold updated to ${thresholdValue}%`,
      )
      closeEdit()
    } catch (error) {
      showErrorToast(typeof error === 'string' ? error : 'Failed to update threshold')
    }
  }

  const channelColumns: TableColumn<ChannelUsage>[] = [
    {
      key: 'channel',
      label: 'Channel',
      render: (_, row) => <span className="fw-semibold">{formatChannel(row.channel)}</span>,
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
      render: (_, row) => (
        <div className="d-flex align-items-center gap-2">
          <span>{row.warnThresholdPercent}%</span>
          {canEditThreshold && (
            <button type="button" className="btn btn-sm btn-link p-0" onClick={() => openEdit(row)}>
              Edit
            </button>
          )}
        </div>
      ),
    },
  ]

  const historyColumns: TableColumn<UsageHistoryEntry>[] = [
    {
      key: 'channel',
      label: 'Channel',
      render: (_, row) => <span className="fw-semibold">{formatChannel(row.channel)}</span>,
    },
    {
      key: 'fiscalYearStart',
      label: 'Fiscal year',
      render: (_, row) => <span>{fiscalYearLabel(row.fiscalYearStart)}</span>,
    },
    {
      key: 'sentCount',
      label: 'Notifications sent',
      render: (_, row) => <span>{row.sentCount.toLocaleString()}</span>,
    },
  ]

  const channels = usage?.channels ?? []

  return (
    <div>
      <PageHeading title="Notification Usage & Limits" />


        <DataTable
          columns={channelColumns}
          data={channels}
          keyExtractor={(row) => row.channel}
          isLoading={isLoading}
          emptyMessage="No notification limits are configured for this tenant."
          label="Notification usage and limits"
        />
        {!canEditThreshold && channels.length > 0 && (
          <p className="text-muted small mt-2 mb-0">
            Only users with the NOTIFY_OPERATIONS_ADMIN role can change alert thresholds.
          </p>
        )}
      <Modal
        isOpen={editingChannel !== null}
        isDismissable={!isSaving}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        {editingChannel && (
          <AlertDialog
            isIconHidden
            isCloseable
            title={`Edit ${formatChannel(editingChannel.channel)} alert threshold`}
            buttons={
              <>
                <Button variant="tertiary" onPress={closeEdit} isDisabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={handleSaveThreshold} isDisabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </>
            }
          >
            <p className="text-muted mb-3">
              Warn when usage reaches this percentage of a limit. The 100% (limit reached) alert
              always fires.
            </p>
            <div>
              <label className="form-label" htmlFor="edit-threshold">
                Warning threshold (%)
              </label>
              <input
                id="edit-threshold"
                type="number"
                min={1}
                max={100}
                className="form-control"
                value={thresholdValue}
                disabled={isSaving}
                onChange={(e) => setThresholdValue(Number(e.target.value))}
              />
            </div>
          </AlertDialog>
        )}
      </Modal>
    </div>
  )
}

export default Usage
