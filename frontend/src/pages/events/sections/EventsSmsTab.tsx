import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  Button,
  Callout,
  Checkbox,
  CheckboxGroup,
  Select,
  Switch,
  TextArea,
  TextField,
} from '@bcgov/design-system-react-components'
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import ConfirmDeactivateDialog from '../components/ConfirmDeactivateDialog'
import { useChannelDeactivation } from '../hooks/useChannelDeactivation'
import StickyBar from '@/components/StickyBar'
import UnsavedChanges from '@/components/UnsavedChanges'
import { NotificationChannel } from '@/api/templates.api'
import { useChannelTemplates } from '@/hooks/useChannelTemplates'
import { sameAddresses } from '@/utils/recipients'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import EventsSmsPreviewModal from './EventsSmsPreviewModal'
import EventsSmsEstimate from '../components/EventsSmsEstimate'

export const UNSAVED_SMS_CHANGES_MESSAGE =
  'You have unsaved changes to your SMS notification settings. If you leave this page, your changes will be lost.'
export type SmsSettingsValues = { active: boolean; templateId: string | null; to: string[] }
export type SmsApplyValues = SmsSettingsValues
const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

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
  onSave: (values: SmsApplyValues) => Promise<void>
  onDeactivate: () => Promise<void>
  isDisabled?: boolean
  isConfigured: boolean
  onUnsavedChangesChange?: (value: boolean) => void
  smsNotificationsEnabled?: boolean
}

