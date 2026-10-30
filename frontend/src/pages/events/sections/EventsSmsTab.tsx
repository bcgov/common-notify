import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Button, TextField } from '@bcgov/design-system-react-components'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import ConfirmDeactivateDialog from '../components/ConfirmDeactivateDialog'
import ChannelActiveSwitch from '../components/ChannelActiveSwitch'
import RecipientSourcesGroup from '../components/RecipientSourcesGroup'
import TemplateSelect from '../components/TemplateSelect'
import { ADDITIONAL_RECIPIENTS_ID } from '../constants'
import { useChannelDeactivation } from '../hooks/useChannelDeactivation'
import StickyBar from '@/components/StickyBar'
import UnsavedChanges from '@/components/UnsavedChanges'
import { NotificationChannel } from '@/api/templates.api'
import { useChannelTemplates } from '@/hooks/useChannelTemplates'
import { sameAddresses } from '@/utils/recipients'
import { duplicatePhoneNumbers, isInternationalPhone, isValidPhone } from '@/utils/phoneNumbers'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import EventsSmsPreviewModal from './EventsSmsPreviewModal'
import EventsSmsTemplatePreview from '../components/EventsSmsTemplatePreview'

export const UNSAVED_SMS_CHANGES_MESSAGE =
  'You have unsaved changes to your SMS notification settings. If you leave this page, your changes will be lost.'
export type SmsSettingsValues = { active: boolean; templateId: string | null; to: string[] }

type EventsSmsTabProps = Readonly<{
  values: SmsSettingsValues
  onSave: (values: SmsSettingsValues) => Promise<void>
  onDeactivate: () => Promise<void>
  isDisabled?: boolean
  isConfigured: boolean
  onUnsavedChangesChange?: (value: boolean) => void
  smsNotificationsEnabled?: boolean
  senderPhoneNumber?: string | null
  /** Whether the international_sms flag and the tenant's International SMS setting are both on. */
  internationalSmsAllowed?: boolean
}>

export default function EventsSmsTab({
  values,
  onSave,
  onDeactivate,
  isDisabled = false,
  isConfigured,
  onUnsavedChangesChange,
  smsNotificationsEnabled,
  senderPhoneNumber,
  internationalSmsAllowed = false,
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
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({})
  const [recipientsResetKey, setRecipientsResetKey] = useState(0)
  const templates = useChannelTemplates(NotificationChannel.SMS)
  const selectedTemplate = templates.find((template) => template.id === templateId)
  const { isConfirmOpen, isDeactivating, requestDeactivate, cancelDeactivate, confirmDeactivate } =
    useChannelDeactivation({
      channelLabel: 'SMS',
      onDeactivate: async () => {
        await onDeactivate()
        // Deactivation preserves persisted settings, not the edits currently in the form.
        setTemplateId(values.templateId ?? undefined)
        setTo(values.to)
        setSelectedRecipients(values.to.length ? [ADDITIONAL_RECIPIENTS_ID] : [])
        setValidationAttempted(false)
        setSampleValues({})
        setPreviewOpen(false)
        // Also discard any phone number still being typed inside the recipient field.
        setRecipientsResetKey((key) => key + 1)
      },
      onActiveChange: setChannelActive,
    })
  const submittedTo = selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) ? to : []
  const duplicates = duplicatePhoneNumbers(submittedTo)
  const invalid = submittedTo.filter(
    (number) => !isValidPhone(number) || duplicates.includes(number),
  )
  const international = internationalSmsAllowed
    ? []
    : submittedTo.filter((number) => isInternationalPhone(number) && !invalid.includes(number))
  const recipientError = submittedTo.length ? '' : 'Select at least one recipient'
  const templateError = selectedTemplate ? '' : 'Select a template'
  const busy = saving || isDeactivating
  const disabled = isDisabled || busy
  const showFields = isConfigured || channelActive
  const fieldsDisabled = disabled || !channelActive
  const hasUnsavedChanges =
    channelActive !== values.active ||
    (templateId ?? null) !== values.templateId ||
    !sameAddresses(submittedTo, values.to) ||
    selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) !== Boolean(values.to.length)

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])
  useEffect(() => {
    setTo(values.to)
  }, [values.to])

  function validate(action: 'Save' | 'Preview') {
    if (!channelActive) return false
    setValidationAttempted(true)
    if (senderError || recipientError || templateError || invalid.length || international.length) {
      showErrorToast(
        'Required fields missing',
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
      <form className="events__form" onSubmit={handleSubmit} noValidate>
        <ChannelActiveSwitch
          isSelected={channelActive}
          onChange={(next) => {
            if (next) setChannelActive(true)
            else if (values.active) requestDeactivate()
            else setChannelActive(false)
          }}
          isDisabled={disabled || (!channelActive && smsNotificationsEnabled === false)}
        />
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
              size="medium"
              isReadOnly
              isDisabled={fieldsDisabled}
              description="Your default phone number from your account (IDIR) will be used. The number must be registered before it can send notifications through this service."
            />
            <RecipientSourcesGroup
              value={selectedRecipients}
              onChange={setSelectedRecipients}
              isDisabled={fieldsDisabled}
              errorMessage={validationAttempted ? recipientError : undefined}
              isCstarEnabled={false}
            />
            {selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) && (
              <EventsAdditionalRecipients
                key={recipientsResetKey}
                values={{ to, cc: [], bcc: [] }}
                onChange={(recipients) => setTo(recipients.to)}
                invalidAddresses={{ to: invalid, cc: [], bcc: [] }}
                internationalAddresses={international}
                isDisabled={fieldsDisabled}
                variant="sms"
              />
            )}
            <TemplateSelect
              templates={templates}
              value={templateId}
              onChange={(nextTemplateId) => {
                setTemplateId(nextTemplateId)
                setSampleValues({})
              }}
              size="medium"
              isDisabled={fieldsDisabled}
              errorMessage={validationAttempted ? templateError : undefined}
            />
            {selectedTemplate && (
              <EventsSmsTemplatePreview body={selectedTemplate.body} isDisabled={fieldsDisabled} />
            )}
          </>
        )}
        {showFields && (
          <StickyBar>
            <Button
              type="button"
              variant="secondary"
              isDisabled={fieldsDisabled}
              onPress={() => {
                if (validate('Preview')) setPreviewOpen(true)
              }}
            >
              Preview
            </Button>
            <Button type="submit" variant="primary" isDisabled={fieldsDisabled}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </StickyBar>
        )}
      </form>
      <ConfirmDeactivateDialog
        description="This will stop notifications from being sent through this channel. Your previously saved settings will be preserved and can be reactivated at any time. Unsaved changes will be discarded. Previously sent notifications and their records will not be affected."
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
