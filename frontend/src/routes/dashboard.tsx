import { createFileRoute } from '@tanstack/react-router'
import { ProgressCircle } from '@bcgov/design-system-react-components'
import Dashboard from '@/pages/dashboard/Dashboard'
import NotFound from '@/components/NotFound'
import { useDashboardAccess } from '@/hooks/useDashboardAccess'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isResolved, canAccess } = useDashboardAccess()

  // Roles and the tenant's flags both land after the first render. Rendering the page
  // before they do is the empty shell this replaced; rendering the 404 before they do
  // flashes it at users who turn out to have access.
  if (!isResolved) {
    return (
      <div className="page-loading">
        <ProgressCircle isIndeterminate valueLabel="Loading..." />
      </div>
    )
  }

  // Same answer the sidebar gives by omitting the link: as far as this user is
  // concerned in this tenant, the screen does not exist.
  if (!canAccess) {
    return <NotFound />
  }

  return <Dashboard />
}
