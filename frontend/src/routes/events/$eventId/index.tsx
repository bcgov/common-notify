import { createFileRoute } from '@tanstack/react-router'
import EditEvent from '@/pages/events/EditEvent'
import type { EventsTabId } from '@/pages/events/components/EventsTabBar'

const EVENT_TABS = new Set<string>(['settings', 'email', 'sms', 'third-party'])

export const Route = createFileRoute('/events/$eventId/')({
  component: EditEventPage,
  // `tab` lets another page hand off to a specific tab, e.g. "Edit settings" on the saved page;
  // anything else falls back to the page's own default tab. `edit` opens an active channel on
  // its form rather than handing off to the saved page.
  validateSearch: (search: Record<string, unknown>): { tab?: EventsTabId; edit?: boolean } => ({
    ...(typeof search.tab === 'string' && EVENT_TABS.has(search.tab)
      ? { tab: search.tab as EventsTabId }
      : {}),
    ...(search.edit === true ? { edit: true } : {}),
  }),
})

function EditEventPage() {
  const params = Route.useParams()
  const { tab, edit } = Route.useSearch()
  return (
    <EditEvent key={params.eventId} eventId={params.eventId} initialTab={tab} editChannel={edit} />
  )
}
