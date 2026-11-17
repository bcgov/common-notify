import { createFileRoute } from '@tanstack/react-router'
import BulkNotifications from '@/pages/bulk-notifications/BulkNotifications'
import FeatureAccessGate from '@/components/FeatureAccessGate'
import { useBulkNotificationsAccess } from '@/hooks/useBulkNotificationsAccess'

export const Route = createFileRoute('/bulk-notifications/')({
  component: BulkNotificationsPage,
})

function BulkNotificationsPage() {
  const access = useBulkNotificationsAccess()

  return (
    <FeatureAccessGate {...access}>
      <BulkNotifications />
    </FeatureAccessGate>
  )
}
