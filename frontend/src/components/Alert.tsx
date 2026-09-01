import type { FC, ReactNode } from 'react'

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

interface AlertProps {
  /** Visual severity. Maps to the Bootstrap alert variants used across the app. */
  variant?: AlertVariant
  children: ReactNode
  className?: string
  /**
   * ARIA live role. Defaults to `alert` for danger (interrupts the user) and `status` for
   * everything else (announced politely). Pass explicitly to override.
   */
  role?: 'status' | 'alert'
}

/**
 * Inline message banner.
 *
 * Replaces hand-rolled `<div className="alert alert-*">` markup so severity styling and the
 * matching ARIA role stay consistent wherever a page reports an error or a piece of context.
 */
export const Alert: FC<AlertProps> = ({ variant = 'info', children, className = '', role }) => (
  <div
    className={`alert alert-${variant}${className ? ` ${className}` : ''}`}
    role={role ?? (variant === 'danger' ? 'alert' : 'status')}
  >
    {children}
  </div>
)

export default Alert
