import { useEffect, useState } from 'react'
import type { FC } from 'react'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
import { useAppSelector, useAppDispatch } from '@/redux/hooks'
import { fetchAllTenantsUsage } from '@/redux/thunks/apiKeyUsage.thunks'
import UserService from '@/service/user-service'
import PageHeading from '@/components/PageHeading'
import Card from '@/components/Card'
import DataTable from '@/components/DataTable/DataTable'
import type { TableColumn } from '@/components/DataTable/DataTable'
import NotAuthorized from '@/components/NotAuthorized'

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
    key: 'rateLimitPerMinute',
    label: 'Per minute',
    render: (_, row) => (
      <UsageCell
        used={row.usedThisMinute}
        limit={row.rateLimitPerMinute}
        thresholdPercent={row.warnThresholdPercent}
      />
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
    render: (_, row) => <span>{row.warnThresholdPercent}%</span>,
  },
]

const AdminUsage: FC = () => {
  const dispatch = useAppDispatch()
  const { adminRows, adminLoading } = useAppSelector((state) => state.apiKeyUsage)
  const isAdmin = UserService.hasRole('NOTIFY_ADMIN')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isAdmin) {
      dispatch(fetchAllTenantsUsage())
    }
  }, [isAdmin, dispatch])

  if (!isAdmin) {
    return <NotAuthorized />
  }

  const query = search.trim().toLowerCase()
  const rows = query
    ? adminRows.filter((row) => row.tenantName.toLowerCase().includes(query))
    : adminRows

  return (
    <div>
      <PageHeading title="Tenant Usage & Limits" />

      <Card
        title="All tenants"
        subtitle="Notification usage against configured limits, per tenant and channel"
      >
        <div className="row mb-3 g-2 align-items-center">
          <div className="col-auto">
            <input
              type="search"
              className="form-control"
              style={{ width: '300px' }}
              placeholder="Filter by tenant name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter by tenant name"
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={(row) => `${row.tenantId}-${row.channel}`}
          isLoading={adminLoading}
          emptyMessage="No tenant usage data found."
          label="All tenants notification usage"
        />
      </Card>
    </div>
  )
}

export default AdminUsage
