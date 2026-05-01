import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import '@/scss/components/tenant-error.scss'

type Props = {
  error: string
  onRetry: () => void
}

const TenantError: FC<Props> = ({ error, onRetry }) => {
  return (
    <div className="tenant-error-container">
      <div className="tenant-error-card">
        <div className="error-icon">
          <i className="bi bi-exclamation-triangle-fill" />
        </div>
        <h2>Failed to Load Tenants</h2>
        <p className="error-message">{error}</p>
        <div className="error-actions">
          <Button onClick={onRetry} className="retry-button">
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TenantError
