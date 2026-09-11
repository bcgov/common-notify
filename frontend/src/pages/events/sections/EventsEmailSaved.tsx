import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Callout,
  ToggleButton,
  ToggleButtonGroup,
} from '@bcgov/design-system-react-components'
import PageHeading from '@/components/PageHeading'
import StickyBar from '@/components/StickyBar'
import type { EventTab } from '../EditEvent'
import { getEventById } from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { getTemplateById } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'
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
  const dispatch = useAppDispatch()
  const approvedLogos = useAppSelector((state) => state.emailSettings.approvedLogos)
  const tenantEmailLogoId = useAppSelector((state) => state.emailSettings.emailLogoId)
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [template, setTemplate] = useState<TemplateResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // The header below is previewed from the tenant's logo, the same as on the email tab.
  useEffect(() => {
    dispatch(fetchSettings())
    dispatch(fetchApprovedEmailLogos())
  }, [dispatch])

  // The page is landed on directly after a save and on a refresh, so it fetches the event
  // itself rather than being handed the settings it shows.
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

  // A custom header shows its own logo and title; the tenant default shows the tenant's
  // configured logo on its own.
  const useCustomHeader = emailSettings?.useCustomHeader ?? false
  const headerLogoId = useCustomHeader ? emailSettings?.headerLogoId : tenantEmailLogoId
  const headerLogo = approvedLogos.find((logo) => logo.id === headerLogoId)
  const headerTitle = useCustomHeader ? (emailSettings?.headerTitle ?? '') : ''

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
      <div className="events__tabs">
        <ToggleButtonGroup
          size="medium"
          orientation="horizontal"
          selectionMode="single"
          selectedKeys={['email']}
          onSelectionChange={(keys) => {
            const [key] = [...keys]
            if (key && key !== 'email') {
              openTab(key as EventTab)
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
        ) : !emailSettings ? (
          <p className="events__help">This event has no saved email notification settings yet.</p>
        ) : (
          <>
            <Callout
              variant="lightGrey"
              title="Ready to send?"
              description="Your email settings are ready. Continue to select recipients and send a test notification to verify the content and formatting."
            />

            {template && (
              <div className="events__saved-preview">
                <p className="events__saved-subject">
                  <strong>Subject line:</strong> {template.subject}
                </p>

                {(headerLogo || headerTitle) && (
                  <div className="events__header-preview-row">
                    {headerLogo && (
                      <img
                        alt=""
                        className="events__header-preview-logo"
                        loading="lazy"
                        src={headerLogo.imageUrl}
                      />
                    )}
                    {headerTitle && (
                      <span className="events__header-preview-title">{headerTitle}</span>
                    )}
                  </div>
                )}
                {/** TODO
                 *   render the template using saved preview variables once
                 *   the preview variables database table is added. For now
                 *   the preview displays the raw template body.
                 */}
                <p className="events__saved-body">{template.body}</p>
              </div>
            )}

            <StickyBar>
              <Button variant="secondary" type="button" onPress={() => openTab('email')}>
                Edit settings
              </Button>
              {/* The test notification screen isn't built yet, so this only marks where it goes. */}
              <Button variant="primary" type="button">
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
