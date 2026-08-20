import { useEffect, useState } from 'react'
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
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import { getTemplates, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'

const SENDER_EMAIL_TOOLTIP =
  'Replies and bounce messages may be sent to this address, but the inbox is not monitored.'

// Tenant default_sender_email stores only the local part (before @gov.bc.ca); matches the
// suffix shown on the Settings > Email tab.
const SENDER_EMAIL_DOMAIN = 'gov.bc.ca'

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
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
}

// The Apply/Save draft payloads exclude `active` - the "Channel active" toggle saves itself
// immediately via onActiveChange, separate from the rest of the tab's settings.
export type EmailApplyValues = Omit<EmailSettingsValues, 'active'>

export type EmailDraftValues = {
  senderEmail: string | null
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
}

function sameAddresses(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((address, index) => address === b[index])
}

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

function isValidEmail(value: string): boolean {
  return value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)
}

type EventsEmailTabProps = {
  values: EmailSettingsValues
  /** Saves the email channel settings. */
  onSave: (values: EmailApplyValues) => Promise<void>
  /** Saves the current form state as a draft, null values accepted, bad values not accepted. */
  onSaveDraft: (values: EmailDraftValues) => Promise<void>
  /** Immediately persists the "Channel active" toggle, ahead of the rest of the tab's settings. */
  onActiveChange: (active: boolean) => Promise<void>
  isDisabled?: boolean
  /** Tenant's default_sender_email (local part only), used to seed the field when unset. */
  defaultSenderEmail?: string | null
}

const EventsEmailTab: FC<EventsEmailTabProps> = ({
  values,
  onSave,
  onSaveDraft,
  onActiveChange,
  isDisabled = false,
  defaultSenderEmail,
}) => {
  // Seeded once at mount, the same way EventsTab does it: the page passes the saved settings
  // back in via `values`, which is what the change check below compares against.
  const [channelActive, setChannelActive] = useState(values.active)
  // When the event has no saved sender email yet, start the field on the tenant default
  // instead of leaving it blank, so applying settings without editing it still saves a value.
  const [senderEmail, setSenderEmail] = useState(
    values.senderEmail ||
      (defaultSenderEmail ? `${defaultSenderEmail}@${SENDER_EMAIL_DOMAIN}` : ''),
  )
  const [recipients, setRecipients] = useState<RecipientAddresses>({
    to: values.to,
    cc: values.cc,
    bcc: values.bcc,
  })
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    values.to.length || values.cc.length || values.bcc.length ? [ADDITIONAL_RECIPIENTS_ID] : [],
  )
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )

  // Failures are not surfaced since the form is still usable without the template list loaded.
  useEffect(() => {
    let active = true

    getTemplates(1, 100, undefined, 'name', [`channelCode:eq:${NotificationChannel.EMAIL}`])
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

  // The tenant default loads asynchronously and can arrive after this tab has already mounted;
  // backfill it once it does, but only while the field is still untouched and unsaved.
  useEffect(() => {
    if (!values.senderEmail && !senderEmail && defaultSenderEmail) {
      setSenderEmail(`${defaultSenderEmail}@${SENDER_EMAIL_DOMAIN}`)
    }
  }, [defaultSenderEmail, senderEmail, values.senderEmail])

  const templateItems = templates.map((t) => ({ id: t.id, label: t.name }))
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  const trimmedSenderEmail = senderEmail.trim()
  const senderEmailError =
    trimmedSenderEmail !== '' && !isValidEmail(trimmedSenderEmail)
      ? 'Enter a valid sender email address.'
      : ''
  const invalidRecipients: RecipientAddresses = {
    to: recipients.to.filter((address) => !isValidEmail(address)),
    cc: recipients.cc.filter((address) => !isValidEmail(address)),
    bcc: recipients.bcc.filter((address) => !isValidEmail(address)),
  }
  const hasValidationError =
    Boolean(senderEmailError) ||
    invalidRecipients.to.length > 0 ||
    invalidRecipients.cc.length > 0 ||
    invalidRecipients.bcc.length > 0
  const recipientsChanged =
    !sameAddresses(recipients.to, values.to) ||
    !sameAddresses(recipients.cc, values.cc) ||
    !sameAddresses(recipients.bcc, values.bcc)
  const settingsChanged =
    trimmedSenderEmail !== values.senderEmail ||
    (selectedTemplateId ?? null) !== values.templateId ||
    recipientsChanged
  const isFormDisabled = isDisabled || saving || savingDraft || togglingActive
  // Nothing below the toggle is editable while the channel is disabled
  // settings can still be applied so the off state itself is persisted.
  const areFieldsDisabled = isFormDisabled || !channelActive
  const isApplyDisabled = isFormDisabled || !settingsChanged || hasValidationError

  async function handleActiveChange(next: boolean) {
    const previous = channelActive
    setChannelActive(next)
    setTogglingActive(true)
    try {
      await onActiveChange(next)
    } catch {
      setChannelActive(previous)
    } finally {
      setTogglingActive(false)
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isApplyDisabled) {
      return
    }

    setSaving(true)
    try {
      await onSave({
        senderEmail: trimmedSenderEmail,
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    if (hasValidationError) {
      return
    }

    setSavingDraft(true)
    try {
      await onSaveDraft({
        senderEmail: trimmedSenderEmail || null,
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
      })
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <h2 className="events__section-heading">Email Notification Settings</h2>

      <Switch
        labelPosition="left"
        isSelected={channelActive}
        onChange={handleActiveChange}
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
        isInvalid={senderEmailError ? true : undefined}
        errorMessage={senderEmailError || 'Sender email address cannot be empty.'}
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
        <EventsAdditionalRecipients
          values={recipients}
          onChange={setRecipients}
          invalidAddresses={invalidRecipients}
          isDisabled={areFieldsDisabled}
        />
      )}

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
            <p className="events__template-preview-subject">
              <strong>Subject line:</strong> {selectedTemplate.subject}
            </p>
            <p className="events__template-preview-body-label">
              <strong>Body text:</strong>
            </p>
            <p className="events__template-preview-content">{selectedTemplate.body}</p>
          </div>
        </div>
      )}

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
        <Button
          type="button"
          variant="secondary"
          isDisabled={isDisabled || saving || savingDraft || hasValidationError}
          onPress={handleSaveDraft}
        >
          {savingDraft ? 'Saving…' : 'Save draft'}
        </Button>
        <Button type="submit" variant="primary" isDisabled={isApplyDisabled}>
          {saving ? 'Saving…' : 'Apply settings'}
        </Button>
      </div>
    </form>
  )
}

export default EventsEmailTab
