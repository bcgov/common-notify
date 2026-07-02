import { useEffect, useState } from 'react'
import type { FC } from 'react'
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
  const { usage, history, isLoading, historyLoading, updatingChannel } = useAppSelector(
    (state) => state.apiKeyUsage,
  )
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const cstarRoles = useAppSelector((state) => state.user.current?.cstarRoles)

  const canEditThreshold = Array.isArray(cstarRoles) && cstarRoles.includes(OPERATIONS_ADMIN_ROLE)

  const [editing, setEditing] = useState<{ channel: string; value: string } | null>(null)

  useEffect(() => {
    if (selectedTenant) {
      dispatch(fetchApiKeyUsage())
      dispatch(fetchApiKeyUsageHistory())
    }
  }, [selectedTenant, dispatch])

  async function handleSaveThreshold(channel: string) {
    if (!editing) return
    const value = Number(editing.value)
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      showErrorToast('Threshold must be a whole number between 1 and 100')
      return
    }
    try {
      await dispatch(updateThreshold({ channel, warnThresholdPercent: value })).unwrap()
      showSuccessToast(`${formatChannel(channel)} alert threshold updated to ${value}%`)
      setEditing(null)
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
      render: (_, row) => {
        const isEditing = editing?.channel === row.channel
        const isSaving = updatingChannel === row.channel

        if (isEditing) {
          return (
            <div className="d-flex align-items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                className="form-control form-control-sm"
                style={{ width: '80px' }}
                value={editing.value}
                disabled={isSaving}
                onChange={(e) => setEditing({ channel: row.channel, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveThreshold(row.channel)}
                aria-label={`${formatChannel(row.channel)} alert threshold percent`}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={isSaving}
                onClick={() => handleSaveThreshold(row.channel)}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={isSaving}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          )
        }

        return (
          <div className="d-flex align-items-center gap-2">
            <span>{row.warnThresholdPercent}%</span>
            {canEditThreshold && (
              <button
                type="button"
                className="btn btn-sm btn-link p-0"
                onClick={() =>
                  setEditing({ channel: row.channel, value: String(row.warnThresholdPercent) })
                }
              >
                Edit
              </button>
            )}
          </div>
        )
      },
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

      <Card
        title={'Current usage'}
        subtitle="Usage against your configured notification limits"
        className="mb-4"
      >
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
      </Card>

      <Card title="Usage history" subtitle="Notifications sent per fiscal year">
        <DataTable
          columns={historyColumns}
          data={history}
          keyExtractor={(row) => `${row.channel}-${row.fiscalYearStart}`}
          isLoading={historyLoading}
          emptyMessage="No usage history yet."
          label="Usage history by fiscal year"
        />
      </Card>
    </div>
  )
}

export default Usage
