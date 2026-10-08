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
  senderPhoneNumber?: string | null
}

export default function EventsSmsTab({
  values,
  onSave,
  onDeactivate,
  isDisabled = false,
  isConfigured,
  onUnsavedChangesChange,
  smsNotificationsEnabled,
  senderPhoneNumber,
}: EventsSmsTabProps) {
  const senderError = senderPhoneNumber
    ? ''
    : 'A sender number must be assigned to your tenant before SMS can be activated.'
  const [channelActive, setChannelActive] = useState(values.active)
  const [to, setTo] = useState(values.to)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    values.to.length ? [ADDITIONAL_RECIPIENTS_ID] : [],
  )
  const [templateId, setTemplateId] = useState<string | undefined>(values.templateId ?? undefined)
  const [saving, setSaving] = useState(false)
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showSaved, setShowSaved] = useState(isConfigured && values.active)
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
  const showFields = isConfigured || channelActive
  const fieldsDisabled = disabled || !channelActive
  const hasUnsavedChanges =
    !showSaved &&
    (channelActive !== values.active ||
      (templateId ?? null) !== values.templateId ||
      !sameAddresses(submittedTo, values.to) ||
      selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) !== Boolean(values.to.length))

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])
  useEffect(() => {
    setTo(values.to)
  }, [values.to])

  function validate(action: 'Save' | 'Preview') {
    if (!showFields) {
      showErrorToast('Channel is off', 'Activate the SMS channel to configure its settings.')
      return false
    }
    setValidationAttempted(true)
    if (senderError || recipientError || templateError || invalid.length) {
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
      await onSave({
        active: channelActive,
        templateId: templateId ?? null,
        to: submittedTo,
      })
      setValidationAttempted(false)
      setShowSaved(true)
      showSuccessToast(
        'Settings saved',
        channelActive
          ? 'SMS notification settings were updated successfully.'
          : 'SMS notification settings were saved with delivery inactive.',
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
            title={channelActive ? 'Ready to send?' : 'SMS settings saved'}
            description={
              channelActive
                ? 'Your SMS settings are ready. Continue to select recipients and send a test notification to verify the content and formatting.'
                : 'Your SMS settings are saved. Activate this channel when you are ready to send notifications.'
            }
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
          <p className="events__help">Test notifications are not available yet.</p>
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
              onChange={(next) => {
                if (next) setChannelActive(true)
                else if (values.active) requestDeactivate()
                else setChannelActive(false)
              }}
              isDisabled={disabled || (!channelActive && smsNotificationsEnabled === false)}
            >
              {channelActive ? 'On' : 'Off'}
            </Switch>
          </div>
          {smsNotificationsEnabled === false && (
            <p className="events__help">
              SMS notifications are also turned off in tenant Settings. An administrator must enable
              them before SMS can be sent.
            </p>
          )}
          {showFields && (
            <>
              <TextField
                label="Sender phone number"
                value={senderPhoneNumber ?? 'Not assigned'}
                isRequired
                validationBehavior="aria"
                isInvalid={validationAttempted && Boolean(senderError)}
                errorMessage={senderError}
                size="small"
                isReadOnly
                isDisabled={fieldsDisabled}
                description={
                  senderPhoneNumber
                    ? 'This number is assigned to your tenant and is shared by its SMS events.'
                    : 'Your administrator assigns the sender number for your tenant.'
                }
              />
              <CheckboxGroup
                label="Recipient(s)"
                value={selectedRecipients}
                onChange={setSelectedRecipients}
                isDisabled={fieldsDisabled}
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
                  isDisabled={fieldsDisabled}
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
                isDisabled={fieldsDisabled}
                isRequired
                validationBehavior="aria"
                isInvalid={validationAttempted && Boolean(templateError)}
                errorMessage={templateError}
              />
              {selectedTemplate && (
                <div className="events__template-preview events__template-preview--auto-size">
                  <TextArea
                    label="Template Preview"
                    value={selectedTemplate.body}
                    isReadOnly
                    isDisabled={fieldsDisabled}
                  />
                  <EventsSmsEstimate body={selectedTemplate.body} />
                  <p className="events__help">
                    Estimates change when template variables are replaced. Any tenant-name prefix
                    added when sending is not included.
                  </p>
                </div>
              )}
            </>
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
              {saving ? 'Saving...' : 'Save'}
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
          senderPhoneNumber={senderPhoneNumber}
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
