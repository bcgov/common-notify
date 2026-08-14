import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { ChannelUsage } from '@/api/apiKeyUsage.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  updateThreshold,
} from '@/redux/thunks/apiKeyUsage.thunks'
import PageHeading from '@/components/PageHeading'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import UsageCell from '@/components/UsageCell'
import EditModal from '@/components/EditModal'
import NumberInputField from '@/components/NumberInputField'
import { showSuccessToast, showErrorToast } from '@/redux/utils/toastUtils'
import { formatChannel } from '@/utils/usage'

const OPERATIONS_ADMIN_ROLE = 'NOTIFY_OPERATIONS_ADMIN'

const Usage: FC = () => {
  const dispatch = useAppDispatch()
  const { usage, isLoading, updatingChannel } = useAppSelector((state) => state.apiKeyUsage)
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
      {channels.some((channel) => channel.channel.toUpperCase() === 'SMS') && (
        <p className="text-muted small mt-2 mb-0">
          SMS usage is counted in message segments. An SMS longer than one segment (160 characters,
          or 70 if it contains emoji or other non-standard characters) is sent and billed as several
          messages, and counts that many times against these limits.
        </p>
      )}
      {!canEditThreshold && channels.length > 0 && (
        <p className="text-muted small mt-2 mb-0">
          Only users with the NOTIFY_OPERATIONS_ADMIN role can change alert thresholds.
        </p>
      )}
      <EditModal
        isOpen={editingChannel !== null}
        title={
          editingChannel ? `Edit ${formatChannel(editingChannel.channel)} alert threshold` : ''
        }
        isSaving={isSaving}
        onClose={closeEdit}
        onSave={handleSaveThreshold}
      >
        <p className="text-muted mb-3">
          Warn when usage reaches this percentage of a limit. The 100% (limit reached) alert always
          fires.
        </p>
        <NumberInputField
          id="edit-threshold"
          label="Warning threshold (%)"
          value={thresholdValue}
          min={1}
          max={100}
          disabled={isSaving}
          onChange={setThresholdValue}
        />
      </EditModal>
    </div>
  )
}

export default Usage
