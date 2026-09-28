import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import '@/scss/components/tenant-error.scss'

type Props = {
  title?: string
  error: string
  onRetry: () => void
}

const TenantError: FC<Props> = ({ title = 'Failed to Load Tenants', error, onRetry }) => {
  return (
    <div className="tenant-error-container">
      <div className="tenant-error-card">
        <div className="error-icon">
          <i className="bi bi-exclamation-triangle-fill" />
        </div>
        <h2>{title}</h2>
        <p className="error-message">{error}</p>
        <div className="error-actions">
          <Button onClick={onRetry} variant="primary">
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TenantError
