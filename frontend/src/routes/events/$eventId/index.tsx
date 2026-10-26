import { createFileRoute } from '@tanstack/react-router'
import EditEvent from '@/pages/events/EditEvent'
import type { EventTab } from '@/pages/events/components/EventTabs'

const EVENT_TABS: string[] = ['settings', 'email', 'sms', 'third-party']

export const Route = createFileRoute('/events/$eventId/')({
  component: EditEventPage,
  // `tab` lets another page hand off to a specific tab, e.g. "Edit settings" on the email
  // saved page; anything else falls back to the page's own default tab. `edit` opens an active
  // email channel on its form rather than handing off to the saved page.
  validateSearch: (search: Record<string, unknown>): { tab?: EventTab; edit?: boolean } => ({
    ...(typeof search.tab === 'string' && EVENT_TABS.includes(search.tab)
      ? { tab: search.tab as EventTab }
      : {}),
    ...(search.edit === true ? { edit: true } : {}),
  }),
})

function EditEventPage() {
  const params = Route.useParams()
  const { tab, edit } = Route.useSearch()
  return (
    <EditEvent key={params.eventId} eventId={params.eventId} initialTab={tab} editEmail={edit} />
  )
}
