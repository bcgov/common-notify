import type { FC } from 'react'
import type { EventEmailSettings } from '@/api/events.api'
import type { TemplateResponse } from '@/api/templates.api'
import EventEmailHeader from './EventEmailHeader'

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

      <EventEmailHeader emailSettings={emailSettings} />
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
