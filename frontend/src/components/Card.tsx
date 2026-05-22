import type { FC, ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  children: ReactNode
  className?: string
}

/**
 * Card Component
 *
 * Reusable card container with consistent styling.
 * Used for grouping related content with a light background and rounded corners.
 *
 * @param title - Optional main heading
 * @param subtitle - Optional subheading
 * @param children - Card content
 * @param className - Optional additional CSS classes
 */
const Card: FC<CardProps> = ({ title, subtitle, children, className = '' }) => {
  return (
    <div className={`bg-light rounded p-4 ${className}`}>
      {title && <h5 className={`fw-bold mb-${subtitle ? 2 : 3}`}>{title}</h5>}
      {subtitle && <h6 className="text-muted mb-3">{subtitle}</h6>}
      {children}
    </div>
  )
}

export default Card
