import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import PageHeading from '@/components/PageHeading'
import EventTabs from './components/EventTabs'
import EventsTab from './sections/EventsTab'
import type { EventSettingsValues } from './sections/EventsTab'
import { createEvent } from '@/api/events.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import '@/scss/components/events.scss'

const EMPTY_EVENT: EventSettingsValues = {
  name: '',
  description: '',
}

const CreateEvent: FC = () => {
  const navigate = useNavigate()
  const { canEdit } = useCstarRoles()

  // Navigate to the edit page on save
  async function handleSave(values: EventSettingsValues) {
    try {
      const event = await createEvent(values)
      showSuccessToast('Event created successfully')
      // The create page has no id of its own; hand off to the edit page for the new event
      // so the notification tabs can be configured.
      navigate({ to: '/events/$eventId', params: { eventId: event.id } })
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to create event')
    }
  }

  return (
    <div className="page events">
      <PageHeading
        title="Create New Event"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Event', to: '/events' },
          { label: 'Create New Event' },
        ]}
      />

      {/* The notification tabs need an event to attach to, so they stay disabled until the
          event exists and the edit page takes over. */}
      <EventTabs selected="settings" disabledTabs={['email', 'sms', 'third-party']} />

      <section className="events__section">
        <EventsTab values={EMPTY_EVENT} onSave={handleSave} isDisabled={!canEdit} />
      </section>
    </div>
  )
}

export default CreateEvent
