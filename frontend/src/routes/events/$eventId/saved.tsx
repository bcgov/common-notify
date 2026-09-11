import { createFileRoute } from '@tanstack/react-router'
import EventsEmailSaved from '@/pages/events/sections/EventsEmailSaved'

export const Route = createFileRoute('/events/$eventId/saved')({
  component: EventsEmailSavedPage,
})

function EventsEmailSavedPage() {
  const params = Route.useParams()
  return <EventsEmailSaved key={params.eventId} eventId={params.eventId} />
}
