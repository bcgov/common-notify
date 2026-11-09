import type { FC } from 'react'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'

interface UsageRowActionsProps {
  row: AdminTenantUsageRow
  /** Sending is per tenant, so its toggle is shown once, on the tenant's first row. */
  showSendingToggle: boolean
  onEditLimits: (row: AdminTenantUsageRow, limits: { daily: number; annual: number }) => void
  onToggleSending: (row: AdminTenantUsageRow) => void
}

/** The actions for one tenant-and-channel row of the admin usage table. */
const UsageRowActions: FC<UsageRowActionsProps> = ({
  row,
  showSendingToggle,
  onEditLimits,
  onToggleSending,
}) => {
  const { dailyLimit: daily, annualLimit: annual } = row
  return (
    <div className="d-flex flex-column align-items-start gap-1">
      {/* Limits are created when an API key is bound, so there is nothing to edit until then. */}
      {daily === null || annual === null ? (
        <span className="text-muted">No limits to edit</span>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-link p-0"
          onClick={() => onEditLimits(row, { daily, annual })}
        >
          Edit limits
        </button>
      )}
      {showSendingToggle && (
        <button
          type="button"
          className="btn btn-sm btn-link p-0"
          aria-label={`${row.sendingEnabled ? 'Disable' : 'Enable'} sending for ${row.tenantName}`}
          onClick={() => onToggleSending(row)}
        >
          {row.sendingEnabled ? 'Disable sending' : 'Enable sending'}
        </button>
      )}
    </div>
  )
}

export default UsageRowActions
