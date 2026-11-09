import type { FC } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
import '@/scss/components/tenant-name-cell.scss'

type TenantNameCellProps = Pick<
  AdminTenantUsageRow,
  'tenantName' | 'sendingEnabled' | 'disabledReason' | 'disabledAt' | 'disabledBy'
>

/** A tenant's name, and when an admin has disabled its sending, why, who and when. */
const TenantNameCell: FC<TenantNameCellProps> = ({
  tenantName,
  sendingEnabled,
  disabledReason,
  disabledAt,
  disabledBy,
}) => {
  const disabledOn = disabledAt
    ? new Date(disabledAt).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null
  const byline = [disabledBy, disabledOn].filter(Boolean).join(', ')

  return (
    <div className="tenant-name-cell">
      <span className="fw-semibold">{tenantName}</span>
      {!sendingEnabled && (
        <>
          <StatusBadge status="failed" statusLabel="Sending disabled" />
          <span className="tenant-name-cell__detail">
            {disabledReason}
            {byline && ` (${byline})`}
          </span>
        </>
      )}
    </div>
  )
}

export default TenantNameCell
