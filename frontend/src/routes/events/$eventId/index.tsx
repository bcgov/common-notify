import { createFileRoute } from '@tanstack/react-router'
import EditEvent from '@/pages/events/EditEvent'
import type { EventTab } from '@/pages/events/EditEvent'

const EVENT_TABS: string[] = ['settings', 'email', 'sms', 'third-party']

export const Route = createFileRoute('/events/$eventId/')({
  component: EditEventPage,
  // `tab` lets another page hand off to a specific tab, e.g. "Edit settings" on the email
  // saved page; anything else falls back to the page's own default tab.
  validateSearch: (search: Record<string, unknown>): { tab?: EventTab } =>
    typeof search.tab === 'string' && EVENT_TABS.includes(search.tab)
      ? { tab: search.tab as EventTab }
      : {},
})

function EditEventPage() {
  const params = Route.useParams()
  const { tab } = Route.useSearch()
  return <EditEvent key={params.eventId} eventId={params.eventId} initialTab={tab} />
}
