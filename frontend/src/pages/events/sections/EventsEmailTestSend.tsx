import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Callout, Radio, RadioGroup } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import StickyBar from '@/components/StickyBar'
import EventEmailPreview from '../components/EventEmailPreview'
import { getEventById } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { getTemplateById } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppSelector } from '@/redux/hooks'
import '@/scss/components/events.scss'

interface EventsEmailTestSendProps {
  eventId: string
}

/** Sending to anyone but the signed-in user is not supported yet - see the radio group below. */
type Recipient = 'myself' | 'other'

/**
 * Sends a test of the event's email notification, so its content and formatting can be checked
 * before the event is used for real.
 */
const EventsEmailTestSend: FC<EventsEmailTestSendProps> = ({ eventId }) => {
  const navigate = useNavigate()
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  // Populated from the Keycloak token at startup, so this is the signed-in user's own address.
  const userEmail = useAppSelector((state) => state.auth.user?.email)
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Nothing is selected to begin with, so the review below only appears once a choice is made.
  const [recipient, setRecipient] = useState<Recipient | null>(null)

  // The page is landed on from the saved page and on a refresh, so it fetches the event itself
  // rather than being handed the settings it shows. Tenant-scoped, the same way the saved page is.
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

  // The template only supplies the preview below, so a failure leaves the preview empty rather
  // than putting the whole page into an error state.
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
              variant="lightBlue"
              title="Limited recipients."
              description="You can only send notifications to team members."
            />

            <RadioGroup
              label="Recipient(s)"
              isRequired
              description="Choose who will receive the test notification"
              value={recipient ?? ''}
              onChange={(value) => setRecipient(value as Recipient)}
            >
              <Radio value="myself">Myself</Radio>
              {/* Shown even though it cannot be picked, so it is clear the option is coming. */}
              <Radio value="other" isDisabled>
                Another recipient
              </Radio>
            </RadioGroup>

            {recipient === 'myself' && template && (
              <>
                <div className="events__subsection">
                  <h2 className="events__subheading">Review Notification</h2>
                  <p className="events__help">
                    Review the notification template and test data below before sending a test
                    notification.
                  </p>
                </div>

                {/* TODO: opens the test data for editing once preview variables are stored
                    against the event. */}
                <Button
                  size="medium"
                  variant="secondary"
                  onPress={() => undefined}
                  style={{ width: '120px' }}
                >
                  Edit values
                </Button>

                <div className="events__preview-card">
                  <EventEmailPreview
                    emailSettings={emailSettings}
                    template={template}
                    envelope={{
                      from: emailSettings.senderEmail ?? '',
                      to: userEmail ?? '',
                    }}
                  />
                </div>
              </>
            )}

            {/* Before a recipient is picked the page is short enough that the action bar sits
                just under the radio group; this holds it down where it sits once the review
                below appears. */}
            {recipient !== 'myself' && <div className="events__test-send-spacer" aria-hidden />}

            <StickyBar>
              <Button
                variant="secondary"
                type="button"
                onPress={() =>
                  navigate({
                    to: '/events/$eventId',
                    params: { eventId },
                    search: { tab: 'email' },
                  })
                }
              >
                Back to email notifications
              </Button>
              {/* There is no test send endpoint yet, so this marks where it goes and stays
                  disabled until there is something to call. */}
              <Button variant="primary" type="button" isDisabled>
                Send test email (1)
              </Button>
            </StickyBar>
          </>
        )}
      </section>
    </div>
  )
}

export default EventsEmailTestSend
