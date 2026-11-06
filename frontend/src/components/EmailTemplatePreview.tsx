import type { FC } from 'react'
import '@/scss/components/email-template-preview.scss'

type EmailTemplatePreviewProps = {
  /** Shown above the box; leave out where the surroundings already say what this is. */
  label?: string
  /** Left out for SMS templates, which have no subject line. */
  subject?: string | null
  body: string
  isDisabled?: boolean
}

/** A template's subject line and body, as plain text. */
const EmailTemplatePreview: FC<EmailTemplatePreviewProps> = ({
  label,
  subject,
  body,
  isDisabled = false,
}) => (
  <div className={`email-template-preview${isDisabled ? ' email-template-preview--disabled' : ''}`}>
    {label && <span className="email-template-preview__label">{label}</span>}
    <div className="email-template-preview__box">
      {subject && (
        <p className="email-template-preview__subject">
          <strong>Subject line:</strong> {subject}
        </p>
      )}
      <p className="email-template-preview__body-label">
        <strong>Body text:</strong>
      </p>
      <p className="email-template-preview__content">{body}</p>
    </div>
  </div>
)

export default EmailTemplatePreview