export default function EventsSmsTab({
  values,
  onSave,
  onDeactivate,
  isDisabled = false,
  isConfigured,
  onUnsavedChangesChange,
  smsNotificationsEnabled,
}: EventsSmsTabProps) {
  const [channelActive, setChannelActive] = useState(values.active)
  const [to, setTo] = useState(values.to)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    values.to.length ? [ADDITIONAL_RECIPIENTS_ID] : [],
  )
  const [templateId, setTemplateId] = useState<string | undefined>(values.templateId ?? undefined)
  const [saving, setSaving] = useState(false)
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showSaved, setShowSaved] = useState(isConfigured)
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({})
  const templates = useChannelTemplates(NotificationChannel.SMS)
  const selectedTemplate = templates.find((template) => template.id === templateId)
  const { isConfirmOpen, isDeactivating, requestDeactivate, cancelDeactivate, confirmDeactivate } =
    useChannelDeactivation({ channelLabel: 'SMS', onDeactivate, onActiveChange: setChannelActive })
  const submittedTo = selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) ? to : []
  const duplicates = duplicatePhoneNumbers(submittedTo)
  const invalid = submittedTo.filter(
    (number) => !isValidPhone(number) || duplicates.includes(number),
  )
  const recipientError = submittedTo.length ? '' : 'Please select at least one recipient.'
  const templateError = selectedTemplate ? '' : 'Please select a template.'
  const busy = saving || isDeactivating
  const disabled = isDisabled || busy
  const hasUnsavedChanges =
    !showSaved &&
    ((templateId ?? null) !== values.templateId ||
      !sameAddresses(submittedTo, values.to) ||
      selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) !== Boolean(values.to.length))

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])
  useEffect(() => {
    setTo(values.to)
  }, [values.to])

  function validate(action: 'Save' | 'Preview') {
    setValidationAttempted(true)
    if (recipientError || templateError || invalid.length) {
      showErrorToast(
        'Required fields missing or invalid',
        action === 'Save'
          ? 'Settings not saved. Complete all required fields before saving.'
          : 'Preview not available. Complete all required fields before previewing.',
      )
      return false
    }
    return true
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !validate('Save')) return
    setSaving(true)
    try {
      // Number provisioning is not available yet. Configuration is persisted without activating delivery.
      await onSave({ active: false, templateId: templateId ?? null, to: submittedTo })
      setChannelActive(false)
      setValidationAttempted(false)
      setShowSaved(true)
      showSuccessToast(
        'Settings saved',
        'SMS notification settings were saved. Delivery remains inactive until a sender number is assigned.',
      )
    } catch (error) {
      showErrorToast(
        'Unable to save settings',
        error instanceof Error ? error.message : 'Something went wrong. Try again in a moment.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <UnsavedChanges
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={saving}
        modalMessage={UNSAVED_SMS_CHANGES_MESSAGE}
      />
      {showSaved ? (
        <>
          <Callout
            variant="lightGrey"
            title="SMS settings saved"
            description="Your configuration is saved. SMS delivery and test notifications will be available once a sender phone number is assigned."
          />
          {selectedTemplate ? (
            <div className="events__saved-preview">
              <p className="events__template-preview-content">{selectedTemplate.body}</p>
              <EventsSmsEstimate body={selectedTemplate.body} />
            </div>
          ) : (
            <p className="events__help">
              The saved template preview is unavailable. Open settings to select a template.
            </p>
          )}
          <StickyBar>
            <Button type="button" variant="secondary" onPress={() => setShowSaved(false)}>
              Edit settings
            </Button>
            <Button type="button" variant="primary" isDisabled>
              Continue to test notification
            </Button>
          </StickyBar>
        </>
      ) : (
        <form className="events__form" onSubmit={handleSubmit} noValidate>
          <div className="events__switch-field">
            <span className="events__field-label">Activate channel</span>
            <Switch
              labelPosition="right"
              aria-label="Activate channel"
              isSelected={channelActive}
              onChange={requestDeactivate}
              isDisabled={!channelActive || disabled}
            >
              {channelActive ? 'On' : 'Off'}
            </Switch>
          </div>
          <Callout
            variant="lightGrey"
            title="Sender number not assigned"
            description="You can configure, preview, and save SMS settings now. Delivery stays inactive until a sender phone number is assigned."
          />
          {smsNotificationsEnabled === false && (
            <p className="events__help">
              SMS notifications are also turned off in tenant Settings. An administrator must enable
              them before SMS can be sent.
            </p>
          )}
          <TextField
            label="Sender phone number"
            value="Not assigned"
            size="small"
            isReadOnly
            description="Sender number assignment is pending. You do not need a sender number to save inactive settings or preview a message."
          />
          <CheckboxGroup
            label="Recipient(s)"
            value={selectedRecipients}
            onChange={setSelectedRecipients}
            isDisabled={disabled}
            isRequired
            validationBehavior="aria"
            isInvalid={validationAttempted && Boolean(recipientError)}
            errorMessage={recipientError}
          >
            <Checkbox value="subscription-service" isDisabled>
              Subscription Service
            </Checkbox>
            <Checkbox value="cstar-groups" isDisabled>
              CSTAR Group(s)
            </Checkbox>
            <Checkbox value={ADDITIONAL_RECIPIENTS_ID}>Additional recipient(s)</Checkbox>
          </CheckboxGroup>
          {selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) && (
            <EventsAdditionalRecipients
              values={{ to, cc: [], bcc: [] }}
              onChange={(recipients) => setTo(recipients.to)}
              invalidAddresses={{ to: invalid, cc: [], bcc: [] }}
              isDisabled={disabled}
              variant="sms"
            />
          )}
          <Select
            label="Template"
            placeholder="Select a template..."
            items={templates.map((template) => ({ id: template.id, label: template.name }))}
            value={templateId}
            onChange={(key) => {
              setTemplateId(key == null ? undefined : String(key))
              setSampleValues({})
            }}
            size="small"
            isDisabled={disabled}
            isRequired
            validationBehavior="aria"
            isInvalid={validationAttempted && Boolean(templateError)}
            errorMessage={templateError}
          />
          {selectedTemplate && (
            <div className="events__template-preview events__template-preview--auto-size">
              <TextArea label="Template Preview" value={selectedTemplate.body} isReadOnly />
              <EventsSmsEstimate body={selectedTemplate.body} />
              <p className="events__help">
                Estimates change when template variables are replaced. Any tenant-name prefix added
                when sending is not included.
              </p>
            </div>
          )}
          <StickyBar>
            <Button
              type="button"
              variant="secondary"
              isDisabled={disabled}
              onPress={() => {
                if (validate('Preview')) setPreviewOpen(true)
              }}
            >
              Preview
            </Button>
            <Button type="submit" variant="primary" isDisabled={disabled}>
              {saving ? 'Saving?' : 'Save'}
            </Button>
          </StickyBar>
        </form>
      )}
      <ConfirmDeactivateDialog
        isOpen={isConfirmOpen}
        isBusy={isDeactivating}
        onCancel={cancelDeactivate}
        onConfirm={confirmDeactivate}
      />
      {previewOpen && selectedTemplate && (
        <EventsSmsPreviewModal
          key={selectedTemplate.id}
          template={selectedTemplate}
          to={submittedTo}
          initialValues={sampleValues}
          onClose={() => setPreviewOpen(false)}
          onSaveValues={(next) => {
            setSampleValues(next)
            setPreviewOpen(false)
          }}
        />
      )}
    </>
  )
}
