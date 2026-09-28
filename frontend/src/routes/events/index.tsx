import { createFileRoute } from '@tanstack/react-router'
import Events from '@/pages/events/Events'

export const Route = createFileRoute('/events/')({
  component: EventsPage,
})

function EventsPage() {
  return <Events />
}
