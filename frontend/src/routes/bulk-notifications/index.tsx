import { createFileRoute } from '@tanstack/react-router'
import BulkNotifications from '@/pages/bulk-notifications/BulkNotifications'

export const Route = createFileRoute('/bulk-notifications/')({
  component: BulkNotificationsPage,
})

function BulkNotificationsPage() {
  return <BulkNotifications />
}
