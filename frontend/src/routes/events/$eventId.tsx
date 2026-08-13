import { createFileRoute } from '@tanstack/react-router'
import EditEvent from '@/pages/events/EditEvent'

export const Route = createFileRoute('/events/$eventId')({
  component: EditEventPage,
})

function EditEventPage() {
  const params = Route.useParams()
  return <EditEvent eventId={params.eventId} />
}
