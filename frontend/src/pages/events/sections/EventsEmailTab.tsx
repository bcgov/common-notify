import { useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  Button,
  Select,
  Switch,
  TextField,
  Tooltip,
  TooltipTrigger,
  SvgInfoIcon,
} from '@bcgov/design-system-react-components'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'

const SENDER_EMAIL_TOOLTIP =
  'Replies and bounce messages may be sent to this address, but the inbox is not monitored.'

// Header, footer and attachment service are not implemented yet.
const NOT_IMPLEMENTED_ITEMS = [{ id: 'not-implemented', label: 'Not implemented' }]

const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

// `tagStyle` is forwarded to the tag the Select renders once the option is selected.
const RECIPIENT_ITEMS = [
  { id: ADDITIONAL_RECIPIENTS_ID, label: 'Additional recipient(s)', tagStyle: 'circular' as const },
]

export type EmailSettingsValues = {
  active: boolean
  senderEmail: string
}

type EventsEmailTabProps = {
  values: EmailSettingsValues
  /** Saves the email channel settings. Must not reject. */
  onSave: (values: EmailSettingsValues) => Promise<void>
  isDisabled?: boolean
}

const EventsEmailTab: FC<EventsEmailTabProps> = ({ values, onSave, isDisabled = false }) => {
  // Seeded once at mount, the same way EventsTab does it: the page passes the saved settings
  // back in via `values`, which is what the change check below compares against.
  const [channelActive, setChannelActive] = useState(values.active)
  const [senderEmail, setSenderEmail] = useState(values.senderEmail)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const trimmedSenderEmail = senderEmail.trim()
  const settingsChanged =
    channelActive !== values.active || trimmedSenderEmail !== values.senderEmail
  const isFormDisabled = isDisabled || saving
  // Nothing below the toggle is editable while the channel is disabled
  // settings can still be applied so the off state itself is persisted.
  const areFieldsDisabled = isFormDisabled || !channelActive
  const isApplyDisabled = isFormDisabled || !settingsChanged

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isApplyDisabled) {
      return
    }

    setSaving(true)
    try {
      await onSave({ active: channelActive, senderEmail: trimmedSenderEmail })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <h2 className="events__section-heading">Email Notification Settings</h2>

      <Switch
        labelPosition="left"
        isSelected={channelActive}
        onChange={setChannelActive}
        isDisabled={isFormDisabled}
      >
        Channel active
      </Switch>

      <TextField
        label={
          (
            <>
              Sender email address{' '}
              <TooltipTrigger>
                <Button
                  aria-label="About the sender email address"
                  className="events__tooltip-trigger"
                  isIconButton
                  size="xsmall"
                  type="button"
                  variant="tertiary"
                >
                  <SvgInfoIcon />
                </Button>

                <Tooltip placement="right">{SENDER_EMAIL_TOOLTIP}</Tooltip>
              </TooltipTrigger>
            </>
          ) as unknown as string
        }
        value={senderEmail}
        onChange={setSenderEmail}
        description="The default sender email is based on your tenant but can be changed. It must be linked to a registered IDIR account or an approved email address."
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
        errorMessage="Sender email address cannot be empty."
      />

      <Select
        label="Recipient(s)"
        placeholder="Select recipients..."
        selectionMode="multiple"
        items={RECIPIENT_ITEMS}
        value={selectedRecipients}
        onChange={(keys) => setSelectedRecipients(keys.map(String))}
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
      />

      {selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) && (
        <EventsAdditionalRecipients isDisabled={areFieldsDisabled} />
      )}

      <Select
        label="Template"
        placeholder="Select a template..."
        items={[]}
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
      />

      <Select
        label="Header"
        placeholder="Use tenant default"
        items={NOT_IMPLEMENTED_ITEMS}
        size="small"
        isDisabled
      />

      <Select
        label="Footer"
        placeholder="Use tenant default"
        items={NOT_IMPLEMENTED_ITEMS}
        size="small"
        isDisabled
      />

      <Select
        label="Attachment service"
        placeholder="Select an attachment..."
        items={NOT_IMPLEMENTED_ITEMS}
        size="small"
        isDisabled
      />

      <div className="events__actions">
        <Button variant="secondary" isDisabled>
          Preview
        </Button>
        <Button type="submit" variant="primary" isDisabled={isApplyDisabled}>
          {saving ? 'Saving…' : 'Apply settings'}
        </Button>
      </div>
    </form>
  )
}

export default EventsEmailTab
