import { createFileRoute } from '@tanstack/react-router'
import NotificationEvents from '@/pages/notification-events/NotificationEvents'

export const Route = createFileRoute('/notification-events')({
  component: NotificationEventsPage,
})

function NotificationEventsPage() {
  return <NotificationEvents />
}
