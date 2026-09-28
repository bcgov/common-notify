import { useEffect } from 'react'
import type { FC } from 'react'
import type { EventEmailSettings } from '@/api/events.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'

/** A template rendered with a set of values, as the preview endpoint returns it. */
export interface RenderedNotification {
  subject: string
  /** Rendered HTML. When absent, `bodyText` is shown as plain text instead. */
  bodyHtml?: string
  bodyText: string
}

interface EventEmailPreviewProps {
  emailSettings: EventEmailSettings
  template: TemplateResponse
  /** Envelope lines, shown where the preview is of a send to a known address. */
  envelope?: { from: string; to: string }
  /** The template rendered with values. Without one the raw template body is shown instead. */
  rendered?: RenderedNotification
}

/**
 * An event's saved email settings shown back as the notification they produce: the addresses it
 * is sent between, the subject line, the header it is sent under and the template body.
 *
 * Shared by the saved page and the test send page so the two show the same notification.
 */
const EventEmailPreview: FC<EventEmailPreviewProps> = ({
  emailSettings,
  template,
  envelope,
  rendered,
}) => {
  const dispatch = useAppDispatch()
  const approvedLogos = useAppSelector((state) => state.emailSettings.approvedLogos)
  const tenantEmailLogoId = useAppSelector((state) => state.emailSettings.emailLogoId)
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)

  // The header below is previewed from the tenant's logo, the same as on the email tab. Both
  // thunks return early without a selected tenant, so they wait for one and re-run when it
  // changes.
  useEffect(() => {
    if (!selectedTenantId) return

    dispatch(fetchSettings())
    dispatch(fetchApprovedEmailLogos())
  }, [dispatch, selectedTenantId])

  // A custom header shows its own logo and title; the tenant default shows the tenant's
  // configured logo on its own.
  const useCustomHeader = emailSettings.useCustomHeader
  const headerLogoId = useCustomHeader ? emailSettings.headerLogoId : tenantEmailLogoId
  const headerLogo = approvedLogos.find((logo) => logo.id === headerLogoId)
  const headerTitle = useCustomHeader ? (emailSettings.headerTitle ?? '') : ''

  return (
    <div className="events__saved-preview">
      {envelope && (
        <div className="events__preview-envelope">
          <p className="events__preview-envelope-line">
            <strong>From:</strong> {envelope.from}
          </p>
          <p className="events__preview-envelope-line">
            <strong>To:</strong> {envelope.to}
          </p>
        </div>
      )}

      <p className="events__saved-subject">
        <strong>Subject line:</strong> {rendered ? rendered.subject : template.subject}
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
          {headerTitle && <span className="events__header-preview-title">{headerTitle}</span>}
        </div>
      )}
      {!rendered ? (
        // Nothing has been rendered yet, so the template is shown as it was written.
        <p className="events__saved-body">{template.body}</p>
      ) : rendered.bodyHtml !== undefined ? (
        <div
          className="events__preview-body"
          dangerouslySetInnerHTML={{ __html: rendered.bodyHtml }}
        />
      ) : (
        <p className="events__saved-body">{rendered.bodyText}</p>
      )}
    </div>
  )
}

export default EventEmailPreview
