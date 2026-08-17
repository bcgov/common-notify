import { useState } from 'react'
import type { FC } from 'react'
import { Checkbox, TagGroup, TagList } from '@bcgov/design-system-react-components'

type RecipientFieldId = 'to' | 'cc' | 'bcc'

const RECIPIENT_FIELDS: { id: RecipientFieldId; label: string }[] = [
  { id: 'to', label: 'To' },
  { id: 'cc', label: 'CC' },
  { id: 'bcc', label: 'BCC' },
]

type RecipientField = {
  enabled: boolean
  addresses: string[]
  /** What is currently typed, before a space turns it into a tag */
  draft: string
}

const INITIAL_FIELDS: Record<RecipientFieldId, RecipientField> = {
  to: { enabled: false, addresses: [], draft: '' },
  cc: { enabled: false, addresses: [], draft: '' },
  bcc: { enabled: false, addresses: [], draft: '' },
}

/** Appends addresses to a field, dropping blanks and ones already entered */
function withAddresses(field: RecipientField, values: string[]): string[] {
  return values.reduce(
    (addresses, value) => (value && !addresses.includes(value) ? [...addresses, value] : addresses),
    field.addresses,
  )
}

type EventsAdditionalRecipientsProps = {
  isDisabled?: boolean
}

/**
 * Manually entered recipients for the email channel, shown once "Additional recipient(s)"
 * is selected in the Recipient(s) field.
 *
 * bcds has no tag input, so each address list is a TagGroup and a TextArea sharing one
 * bordered container. Addresses are delimited by whitespace: typing a space commits what
 * came before it as a tag.
 */
const EventsAdditionalRecipients: FC<EventsAdditionalRecipientsProps> = ({
  isDisabled = false,
}) => {
  const [fields, setFields] = useState(INITIAL_FIELDS)

  function updateField(id: RecipientFieldId, changes: Partial<RecipientField>) {
    setFields((current) => ({ ...current, [id]: { ...current[id], ...changes } }))
  }

  function handleDraftChange(id: RecipientFieldId, text: string) {
    // Everything before the final space is complete; what follows is still being typed.
    const parts = text.split(/\s+/)
    const draft = parts.pop() ?? ''
    updateField(id, { addresses: withAddresses(fields[id], parts), draft })
  }

  // Leaving the field commits the address being typed, so it is not lost without a space.
  function handleBlur(id: RecipientFieldId) {
    const trimmed = fields[id].draft.trim()
    if (trimmed) {
      updateField(id, { addresses: withAddresses(fields[id], [trimmed]), draft: '' })
    }
  }

  return (
    <div className="events__additional-recipients" role="group" aria-label="Additional recipients">
      <span className="events__field-label">Additional recipient(s) (required)</span>

      {RECIPIENT_FIELDS.map(({ id, label }) => {
        const field = fields[id]

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
              <div
                className={`events__recipient-field ${isDisabled ? 'events__recipient-field--disabled' : ''}`}
              >
                {field.addresses.length > 0 && (
                  <TagGroup
                    aria-label={`${label} addresses`}
                    onRemove={(keys) =>
                      updateField(id, {
                        addresses: field.addresses.filter((address) => !keys.has(address)),
                      })
                    }
                  >
                    <TagList
                      items={field.addresses.map((address) => ({
                        id: address,
                        textValue: address,
                        size: 'xsmall',
                        tagStyle: 'circular',
                        ...(isDisabled && { isDisabled: true }),
                      }))}
                    />
                  </TagGroup>
                )}

                {/* bcds TextArea cannot take a placeholder, so the input is a plain
                    textarea styled to sit inside the bordered container above. */}
                <textarea
                  className="events__recipient-input"
                  aria-label={`${label} email addresses`}
                  placeholder="Enter email addresses"
                  rows={2}
                  value={field.draft}
                  onChange={(changeEvent) => handleDraftChange(id, changeEvent.target.value)}
                  onBlur={() => handleBlur(id)}
                  disabled={isDisabled}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default EventsAdditionalRecipients
