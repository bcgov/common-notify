import { createFileRoute } from '@tanstack/react-router'
import BulkNotifications from '@/pages/bulk-notifications/BulkNotifications'
import LoadingSpinner from '@/components/LoadingSpinner'
import NotFound from '@/components/NotFound'
import { useBulkNotificationsAccess } from '@/hooks/useBulkNotificationsAccess'

export const Route = createFileRoute('/bulk-notifications/')({
  component: BulkNotificationsPage,
})

function BulkNotificationsPage() {
  const { isResolved, canAccess } = useBulkNotificationsAccess()

  // Roles and the tenant's flags both land after the first render. Rendering the page
  // before they do is the empty shell this replaced; rendering the 404 before they do
  // flashes it at users who turn out to have access.
  if (!isResolved) {
    return <LoadingSpinner isVisible />
  }

  // Same answer the sidebar gives by omitting the link: as far as this user is
  // concerned in this tenant, the screen does not exist.
  if (!canAccess) {
    return <NotFound />
  }

  return <BulkNotifications />
}
