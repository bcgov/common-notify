import type { FC } from 'react'
import { Radio, RadioGroup, Select, TextField } from '@bcgov/design-system-react-components'
import { HEADER_CUSTOM_ID, HEADER_TENANT_DEFAULT_ID } from '../hooks/useEmailHeader'
import type { EmailHeader } from '../hooks/useEmailHeader'

type EmailHeaderFieldsProps = {
  header: EmailHeader
  isDisabled: boolean
  /** Called after any header field is edited. */
  onChange: () => void
}

/** The email notification header choice, its custom logo and title, and a preview of it. */
const EmailHeaderFields: FC<EmailHeaderFieldsProps> = ({ header, isDisabled, onChange }) => (
  <>
    <RadioGroup
      label="Email notification header"
      value={header.mode}
      onChange={(value) => {
        header.setMode(value)
        onChange()
      }}
      isDisabled={isDisabled}
    >
      <Radio value={HEADER_TENANT_DEFAULT_ID}>Use tenant default</Radio>
      <Radio value={HEADER_CUSTOM_ID}>Custom</Radio>
    </RadioGroup>

    {header.mode === HEADER_CUSTOM_ID && (
      <>
        <Select
          label="Email logo/brand"
          placeholder="Select a logo..."
          items={header.logoItems}
          value={header.logoId}
          onChange={(key) => {
            header.setLogoId(key == null ? undefined : String(key))
            onChange()
          }}
          size="small"
          isDisabled={isDisabled}
        />

        <TextField
          label="Header title"
          value={header.title}
          onChange={(value) => {
            header.editTitle(value)
            onChange()
          }}
          description="Defaults to your tenant name. Changes only affect the title displayed in email notifications and do not change your tenant name."
          size="small"
          isDisabled={isDisabled}
        />
      </>
    )}

    {(header.previewLogo || header.previewTitle) && (
      <div className="events__header-preview">
        <span className="events__field-label">Header Preview</span>
        <div className="events__header-preview-row">
          {header.previewLogo && (
            <img
              alt=""
              className="events__header-preview-logo"
              loading="lazy"
              src={header.previewLogo.imageUrl}
            />
          )}
          {header.previewTitle && (
            <span className="events__header-preview-title">{header.previewTitle}</span>
          )}
        </div>
      </div>
    )}
  </>
)

export default EmailHeaderFields
