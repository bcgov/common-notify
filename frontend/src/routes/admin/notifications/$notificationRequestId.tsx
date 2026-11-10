import { createFileRoute } from '@tanstack/react-router'
import AdminNotificationDetail from '@/pages/admin/notifications/AdminNotificationDetail'

export const Route = createFileRoute('/admin/notifications/$notificationRequestId')({
  component: AdminNotificationDetailPage,
})

function AdminNotificationDetailPage() {
  const { notificationRequestId } = Route.useParams()
  return (
    <AdminNotificationDetail
      key={notificationRequestId}
      notificationRequestId={notificationRequestId}
    />
  )
}
