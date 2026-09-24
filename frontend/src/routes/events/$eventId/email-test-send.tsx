import { createFileRoute } from '@tanstack/react-router'
import EventsEmailTestSend from '@/pages/events/sections/EventsEmailTestSend'

export const Route = createFileRoute('/events/$eventId/email-test-send')({
  component: EventsEmailTestSendPage,
})

function EventsEmailTestSendPage() {
  const params = Route.useParams()
  return <EventsEmailTestSend key={params.eventId} eventId={params.eventId} />
}
