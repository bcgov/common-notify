import type { ReactNode } from 'react'
import { ProgressCircle } from '@bcgov/design-system-react-components'
import type { TenantFeatureAccess } from '@/hooks/useTenantFeatureAccess'
import NotFound from './NotFound'

export default function FeatureAccessGate({
  isResolved,
  canAccess,
  children,
}: TenantFeatureAccess & { children: ReactNode }) {
  // Wait for this tenant's roles and flags before deciding whether the page exists.
  if (!isResolved) {
    return (
      <div className="page-loading">
        <ProgressCircle isIndeterminate valueLabel="Loading..." />
      </div>
    )
  }

  if (!canAccess) {
    return <NotFound />
  }

  return children
}
