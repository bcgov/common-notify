import type { FC } from 'react'

type EventsEmailTemplatePreviewProps = {
  subject?: string | null
  body: string
  isDisabled: boolean
}

/** The selected template's subject line and body, as plain text. */
const EventsEmailTemplatePreview: FC<EventsEmailTemplatePreviewProps> = ({
  subject,
  body,
  isDisabled,
}) => (
  <div
    className={`events__template-preview${isDisabled ? ' events__template-preview--disabled' : ''}`}
  >
    <span className="events__template-preview-label">Template Preview</span>
    <div className="events__template-preview-box">
      <p className="events__template-preview-subject">
        <strong>Subject line:</strong> {subject}
      </p>
      <p className="events__template-preview-body-label">
        <strong>Body text:</strong>
      </p>
      <p className="events__template-preview-content">{body}</p>
    </div>
  </div>
)

export default EventsEmailTemplatePreview
