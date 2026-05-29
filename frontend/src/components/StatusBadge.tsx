import '@/scss/components/status-badge.scss'

/**
 * StatusBadge Component
 * Displays a status badge with a colored dot and label
 * Supports both notification statuses and feature flag enabled/disabled states
 *
 * @param status - The status value: string (e.g., 'completed', 'failed', 'pending') or boolean (for enabled/disabled)
 */
export function StatusBadge({ status }: { status?: string | boolean }) {
  let label = ''
  let dotClassName = ''

  if (typeof status === 'boolean') {
    label = status ? 'Enabled' : 'Disabled'
    dotClassName = status ? 'status-badge__dot--enabled' : 'status-badge__dot--disabled'
  } else if (status) {
    label = status.charAt(0).toUpperCase() + status.slice(1)
    // Map status strings to dot class names
    switch (status) {
      case 'completed':
        dotClassName = 'status-badge__dot--completed'
        break
      case 'failed':
        dotClassName = 'status-badge__dot--failed'
        break
      case 'pending':
        dotClassName = 'status-badge__dot--pending'
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
