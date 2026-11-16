import type { FC } from 'react'
import { StatusBadge } from '@/components/StatusBadge'

/** How each request status reads, as one of StatusBadge's colours and a label. */
const BADGES: Record<string, { status: string; label: string }> = {
  pending: { status: 'pending', label: 'Pending' },
  approved: { status: 'completed', label: 'Approved' },
  rejected: { status: 'failed', label: 'Rejected' },
  released: { status: 'cancelled', label: 'Released' },
  cancelled: { status: 'cancelled', label: 'Cancelled' },
}

/** The status of an SMS number request. A status added later shows with a neutral colour. */
const SmsRequestStatusBadge: FC<{ status: string }> = ({ status }) => {
  const badge = BADGES[status]
  return badge ? (
    <StatusBadge status={badge.status} statusLabel={badge.label} />
  ) : (
    <StatusBadge status={status} />
  )
}

export default SmsRequestStatusBadge
