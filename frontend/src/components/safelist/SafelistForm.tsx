import { useState } from 'react'
import type { FC, FormEvent } from 'react'
import { Button, Select, TextField } from '@bcgov/design-system-react-components'
import type { CreateSafelistEntry, SafelistChannel } from '@/interfaces/safelist.interface'

// `id` is the wire value the API expects; `label` is what the user reads. These are deliberately
// NOT taken from the NotificationChannel enum — that enum holds display casing ('Email'), which
// the backend's @IsEnum and the recipient_safelist channel check constraint both reject.
const CHANNEL_ITEMS: Array<{ id: SafelistChannel; label: string }> = [
  { id: 'EMAIL', label: 'Email' },
  { id: 'SMS', label: 'SMS' },
]

interface SafelistFormProps {
  /** Resolve true to clear the form; false leaves the entered values in place to be corrected. */
  onSubmit: (values: CreateSafelistEntry) => Promise<boolean>
  isSubmitting?: boolean
  /** Set when the tenant is at its entry cap. */
  isFull?: boolean
}

/**
 * Add-a-recipient form for the safelist. Owns its own field state and clears itself only when
 * the caller reports the entry was accepted, so a rejected value (bad format, duplicate) stays
 * on screen for editing rather than vanishing.
 */
export const SafelistForm: FC<SafelistFormProps> = ({
  onSubmit,
  isSubmitting = false,
  isFull = false,
}) => {
  const [channelCode, setChannelCode] = useState<SafelistChannel>('EMAIL')
  const [recipient, setRecipient] = useState('')
  const [label, setLabel] = useState('')

  const isEmail = channelCode === 'EMAIL'
  const canSubmit = recipient.trim().length > 0 && !isSubmitting && !isFull

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    const accepted = await onSubmit({
      channelCode,
      recipient: recipient.trim(),
      label: label.trim() || null,
    })

    if (accepted) {
      setRecipient('')
      setLabel('')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="d-flex flex-wrap align-items-end gap-2 mb-3"
    >
      <div style={{ minWidth: '9rem' }}>
        <Select
          label="Channel"
          items={CHANNEL_ITEMS}
          value={channelCode}
          onChange={(value) => setChannelCode(value as SafelistChannel)}
          isDisabled={isSubmitting}
          style={{ width: '100%' }}
        />
      </div>

      <div className="flex-grow-1" style={{ minWidth: '14rem' }}>
        <TextField
          label={isEmail ? 'Email address' : 'Phone number'}
          value={recipient}
          onChange={setRecipient}
          isDisabled={isSubmitting}
          style={{ width: '100%' }}
          {...({ placeholder: isEmail ? 'name@gov.bc.ca' : '(250) 555-0100' } as any)}
        />
      </div>

      <div style={{ minWidth: '12rem' }}>
        <TextField
          label="Label (optional)"
          value={label}
          onChange={setLabel}
          isDisabled={isSubmitting}
          style={{ width: '100%' }}
          {...({ placeholder: 'QA mailbox' } as any)}
        />
      </div>

      <Button type="submit" variant="primary" isDisabled={!canSubmit}>
        {isSubmitting ? 'Adding…' : 'Add'}
      </Button>
    </form>
  )
}

export default SafelistForm
