import type { FC } from 'react'
import { percentOf } from '@/utils/usage'

interface UsageCellProps {
  used: number
  /** Null when no limit is configured: usage is shown against "Not set". */
  limit: number | null
  thresholdPercent: number | null
}

/**
 * Render "used / limit (pct%)" for a usage/limit pair, highlighting in red when usage
 * has reached or exceeded the warning threshold. Shared by the tenant and admin usage screens.
 */
const UsageCell: FC<UsageCellProps> = ({ used, limit, thresholdPercent }) => {
  if (limit === null || thresholdPercent === null) {
    return (
      <span>
        {used.toLocaleString()} / <span className="text-muted">Not set</span>
      </span>
    )
  }
  const pct = percentOf(used, limit)
  const warn = pct >= thresholdPercent
  return (
    <span className={warn ? 'text-danger fw-semibold' : ''}>
      {used.toLocaleString()} / {limit.toLocaleString()}{' '}
      <span className="text-muted">({pct}%)</span>
    </span>
  )
}

export default UsageCell
