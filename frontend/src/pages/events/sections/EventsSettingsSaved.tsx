import type { FC, ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Callout } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import StickyBar from '@/components/StickyBar'
import EventTabs from '../components/EventTabs'
import type { EventTab } from '../components/EventTabs'
import EventEmailPreview from '../components/EventEmailPreview'
import EventsSmsEstimate from '../components/EventsSmsEstimate'
import { useEvent } from '../hooks/useEvent'
import { useTemplate } from '../hooks/useTemplate'
import type { TemplateResponse } from '@/api/templates.api'
import '@/scss/components/events.scss'

export type SavedChannel = 'email' | 'sms'

const CHANNEL_LABELS: Record<SavedChannel, string> = { email: 'email', sms: 'SMS' }

const SavedSmsPreview: FC<{ template: TemplateResponse | null }> = ({ template }) =>
  template ? (
    <div className="events__saved-preview">
      <p className="events__template-preview-content">{template.body}</p>
      <EventsSmsEstimate body={template.body} />
    </div>
  ) : (
    <p className="events__help">
      The saved template preview is unavailable. Open settings to select a template.
    </p>
  )

interface EventsSettingsSavedProps {
  eventId: string
  channel: SavedChannel
}

/**
 * Confirmation a channel tab hands off to once its settings are saved: the notification as it
 * will be sent, and the way on to a test send. Only email has a test send page so far, so SMS
 * shows the button disabled.
 */
const EventsSettingsSaved: FC<EventsSettingsSavedProps> = ({ eventId, channel }) => {
  const navigate = useNavigate()
  const { event, loadError } = useEvent(eventId)
  const isSms = channel === 'sms'
  const label = CHANNEL_LABELS[channel]
  const settings = (isSms ? event?.smsSettings : event?.emailSettings) ?? null
  const template = useTemplate(settings?.templateId ?? null)
  // A saved but inactive SMS channel is told how to switch it on rather than asked to send.
  const isInactiveSms = isSms && settings?.active === false

  function openTab(tab: EventTab) {
    void navigate({ to: '/events/$eventId', params: { eventId }, search: { tab } })
  }

  let content: ReactNode
  if (loadError) {
    content = <div className="alert alert-danger">{loadError}</div>
  } else if (!event) {
    content = <p className="events__help">Loading event...</p>
  } else if (!settings) {
    content = (
      <p className="events__help">This event has no saved {label} notification settings yet.</p>
    )
  } else {
    content = (
      <>
        <Callout
          variant="lightGrey"
          title={isInactiveSms ? 'SMS settings saved' : 'Ready to send?'}
          description={
            isInactiveSms
              ? 'Your SMS settings are saved. Activate this channel when you are ready to send notifications.'
              : `Your ${label} settings are ready. Continue to select recipients and send a test notification to verify the content and formatting.`
          }
        />

        {isSms ? (
          <SavedSmsPreview template={template} />
        ) : (
          template &&
          event.emailSettings && (
            <EventEmailPreview emailSettings={event.emailSettings} template={template} />
          )
        )}

        {isSms && <p className="events__help">Test notifications are not available yet.</p>}

        <StickyBar>
          <Button
            variant="secondary"
            type="button"
            onPress={() =>
              navigate({
                to: '/events/$eventId',
                params: { eventId },
                search: { tab: channel, edit: true },
              })
            }
          >
            Edit settings
          </Button>
          <Button
            variant="primary"
            type="button"
            isDisabled={isSms}
            onPress={() =>
              navigate({ to: '/events/$eventId/email-test-send', params: { eventId } })
            }
          >
            Continue to test notification
          </Button>
        </StickyBar>
      </>
    )
  }

  return (
    // The SMS layout and breadcrumbs match the SMS tab this page stands in for.
    <div className={`page events${isSms ? ' events--sms' : ''}`}>
      <PageHeading
        title={event?.name ?? 'Event'}
        breadcrumbs={[
          ...(isSms ? [] : [{ label: 'Home', to: '/dashboard' as const }]),
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
          { label: 'Saved' },
        ]}
      />

      {/* This page only covers the saved channel; the other tabs go back to the event itself. */}
      <EventTabs selected={channel} onSelect={openTab} />

      <section className="events__section">{content}</section>
    </div>
  )
}

export default EventsSettingsSaved
