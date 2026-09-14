import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import { Button, Select, Switch, TextArea, TextField } from '@bcgov/design-system-react-components'
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import ConfirmDeactivateDialog from '../components/ConfirmDeactivateDialog'
import { useChannelDeactivation } from '../hooks/useChannelDeactivation'
import StickyBar from '@/components/StickyBar'
import { NotificationChannel } from '@/api/templates.api'
import { useChannelTemplates } from '@/hooks/useChannelTemplates'
import { sameAddresses } from '@/utils/recipients'
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

// The Apply payload carries `active` - switching the channel on is only persisted here, since
// the backend requires a complete set of settings alongside it. Turning it off is the one thing
// that saves on its own, via onDeactivate.
export type SmsApplyValues = SmsSettingsValues

// Mirrors backend/src/api/notify/services/phone-number.service.ts's normalize/isValid logic, so
// a number accepted here is accepted by the backend's IsNormalizablePhoneNumber validator too.
const DEFAULT_PHONE_REGION = 'CA'
const FORMATTING_CHARACTERS = /[\s\-().]/g

// Returns the E.164 form, or null if `value` isn't a resolvable phone number.
function normalizePhone(value: string): string | null {
  const cleaned = value.replace(FORMATTING_CHARACTERS, '')

  try {
    const phoneNumber = parsePhoneNumberFromString(cleaned, DEFAULT_PHONE_REGION)
    return phoneNumber && !phoneNumber.ext && phoneNumber.isValid() ? phoneNumber.number : null
  } catch {
    return null
  }
}

function isValidPhone(value: string): boolean {
  return normalizePhone(value) !== null
}

// Differently formatted entries can normalize to the same E.164 number (e.g. "2505551234" and
// "250-555-1234"); TagListField only catches exact-string repeats, so flag later entries whose
// normalized form repeats an earlier one, the same way a malformed number is flagged, instead of
// letting the form silently drop them.
function duplicatePhoneNumbers(addresses: string[]): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const address of addresses) {
    const normalized = normalizePhone(address)
    if (normalized === null) continue
    if (seen.has(normalized)) {
      duplicates.push(address)
    } else {
      seen.add(normalized)
    }
  }

  return duplicates
}

type EventsSmsTabProps = {
  values: SmsSettingsValues
  /** Saves the SMS channel settings, including whether the channel is switched on. */
  onSave: (values: SmsApplyValues) => Promise<void>
  /** Immediately persists switching the channel off, ahead of the rest of the tab's settings. */
  onDeactivate: () => Promise<void>
  isDisabled?: boolean
  /** False until this channel has been saved for the first time (event.smsSettings is still null). */
  isConfigured: boolean
}

const EventsSmsTab: FC<EventsSmsTabProps> = ({
  values,
  onSave,
  onDeactivate,
  isDisabled = false,
  isConfigured,
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
  const templates = useChannelTemplates(NotificationChannel.SMS)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )
  const { isConfirmOpen, isDeactivating, requestDeactivate, cancelDeactivate, confirmDeactivate } =
    useChannelDeactivation({
      channelLabel: 'SMS',
      onDeactivate,
      onActiveChange: setChannelActive,
    })

  // The backend normalizes recipients (e.g. phone numbers to E.164) on save, and EditEvent
  // passes the saved result back down as `values`. Re-sync so that's reflected immediately
  // instead of only after a manual page refresh; no-ops while `values.to` still matches what
  // was last saved.
  useEffect(() => {
    setRecipients((prev) => (sameAddresses(prev.to, values.to) ? prev : { ...prev, to: values.to }))
  }, [values.to])

  const templateItems = templates.map((t) => ({ id: t.id, label: t.name }))
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  const duplicateRecipients = duplicatePhoneNumbers(recipients.to)
  const invalidRecipients: RecipientAddresses = {
    to: recipients.to.filter(
      (address) => !isValidPhone(address) || duplicateRecipients.includes(address),
    ),
    cc: [],
    bcc: [],
  }
  const hasValidationError = invalidRecipients.to.length > 0
  const recipientsChanged = !sameAddresses(recipients.to, values.to)
  // Switching the channel on is only a local change until it's applied, so it counts as a
  // pending edit in its own right - otherwise Save would stay disabled on a freshly
  // activated channel that hasn't had any other field touched yet.
  const settingsChanged =
    (selectedTemplateId ?? null) !== values.templateId ||
    recipientsChanged ||
    channelActive !== values.active
  const isFormDisabled = isDisabled || saving || isDeactivating
  // Nothing below the toggle is editable while the channel is disabled
  // settings can still be applied so the off state itself is persisted.
  const areFieldsDisabled = isFormDisabled || !channelActive
  // Before the channel has ever been saved, there's nothing to configure yet - keep the fields
  // hidden entirely until it's switched on for the first time. Once settings exist, deactivating
  // goes back to showing them disabled rather than hiding them again.
  const showFields = isConfigured || channelActive
  const isSaveDisabled = isFormDisabled || !settingsChanged || hasValidationError

  // Turning the channel on only unlocks the fields - it isn't persisted until the settings it
  // depends on are applied. Turning it off takes effect immediately, so it asks first.
  function handleSwitchChange(next: boolean) {
    if (next) {
      setChannelActive(true)
    } else {
      requestDeactivate()
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaveDisabled) {
      return
    }

    setSaving(true)
    try {
      await onSave({
        active: channelActive,
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
      })
      showSuccessToast('Settings applied: Your SMS notification settings have been saved.')
    } catch (error) {
      showErrorToast(
        `Unable to save: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <div className="events__switch-field">
        <span className="events__field-label">Activate channel</span>
        <Switch
          labelPosition="right"
          aria-label="Activate channel"
          isSelected={channelActive}
          onChange={handleSwitchChange}
          isDisabled // disable for now as SMS designs are no longer ready for dev
        >
          {channelActive ? 'On' : 'Off'}
        </Switch>
      </div>

      <ConfirmDeactivateDialog
        isOpen={isConfirmOpen}
        isBusy={isDeactivating}
        onCancel={cancelDeactivate}
        onConfirm={confirmDeactivate}
      />

      {showFields && (
        <>
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

          <StickyBar>
            <Button variant="secondary" isDisabled>
              Preview
            </Button>
            <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </StickyBar>
        </>
      )}
    </form>
  )
}

export default EventsSmsTab
