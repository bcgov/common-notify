import type { FC } from 'react'
import { percentOf } from '@/utils/usage'

interface UsageCellProps {
  used: number
  limit: number
  thresholdPercent: number
}

/**
 * Render "used / limit (pct%)" for a usage/limit pair, highlighting in red when usage
 * has reached or exceeded the warning threshold. Shared by the tenant and admin usage screens.
 */
const UsageCell: FC<UsageCellProps> = ({ used, limit, thresholdPercent }) => {
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
