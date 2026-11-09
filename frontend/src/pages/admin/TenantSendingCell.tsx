import type { FC } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import type { AdminTenantUsageRow } from '@/api/apiKeyUsage.api'
import { formatShortDate } from '@/utils/usage'
import '@/scss/components/tenant-sending-cell.scss'

type TenantSendingCellProps = Pick<
  AdminTenantUsageRow,
  'sendingEnabled' | 'disabledReason' | 'disabledAt' | 'disabledBy'
>

/** Whether a tenant can send, and when an admin has disabled it, why, who and when. */
const TenantSendingCell: FC<TenantSendingCellProps> = ({
  sendingEnabled,
  disabledReason,
  disabledAt,
  disabledBy,
}) => {
  if (sendingEnabled) return <StatusBadge status />

  return (
    <div className="tenant-sending-cell">
      <StatusBadge status="failed" statusLabel="Disabled" />
      {disabledReason && <p className="tenant-sending-cell__reason">{disabledReason}</p>}
      {disabledBy && <span className="tenant-sending-cell__detail">By {disabledBy}</span>}
      {disabledAt && (
        <span className="tenant-sending-cell__detail">
          On <time dateTime={disabledAt}>{formatShortDate(disabledAt)}</time>
        </span>
      )}
    </div>
  )
}

export default TenantSendingCell
