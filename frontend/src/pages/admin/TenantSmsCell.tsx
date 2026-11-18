import type { FC } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import type { AdminTenantUsageRow } from '@/api/usage.api'
import '@/scss/components/tenant-sms-cell.scss'

type TenantSmsCellProps = Pick<AdminTenantUsageRow, 'smsEnabled' | 'smsFromNumber'>

/**
 * Whether a tenant may send SMS, and the number it sends from. A number is shown even with SMS
 * off, so an assignment made ahead of enabling the flag is visible.
 */
const TenantSmsCell: FC<TenantSmsCellProps> = ({ smsEnabled, smsFromNumber }) => (
  <div className="tenant-sms-cell">
    <StatusBadge status={smsEnabled} />
    {smsFromNumber ? (
      <span className="tenant-sms-cell__number">{smsFromNumber}</span>
    ) : (
      <span className="tenant-sms-cell__default">Default number</span>
    )}
  </div>
)

export default TenantSmsCell
