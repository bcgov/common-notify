import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  AlertDialog,
  Button,
  Modal,
  Select,
  Switch,
  TextArea,
  TextField,
} from '@bcgov/design-system-react-components'
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import { getTemplates, NotificationChannel } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const SENDER_PHONE_HELP =
  'Your default phone number from your account (IDIR) will be used. The number must be registered before it can send notifications through this service.'

const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

// `tagStyle` is forwarded to the tag the Select renders once the option is selected.
const RECIPIENT_ITEMS = [
  { id: ADDITIONAL_RECIPIENTS_ID, label: 'Additional recipient(s)', tagStyle: 'circular' as const },
]

export type SmsSettingsValues = {
  active: boolean
  templateId: string | null
  to: string[]
}

// The Apply/Save draft payloads exclude `active` - the "Channel active" toggle saves itself
// immediately via onActiveChange, separate from the rest of the tab's settings.
export type SmsApplyValues = Omit<SmsSettingsValues, 'active'>

export type SmsDraftValues = {
  templateId: string | null
  to: string[]
}

function sameAddresses(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((address, index) => address === b[index])
}

// Mirrors backend/src/api/notify/services/phone-number.service.ts's normalize/isValid logic, so
// a number accepted here is accepted by the backend's IsNormalizablePhoneNumber validator too.
const DEFAULT_PHONE_REGION = 'CA'
const FORMATTING_CHARACTERS = /[\s\-().]/g

function isValidPhone(value: string): boolean {
  const cleaned = value.replace(FORMATTING_CHARACTERS, '')

  try {
    const phoneNumber = parsePhoneNumberFromString(cleaned, DEFAULT_PHONE_REGION)
    return !!phoneNumber && !phoneNumber.ext && phoneNumber.isValid()
  } catch {
    return false
  }
}

type EventsSmsTabProps = {
  values: SmsSettingsValues
  /** Saves the SMS channel settings. */
  onSave: (values: SmsApplyValues) => Promise<void>
  /** Saves the current form state as a draft, null values accepted, bad values not accepted. */
  onSaveDraft: (values: SmsDraftValues) => Promise<void>
  /** Immediately persists the "Channel active" toggle, ahead of the rest of the tab's settings. */
  onActiveChange: (active: boolean) => Promise<void>
  isDisabled?: boolean
}

const EventsSmsTab: FC<EventsSmsTabProps> = ({
  values,
  onSave,
  onSaveDraft,
  onActiveChange,
  isDisabled = false,
}) => {
  // Seeded once at mount, the same way EventsEmailTab does it: the page passes the saved
  // settings back in via `values`, which is what the change check below compares against.
  const [channelActive, setChannelActive] = useState(values.active)
  const [recipients, setRecipients] = useState<RecipientAddresses>({
    to: values.to,
    cc: [],
    bcc: [],
  })
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    values.to.length ? [ADDITIONAL_RECIPIENTS_ID] : [],
  )
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )

  // Failures are not surfaced since the form is still usable without the template list loaded.
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

  const invalidRecipients: RecipientAddresses = {
    to: recipients.to.filter((address) => !isValidPhone(address)),
    cc: [],
    bcc: [],
  }
  const hasValidationError = invalidRecipients.to.length > 0
  const recipientsChanged = !sameAddresses(recipients.to, values.to)
  const settingsChanged = (selectedTemplateId ?? null) !== values.templateId || recipientsChanged
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
      showSuccessToast(
        next
          ? 'SMS channel reactivated: This channel is now active and can send notifications. Your settings have been restored, and you can make changes at any time.'
          : 'SMS channel deactivated: This channel is no longer active and will not send notifications. Your settings are saved and can be reactivated at any time.',
      )
    } catch (error) {
      setChannelActive(previous)
      showErrorToast(
        `Unable to update channel: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setTogglingActive(false)
    }
  }

  // Turning the channel on saves immediately; turning it off asks for confirmation first.
  function handleSwitchChange(next: boolean) {
    if (next) {
      void handleActiveChange(true)
    } else {
      setConfirmDeactivateOpen(true)
    }
  }

  async function handleConfirmDeactivate() {
    setConfirmDeactivateOpen(false)
    await handleActiveChange(false)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isApplyDisabled) {
      return
    }

    setSaving(true)
    try {
      await onSave({
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
      })
      showSuccessToast('Settings applied: Your SMS notification settings have been saved.')
    } catch (error) {
      showErrorToast(
        `Unable to apply settings: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
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
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
      })
      showSuccessToast('Draft saved: Your changes have been saved. Continue editing anytime.')
    } catch (error) {
      showErrorToast(
        `Unable to save draft: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <h2 className="events__section-heading">SMS Notification Settings</h2>

      <Switch
        labelPosition="left"
        isSelected={channelActive}
        onChange={handleSwitchChange}
        isDisabled={isFormDisabled}
      >
        Channel active
      </Switch>

      <Modal
        isOpen={confirmDeactivateOpen}
        isDismissable={!togglingActive}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivateOpen(false)
        }}
      >
        <AlertDialog
          variant="confirmation"
          title="Deactivate this channel?"
          buttons={
            <>
              <Button
                variant="secondary"
                danger
                onPress={handleConfirmDeactivate}
                isDisabled={togglingActive}
              >
                Deactivate
              </Button>
              <Button
                variant="primary"
                onPress={() => setConfirmDeactivateOpen(false)}
                isDisabled={togglingActive}
              >
                Cancel
              </Button>
            </>
          }
        >
          This will stop notifications from being sent through this channel. Your settings will be
          saved and can be reactivated at any time.
        </AlertDialog>
      </Modal>

      <TextField
        label="Sender phone number"
        value=""
        description={SENDER_PHONE_HELP}
        size="small"
        isDisabled
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
        <div className="events__template-preview events__template-preview--auto-size">
          <span className="events__template-preview-label">Template Preview</span>
          <TextArea aria-label="Template preview" value={selectedTemplate.body} isReadOnly />
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
          invalidAddresses={invalidRecipients}
          isDisabled={areFieldsDisabled}
          variant="sms"
        />
      )}

      <div className="events__actions">
        <Button variant="secondary" isDisabled>
          Preview
        </Button>
        <Button
          type="button"
          variant="secondary"
          isDisabled={isFormDisabled || !settingsChanged || hasValidationError}
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

export default EventsSmsTab
