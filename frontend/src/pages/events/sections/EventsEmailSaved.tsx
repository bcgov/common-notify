import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Callout } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import StickyBar from '@/components/StickyBar'
import EventTabs from '../components/EventTabs'
import type { EventTab } from '../components/EventTabs'
import EventEmailPreview from '../components/EventEmailPreview'
import { getEventById } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { getTemplateById } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppSelector } from '@/redux/hooks'
import '@/scss/components/events.scss'

interface EventsEmailSavedProps {
  eventId: string
}

/**
 * Confirmation the email tab hands off to once its settings are saved: the notification as it
 * will be sent, and the way on to a test send.
 */
const EventsEmailSaved: FC<EventsEmailSavedProps> = ({ eventId }) => {
  const navigate = useNavigate()
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // The page is landed on directly after a save and on a refresh, so it fetches the event
  // itself rather than being handed the settings it shows. Tenant-scoped, the same way the
  // edit page is.
  useEffect(() => {
    if (!selectedTenantId) return

    let active = true

    getEventById(eventId)
      .then((loaded) => {
        if (active) {
          setEvent(loaded)
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (active) {
          setEvent(null)
          setLoadError(error instanceof Error ? error.message : 'Failed to load event')
        }
      })

    return () => {
      active = false
    }
  }, [eventId, selectedTenantId])

  const emailSettings = event?.emailSettings ?? null
  const templateId = emailSettings?.templateId ?? null

  // The template only supplies the preview below, so a failure leaves the preview empty
  // rather than putting the whole page into an error state.
  useEffect(() => {
    if (!templateId) return
    let active = true

    getTemplateById(templateId)
      .then((loaded) => {
        if (active) setTemplate(loaded)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [templateId])

  function openTab(tab: EventTab) {
    navigate({ to: '/events/$eventId', params: { eventId }, search: { tab } })
  }

  return (
    <div className="page events">
      <PageHeading
        title={event?.name ?? 'Event'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
          { label: 'Saved' },
        ]}
      />

      {/* This page only covers the email channel; the other tabs go back to the event itself. */}
      <EventTabs selected="email" onSelect={openTab} />

      <section className="events__section">
        {loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !event ? (
          <p className="events__help">Loading event...</p>
        ) : !emailSettings ? (
          <p className="events__help">This event has no saved email notification settings yet.</p>
        ) : (
          <>
            <Callout
              variant="lightGrey"
              title="Ready to send?"
              description="Your email settings are ready. Continue to select recipients and send a test notification to verify the content and formatting."
            />

            {template && <EventEmailPreview emailSettings={emailSettings} template={template} />}

            <StickyBar>
              <Button variant="secondary" type="button" onPress={() => openTab('email')}>
                Edit settings
              </Button>
              <Button
                variant="primary"
                type="button"
                onPress={() =>
                  navigate({ to: '/events/$eventId/email-test-send', params: { eventId } })
                }
              >
                Continue to test notification
              </Button>
            </StickyBar>
          </>
        )}
      </section>
    </div>
  )
}

export default EventsEmailSaved
