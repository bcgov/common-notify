import { useEffect } from 'react'
import type { FC } from 'react'
import type { EventEmailSettings } from '@/api/events.api'
import type { TemplateResponse } from '@/api/templates.api'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'

interface EventEmailPreviewProps {
  emailSettings: EventEmailSettings
  template: TemplateResponse
  /** Envelope lines, shown where the preview is of a send to a known address. */
  envelope?: { from: string; to: string }
}

/**
 * An event's saved email settings shown back as the notification they produce: the addresses it
 * is sent between, the subject line, the header it is sent under and the template body.
 *
 * Shared by the saved page and the test send page so the two show the same notification.
 */
const EventEmailPreview: FC<EventEmailPreviewProps> = ({ emailSettings, template, envelope }) => {
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
          {headerTitle && <span className="events__header-preview-title">{headerTitle}</span>}
        </div>
      )}
      {/** TODO
       *   render the template using saved preview variables once
       *   the preview variables database table is added. For now
       *   the preview displays the raw template body.
       */}
      <p className="events__saved-body">{template.body}</p>
    </div>
  )
}

export default EventEmailPreview
