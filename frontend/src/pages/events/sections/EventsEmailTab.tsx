import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import { Button, Select } from '@bcgov/design-system-react-components'
import EventsConfirmDeactivateDialog from '../components/EventsConfirmDeactivateDialog'
import EventsChannelActiveSwitch from '../components/EventsChannelActiveSwitch'
import EventsTemplateSelect from '../components/EventsTemplateSelect'
import EventsEmailSenderField from '../components/EventsEmailSenderField'
import EventsEmailRecipientFields from '../components/EventsEmailRecipientFields'
import EventsEmailTemplatePreview from '../components/EventsEmailTemplatePreview'
import EventsEmailHeaderFields from '../components/EventsEmailHeaderFields'
import { useChannelDeactivation } from '../hooks/useChannelDeactivation'
import { useEmailHeader } from '../hooks/useEmailHeader'
import { useEmailRecipients } from '../hooks/useEmailRecipients'
import { useSenderEmail } from '../hooks/useSenderEmail'
import { validateEmailSettings } from '../utils/emailSettings'
import type { EmailSettingsValues } from '../utils/emailSettings'
import EventsEmailPreviewModal from '../components/EventsEmailPreviewModal'
import StickyBar from '@/components/StickyBar'
import UnsavedChanges from '@/components/UnsavedChanges'
import { NotificationChannel } from '@/api/templates.api'
import { useChannelTemplates } from '@/hooks/useChannelTemplates'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'
import type { CstarGroup } from '@/api/cstar.api'

// Shown by both guards on these settings: the route blocker below, and the page's own guard on
// the tab bar, which is not routing and so has to intercept the switch itself.
export const UNSAVED_EMAIL_CHANGES_MESSAGE =
  'You have unsaved changes to your email notification settings. If you leave this page, your changes will be lost.'

type EventsEmailTabProps = {
  values: EmailSettingsValues
  /** Saves the email channel settings, including whether the channel is switched on. */
  onSave: (values: EmailSettingsValues) => Promise<void>
  /** Immediately persists switching the channel off, ahead of the rest of the tab's settings. */
  onDeactivate: () => Promise<void>
  isDisabled?: boolean
  /** False until this channel has been saved for the first time (event.emailSettings is still null). */
  isConfigured: boolean
  /** Tenant's default_sender_email (local part only), used to seed the field when unset. */
  defaultSenderEmail?: string | null
  /** Approved logos available for the custom header. */
  approvedLogos?: ApprovedEmailLogo[]
  /** Tenant's configured email logo, used as the starting selection for a custom header. */
  tenantEmailLogoId?: string | null
  tenantShowsHeaderTitle?: boolean
  /** Selected tenant's name, used as the default header title. */
  tenantName?: string | null
  /**
   * Reports whether there are edits that a save has not persisted yet. The tab bar above is not
   * routing, so the blocker below cannot see it - the page owns that guard and needs to be told.
   */
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  /** The tenant's CSTAR groups, the options the group picker offers. */
  cstarGroups?: CstarGroup[]
}

