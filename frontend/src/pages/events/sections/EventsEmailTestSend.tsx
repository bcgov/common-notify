import type { FC, ReactNode } from 'react'
import PageHeading from '@/components/PageHeading'
import EventsEmailTestSendForm from './EventsEmailTestSendForm'
import { useEvent } from '../hooks/useEvent'
import '@/scss/components/events.scss'

interface EventsEmailTestSendProps {
  eventId: string
}

/**
 * Sends a test of the event's email notification, so its content and formatting can be checked
 * before the event is used for real.
 */
const EventsEmailTestSend: FC<EventsEmailTestSendProps> = ({ eventId }) => {
  const { event, loadError } = useEvent(eventId)

  let content: ReactNode
  if (loadError) {
    content = <div className="alert alert-danger">{loadError}</div>
  } else if (!event) {
    content = <p className="events__help">Loading event...</p>
  } else if (event.emailSettings) {
    content = <EventsEmailTestSendForm eventId={eventId} emailSettings={event.emailSettings} />
  } else {
    content = (
      <p className="events__help">This event has no saved email notification settings yet.</p>
    )
  }

  return (
    <div className="page events">
      <PageHeading
        title="Test Notification"
        breadcrumbs={[
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
          { label: 'Test Notification' },
        ]}
      />

      <section className="events__section events__test-send">{content}</section>
    </div>
  )
}

export default EventsEmailTestSend
