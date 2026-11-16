import type { FC } from 'react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import Alert from '@/components/Alert'
import '@/scss/components/health-banner.scss'

export interface HealthWarningPage {
  label: string
  to: NonNullable<LinkProps['to']>
}

export interface HealthWarning {
  message: string
  /** Where the details are. Leave it off when the reader is already there. */
  page?: HealthWarningPage
}

interface HealthBannerProps {
  warnings: HealthWarning[]
}

/**
 * Every current warning, whichever page its details are on, so a problem is never hidden on a
 * page the reader isn't looking at. Renders nothing when there are none.
 */
const HealthBanner: FC<HealthBannerProps> = ({ warnings }) => {
  if (warnings.length === 0) return null

  const pages = [
    ...new Map(
      warnings.flatMap((warning) => (warning.page ? [[warning.page.to, warning.page]] : [])),
    ).values(),
  ]

  return (
    // Polite: the page already announces a change in overall health once; a reworded reason
    // on the next refresh shouldn't interrupt.
    <Alert variant="warning" role="status">
      <p className="health-banner__title">
        {warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`}
      </p>
      <ul className="health-banner__list">
        {warnings.map((warning) => (
          <li key={warning.message}>{warning.message}</li>
        ))}
      </ul>
      {pages.length > 0 && (
        <p className="health-banner__links">
          {pages.map((page) => (
            <Link key={page.to} to={page.to}>
              View {page.label}
            </Link>
          ))}
        </p>
      )}
    </Alert>
  )
}

export default HealthBanner