const EventsEmailTab: FC<EventsEmailTabProps> = ({
  values,
  onSave,
  onDeactivate,
  isDisabled = false,
  isConfigured,
  defaultSenderEmail,
  approvedLogos = [],
  tenantEmailLogoId,
  tenantShowsHeaderTitle = false,
  tenantName,
  onUnsavedChangesChange,
  cstarGroups = [],
}) => {
  // Seeded once at mount, the same way EventsTab does it: the page passes the saved settings
  // back in via `values`, which is what the change check below compares against.
  const [channelActive, setChannelActive] = useState(values.active)
  const [senderEmail, editSenderEmail] = useSenderEmail(values.senderEmail, defaultSenderEmail)
  const recipients = useEmailRecipients(values)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const templates = useChannelTemplates(NotificationChannel.EMAIL)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )
  const header = useEmailHeader({
    saved: values,
    approvedLogos,
    tenantEmailLogoId,
    tenantShowsHeaderTitle,
    tenantName,
  })
  const [validationAttempted, setValidationAttempted] = useState(false)
  // Save button is only active if changes have been made
  const [settingsChanged, setSettingsChanged] = useState(false)
  const { isConfirmOpen, isDeactivating, requestDeactivate, cancelDeactivate, confirmDeactivate } =
    useChannelDeactivation({
      channelLabel: 'Email',
      onDeactivate,
      onActiveChange: setChannelActive,
    })

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  const trimmedSenderEmail = senderEmail.trim()
  const {
    submittedRecipients,
    submitted,
    invalidRecipients,
    recipientsHaveError,
    hasValidationError,
    senderEmailError,
    recipientSelectionError,
    templateError,
    isIncomplete,
  } = validateEmailSettings({
    senderEmail: trimmedSenderEmail,
    recipients,
    templateId: selectedTemplateId,
  })
  // Recipients validate live; the required-field errors all surface together, once a save
  // attempt has run them.
  const displayedSenderEmailError = validationAttempted ? senderEmailError : ''
  const displayedRecipientSelectionError = validationAttempted ? recipientSelectionError : ''
  const displayedTemplateError = validationAttempted ? templateError : ''
  const isFormDisabled = isDisabled || saving || isDeactivating
  // Nothing below the toggle is editable while the channel is disabled
  // settings can still be applied so the off state itself is persisted.
  const areFieldsDisabled = isFormDisabled || !channelActive
  // Before the channel has ever been saved, there's nothing to configure yet - keep the fields
  // hidden entirely until it's switched on for the first time. Once settings exist, deactivating
  // goes back to showing them disabled rather than hiding them again.
  const showFields = isConfigured || channelActive
  // Switching the channel on is only a local change until it's saved, so it counts as a
  // pending edit in its own right - otherwise Save would stay disabled on a freshly
  // activated channel that hasn't had any other field touched yet.
  const activeChanged = channelActive !== values.active
  const isSaveDisabled =
    isFormDisabled || (!settingsChanged && !activeChanged) || recipientsHaveError
  const hasUnsavedChanges = settingsChanged || activeChanged

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])

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

    // Only an active channel has to be complete, matching what the backend enforces.
    if (hasValidationError || (channelActive && isIncomplete)) {
      setValidationAttempted(true)
      showErrorToast(
        'Required fields missing',
        'Settings not saved. Complete all required fields before saving.',
      )
      return
    }

    setSaving(true)
    try {
      await onSave({
        active: channelActive,
        senderEmail: trimmedSenderEmail,
        templateId: selectedTemplateId ?? null,
        ...submitted,
        ...header.submitted,
      })
      setValidationAttempted(false)
      setSettingsChanged(false)
      showSuccessToast('Settings saved: Your email notification settings have been saved.')
    } catch (error) {
      showErrorToast(
        `Unable to save settings: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="events__form" onSubmit={handleSubmit}>
      <EventsChannelActiveSwitch
        isSelected={channelActive}
        onChange={handleSwitchChange}
        isDisabled={isFormDisabled}
      />

      <EventsConfirmDeactivateDialog
        isOpen={isConfirmOpen}
        isBusy={isDeactivating}
        onCancel={cancelDeactivate}
        onConfirm={confirmDeactivate}
      />

      {/** Prompts the user if they attempt to navigate away from the page with unsaved changes */}
      <UnsavedChanges
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={saving}
        modalMessage={UNSAVED_EMAIL_CHANGES_MESSAGE}
      />

      {showFields && (
        <>
          <EventsEmailSenderField
            value={senderEmail}
            onChange={(value) => {
              editSenderEmail(value)
              setSettingsChanged(true)
            }}
            isDisabled={areFieldsDisabled}
            errorMessage={displayedSenderEmailError}
          />

          <EventsEmailRecipientFields
            recipients={recipients}
            invalidAddresses={invalidRecipients}
            cstarGroups={cstarGroups}
            isDisabled={areFieldsDisabled}
            errorMessage={displayedRecipientSelectionError}
            onChange={() => setSettingsChanged(true)}
          />

          <EventsTemplateSelect
            templates={templates}
            value={selectedTemplateId}
            onChange={(templateId) => {
              setSelectedTemplateId(templateId)
              setSettingsChanged(true)
            }}
            size="small"
            isDisabled={areFieldsDisabled}
            errorMessage={displayedTemplateError}
          />

          {selectedTemplate && (
            <EventsEmailTemplatePreview
              subject={selectedTemplate.subject}
              body={selectedTemplate.body}
              isDisabled={areFieldsDisabled}
            />
          )}

          <EventsEmailHeaderFields
            header={header}
            isDisabled={areFieldsDisabled}
            onChange={() => setSettingsChanged(true)}
          />

          <Select
            label="Attachment service"
            placeholder="Select an attachment..."
            items={[{ id: 'not-implemented', label: 'Not implemented' }]}
            size="small"
            isDisabled
          />

          {selectedTemplate && (
            <EventsEmailPreviewModal
              isOpen={previewOpen}
              onClose={() => setPreviewOpen(false)}
              template={selectedTemplate}
              senderEmail={trimmedSenderEmail}
              toAddresses={submittedRecipients.to}
              ccAddresses={submittedRecipients.cc}
              bccAddresses={submittedRecipients.bcc}
            />
          )}

          <StickyBar>
            <Button
              variant="secondary"
              type="button"
              onPress={() => setPreviewOpen(true)}
              isDisabled={areFieldsDisabled || !selectedTemplate}
            >
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

export default EventsEmailTab
