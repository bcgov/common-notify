import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button, Select, Switch, TextField } from '@bcgov/design-system-react-components'
import { getTemplates, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'

const SENDER_PHONE_HELP =
  'Your default phone number from your account (IDIR) will be used. The number must be registered before it can send notifications through this service.'

const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

// `tagStyle` is forwarded to the tag the Select renders once the option is selected.
const RECIPIENT_ITEMS = [
  { id: ADDITIONAL_RECIPIENTS_ID, label: 'Additional recipient(s)', tagStyle: 'circular' as const },
]

type EventsSmsTabProps = {
  isDisabled?: boolean
}

const EventsSmsTab: FC<EventsSmsTabProps> = ({ isDisabled = false }) => {
  const [channelActive, setChannelActive] = useState(false)
  const [senderPhone, setSenderPhone] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [recipients, setRecipients] = useState<RecipientAddresses>({ to: [], cc: [], bcc: [] })
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()

  useEffect(() => {
    let active = true

    getTemplates(1, 100, undefined, 'name', [`channelCode:eq:${NotificationChannel.SMS}`])
      .then((response) => {
        if (active) {
          setTemplates(response.data)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const templateItems = templates.map((t) => ({ id: t.id, label: t.name }))
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  // Disable all fields while the channel is inactive
  const areFieldsDisabled = isDisabled || !channelActive

  return (
    <div className="events__form">
      <h2 className="events__section-heading">SMS Notification Settings</h2>

      <Switch
        labelPosition="left"
        isSelected={channelActive}
        onChange={setChannelActive}
        isDisabled={isDisabled}
      >
        Channel active
      </Switch>

      <TextField
        label="Sender phone number"
        value={senderPhone}
        onChange={setSenderPhone}
        description={SENDER_PHONE_HELP}
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
        errorMessage="Sender phone number cannot be empty."
      />

      <Select
        label="Template"
        placeholder="Select a template..."
        items={templateItems}
        value={selectedTemplateId}
        onChange={(key) => setSelectedTemplateId(key == null ? undefined : String(key))}
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
      />

      {selectedTemplate && (
        <div className="events__template-preview">
          <span className="events__template-preview-label">Template Preview</span>
          <div className="events__template-preview-box">
            {selectedTemplate.subject && (
              <p className="events__template-preview-subject">
                <strong>Subject line:</strong> {selectedTemplate.subject}
              </p>
            )}
            <p className="events__template-preview-body-label">
              <strong>Body text:</strong>
            </p>
            <p className="events__template-preview-content">{selectedTemplate.body}</p>
          </div>
        </div>
      )}

      <Select
        label="Recipient(s)"
        placeholder="Select a recipient..."
        selectionMode="multiple"
        items={RECIPIENT_ITEMS}
        value={selectedRecipients}
        onChange={(keys) => setSelectedRecipients(keys.map(String))}
        size="small"
        isDisabled={areFieldsDisabled}
        isRequired
      />

      {selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) && (
        <EventsAdditionalRecipients
          values={recipients}
          onChange={setRecipients}
          isDisabled={areFieldsDisabled}
          variant="sms"
        />
      )}

      <div className="events__actions">
        <Button variant="secondary" isDisabled>
          Preview
        </Button>
        <Button variant="primary" isDisabled>
          Apply settings
        </Button>
      </div>
    </div>
  )
}

export default EventsSmsTab
