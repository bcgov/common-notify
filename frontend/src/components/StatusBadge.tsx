import '@/scss/components/status-badge.scss'

/**
 * StatusBadge Component
 * Displays a status badge with a colored dot and label
 * Supports both notification statuses and feature flag enabled/disabled states
 *
 * @param status - The status value: string (e.g., 'completed', 'failed', 'pending') or boolean (for enabled/disabled)
 */
export function StatusBadge({
  status,
  statusLabel,
}: {
  status?: string | boolean
  statusLabel?: string
}) {
  let label = ''
  let dotClassName = ''

  if (typeof status === 'boolean') {
    label = status ? 'Enabled' : 'Disabled'
    dotClassName = status ? 'status-badge__dot--enabled' : 'status-badge__dot--disabled'
  } else if (status) {
    label = statusLabel ? statusLabel : status.charAt(0).toUpperCase() + status.slice(1)
    // Map status strings to dot class names
    switch (status) {
      case 'completed':
      case 'sent':
      case 'delivered':
        dotClassName = 'status-badge__dot--success'
        break
      case 'partially_completed':
        dotClassName = 'status-badge__dot--partial'
        break
      case 'failed':
      case 'quarantined':
      case 'bounced':
        dotClassName = 'status-badge__dot--failed'
        break
      case 'cancelled':
        dotClassName = 'status-badge__dot--cancelled'
        break
      default:
        dotClassName = 'status-badge__dot--pending'
    }
  }

  return (
    <span className="status-badge">
      <span className={`status-badge__dot ${dotClassName}`} />
      {label}
    </span>
  )
}
