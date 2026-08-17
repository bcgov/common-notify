import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import Breadcrumb from '@/components/Breadcrumb'
import EventsTab from './sections/EventsTab'
import type { EventSettingsValues } from './sections/EventsTab'
import EventsEmailTab from './sections/EventsEmailTab'
import type { EmailSettingsValues } from './sections/EventsEmailTab'
import EventsSmsTab from './sections/EventsSmsTab'
import { getEventById, updateEvent, updateEventEmailSettings } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchSettings } from '@/redux/thunks/settings.thunks'
import '@/scss/components/events.scss'

type EventTab = 'settings' | 'email' | 'sms' | 'third-party'

interface EditEventProps {
  eventId: string
}

const EditEvent: FC<EditEventProps> = ({ eventId }) => {
  const { canEdit } = useCstarRoles()
  const dispatch = useAppDispatch()
  const defaultSenderEmail = useAppSelector((state) => state.tenantSettings.defaultSenderEmail)
  const [selectedTab, setSelectedTab] = useState<EventTab>('settings')
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Placeholder only, for the email tab's sender field. Failures are not surfaced here since
  // the page's own load state doesn't depend on it.
  useEffect(() => {
    dispatch(fetchSettings())
  }, [dispatch])

  // The page owns the single event fetch, so the title, breadcrumb and every tab read
  // from one request and switching tabs re-fetches nothing.
  useEffect(() => {
    let active = true
    setEvent(null)
    setLoadError(null)

    getEventById(eventId)
      .then((loaded) => {
        if (active) setEvent(loaded)
      })
      .catch((error) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load event')
        }
      })

    return () => {
      active = false
    }
  }, [eventId])

  async function handleSave(values: EventSettingsValues) {
    try {
      const updated = await updateEvent(eventId, values)
      // Re-sync to exactly what was persisted; this also moves the tab's change baseline.
      setEvent(updated)
      showSuccessToast('Event updated successfully')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to update event')
    }
  }

  async function handleSaveEmailSettings(values: EmailSettingsValues) {
    try {
      const updated = await updateEventEmailSettings(eventId, {
        active: values.active,
        senderEmail: values.senderEmail || null,
      })
      setEvent(updated)
      showSuccessToast('Email settings saved')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to save email settings')
    }
  }

  return (
    <div className="events">
      <Breadcrumb
        items={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
        ]}
      />

      <h1 className="events__title">{event?.name ?? 'Event'}</h1>

      <div className="events__tabs">
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={[selectedTab]}
          onSelectionChange={(keys) => {
            const [key] = [...keys]
            if (key) {
              setSelectedTab(key as EventTab)
            }
          }}
          disallowEmptySelection
        >
          <ToggleButton id="settings">Event Settings</ToggleButton>
          <ToggleButton id="email">Email Notification</ToggleButton>
          <ToggleButton id="sms">SMS Notification</ToggleButton>
          <ToggleButton id="third-party">Third-party Notification</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <section className="events__section">
        {loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !event ? (
          <p className="events__help">Loading event...</p>
        ) : selectedTab === 'settings' ? (
          <EventsTab
            values={{ name: event.name, description: event.description }}
            onSave={handleSave}
            isDisabled={!canEdit}
          />
        ) : selectedTab === 'email' ? (
          // The email channel starts disabled until the tab has been saved with it switched on.
          <EventsEmailTab
            values={{
              active: event.emailSettings?.active ?? false,
              senderEmail: event.emailSettings?.senderEmail ?? '',
            }}
            onSave={handleSaveEmailSettings}
            isDisabled={!canEdit}
            defaultSenderEmail={defaultSenderEmail}
          />
        ) : selectedTab === 'sms' ? (
          <EventsSmsTab />
        ) : (
          <p className="events__help">Not yet implemented</p>
        )}
      </section>
    </div>
  )
}

export default EditEvent
