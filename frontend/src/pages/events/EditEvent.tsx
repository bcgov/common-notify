import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { ToggleButton, ToggleButtonGroup } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import EventsTab from './sections/EventsTab'
import type { EventSettingsValues } from './sections/EventsTab'
import EventsEmailTab from './sections/EventsEmailTab'
import type { EmailApplyValues } from './sections/EventsEmailTab'
import EventsSmsTab from './sections/EventsSmsTab'
import type { SmsApplyValues } from './sections/EventsSmsTab'
import {
  getEventById,
  updateEvent,
  updateEventEmailSettings,
  deactivateEventEmailChannel,
  updateEventSmsSettings,
  deactivateEventSmsChannel,
} from '@/api/events.api'
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
  // from one request and switching tabs re-fetches nothing. The route keys this component by
  // eventId, so a fresh mount (and fresh useState(null)) is what resets event/loadError between
  // events - this effect only needs to fetch.
  useEffect(() => {
    let active = true

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

  // Errors and success messages are surfaced by the channel tabs themselves, so these just
  // persist and re-sync state - failures propagate up to the tab's own try/catch.
  async function handleSaveEmailSettings(values: EmailApplyValues) {
    const updated = await updateEventEmailSettings(eventId, {
      active: values.active,
      senderEmail: values.senderEmail || null,
      templateId: values.templateId,
      to: values.to,
      cc: values.cc,
      bcc: values.bcc,
    })
    setEvent(updated)
  }

  async function handleDeactivateEmail() {
    const updated = await deactivateEventEmailChannel(eventId)
    setEvent(updated)
  }

  async function handleSaveSmsSettings(values: SmsApplyValues) {
    const updated = await updateEventSmsSettings(eventId, {
      active: values.active,
      templateId: values.templateId,
      to: values.to,
    })
    setEvent(updated)
  }

  async function handleDeactivateSms() {
    const updated = await deactivateEventSmsChannel(eventId)
    setEvent(updated)
  }

  return (
    <div className="page events">
      <PageHeading
        title={event?.name ?? 'Event'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
        ]}
      />

      <div className="events__tabs">
        <ToggleButtonGroup
          size="medium"
          orientation="horizontal"
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
          <ToggleButton id="settings" size="medium">
            Event Settings
          </ToggleButton>
          <ToggleButton id="email" size="medium">
            Email Notification
          </ToggleButton>
          <ToggleButton id="sms" size="medium">
            SMS Notification
          </ToggleButton>
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
              templateId: event.emailSettings?.templateId ?? null,
              to: event.emailSettings?.to ?? [],
              cc: event.emailSettings?.cc ?? [],
              bcc: event.emailSettings?.bcc ?? [],
            }}
            onSave={handleSaveEmailSettings}
            onDeactivate={handleDeactivateEmail}
            isDisabled={!canEdit}
            isConfigured={event.emailSettings !== null}
            defaultSenderEmail={defaultSenderEmail}
          />
        ) : selectedTab === 'sms' ? (
          // The SMS channel starts disabled until the tab has been saved with it switched on.
          <EventsSmsTab
            values={{
              active: event.smsSettings?.active ?? false,
              templateId: event.smsSettings?.templateId ?? null,
              to: event.smsSettings?.to ?? [],
            }}
            onSave={handleSaveSmsSettings}
            onDeactivate={handleDeactivateSms}
            isDisabled={!canEdit}
            isConfigured={event.smsSettings !== null}
          />
        ) : (
          <p className="events__help">Not yet implemented</p>
        )}
      </section>
    </div>
  )
}

export default EditEvent
