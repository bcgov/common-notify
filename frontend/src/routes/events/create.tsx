import { createFileRoute } from '@tanstack/react-router'
import CreateEvent from '@/pages/events/CreateEvent'

export const Route = createFileRoute('/events/create')({
  component: CreateEventPage,
})

function CreateEventPage() {
  return <CreateEvent />
}
