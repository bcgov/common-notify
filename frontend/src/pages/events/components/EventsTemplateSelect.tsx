import type { FC } from 'react'
import { Select } from '@bcgov/design-system-react-components'
import type { TemplateResponse } from '@/api/templates.api'

type EventsTemplateSelectProps = {
  templates: TemplateResponse[]
  value: string | undefined
  onChange: (templateId: string | undefined) => void
  size: 'small' | 'medium'
  isDisabled?: boolean
  /** Shown once there is something to report; the select is marked invalid while it is set. */
  errorMessage?: string
}

/** The required "Template" picker on each channel tab. */
const EventsTemplateSelect: FC<EventsTemplateSelectProps> = ({
  templates,
  value,
  onChange,
  size,
  isDisabled,
  errorMessage,
}) => (
  <Select
    label="Template"
    placeholder="Select a template..."
    items={templates.map((template) => ({ id: template.id, label: template.name }))}
    value={value}
    onChange={(key) => onChange(key == null ? undefined : String(key))}
    size={size}
    isDisabled={isDisabled}
    isRequired
    validationBehavior="aria"
    isInvalid={Boolean(errorMessage)}
    errorMessage={errorMessage}
  />
)

export default EventsTemplateSelect
