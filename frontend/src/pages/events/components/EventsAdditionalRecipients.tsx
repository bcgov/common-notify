import { useState } from 'react'
import type { FC } from 'react'
import { Checkbox } from '@bcgov/design-system-react-components'
import TagListField from '@/components/TagListField'

export type RecipientFieldId = 'to' | 'cc' | 'bcc'
export type RecipientAddresses = Record<RecipientFieldId, string[]>
export type RecipientVariant = 'email' | 'sms'

const RECIPIENT_FIELDS: { id: RecipientFieldId; label: string }[] = [
  { id: 'to', label: 'To' },
  { id: 'cc', label: 'CC' },
  { id: 'bcc', label: 'BCC' },
]

type RecipientField = {
  enabled: boolean
  addresses: string[]
}

function buildInitialFields(values: RecipientAddresses): Record<RecipientFieldId, RecipientField> {
  return RECIPIENT_FIELDS.reduce(
    (fields, { id }) => ({
      ...fields,
      [id]: { enabled: values[id].length > 0, addresses: values[id] },
    }),
    {} as Record<RecipientFieldId, RecipientField>,
  )
}

/** Addresses to report to the parent: only for fields the user has checked on. */
function exportAddresses(fields: Record<RecipientFieldId, RecipientField>): RecipientAddresses {
  return RECIPIENT_FIELDS.reduce(
    (values, { id }) => ({ ...values, [id]: fields[id].enabled ? fields[id].addresses : [] }),
    {} as RecipientAddresses,
  )
}

type EventsAdditionalRecipientsProps = {
  /** Saved to/cc/bcc addresses, seeded once at mount the same way EventsEmailTab seeds its fields. */
  values: RecipientAddresses
  /** Called with the addresses that should be saved whenever a field or its checkbox changes. */
  onChange: (values: RecipientAddresses) => void
  /** Malformed addresses per field, as determined by the parent; empty/absent means valid. */
  invalidAddresses?: RecipientAddresses
  isDisabled?: boolean
  /** 'email' shows To/CC/BCC behind checkboxes; 'sms' shows only a single always-visible To field. */
  variant?: RecipientVariant
}

/**
 * Manually entered recipients for the email/SMS channels, shown once "Additional recipient(s)"
 * is selected in the Recipient(s) field.
 */
const EventsAdditionalRecipients: FC<EventsAdditionalRecipientsProps> = ({
  values,
  onChange,
  invalidAddresses,
  isDisabled = false,
  variant = 'email',
}) => {
  const [fields, setFields] = useState(() => buildInitialFields(values))

  function updateField(id: RecipientFieldId, changes: Partial<RecipientField>) {
    const next = { ...fields, [id]: { ...fields[id], ...changes } }
    setFields(next)
    onChange(exportAddresses(next))
  }

  if (variant === 'sms') {
    const invalid = invalidAddresses?.to ?? []

    return (
      <div className="events__additional-recipients" role="group" aria-label="Additional recipients">
        <span className="events__field-label">Additional recipient(s) (required)</span>

        <TagListField
          values={fields.to.addresses}
          onChange={(addresses) => updateField('to', { enabled: true, addresses })}
          aria-label="Phone numbers"
          placeholder="Enter phone number(s)"
          isDisabled={isDisabled}
          isInvalid={invalid.length > 0}
          errorMessage={
            invalid.length > 0 ? `Enter valid phone numbers. Invalid: ${invalid.join(', ')}` : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="events__additional-recipients" role="group" aria-label="Additional recipients">
      <span className="events__field-label">Additional recipient(s) (required)</span>

      {RECIPIENT_FIELDS.map(({ id, label }) => {
        const field = fields[id]
        const invalid = invalidAddresses?.[id] ?? []

        return (
          <div className="events__recipient-group" key={id}>
            <Checkbox
              isSelected={field.enabled}
              onChange={(enabled) => updateField(id, { enabled })}
              isDisabled={isDisabled}
            >
              {label}
            </Checkbox>

            {field.enabled && (
              <TagListField
                values={field.addresses}
                onChange={(addresses) => updateField(id, { addresses })}
                aria-label={`${label} email addresses`}
                placeholder="Enter email addresses"
                isDisabled={isDisabled}
                isInvalid={invalid.length > 0}
                errorMessage={
                  invalid.length > 0
                    ? `Enter valid email addresses. Invalid: ${invalid.join(', ')}`
                    : undefined
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default EventsAdditionalRecipients
