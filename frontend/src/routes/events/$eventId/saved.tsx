import { createFileRoute } from '@tanstack/react-router'
import EventsSettingsSaved from '@/pages/events/sections/EventsSettingsSaved'
import type { SavedChannel } from '@/pages/events/sections/EventsSettingsSaved'

export const Route = createFileRoute('/events/$eventId/saved')({
  component: EventsSettingsSavedPage,
  // `channel` is the tab the save came from; anything else falls back to email.
  validateSearch: (search: Record<string, unknown>): { channel?: SavedChannel } =>
    search.channel === 'sms' ? { channel: 'sms' } : {},
})

function EventsSettingsSavedPage() {
  const params = Route.useParams()
  const { channel = 'email' } = Route.useSearch()
  return <EventsSettingsSaved key={params.eventId} eventId={params.eventId} channel={channel} />
}
