import { useEffect, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  AlertDialog,
  Button,
  Checkbox,
  CheckboxGroup,
  Modal,
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
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'

const SENDER_EMAIL_TOOLTIP =
  'Replies and bounce messages may be sent to this address, but the inbox is not monitored.'

// Tenant default_sender_email stores only the local part (before @gov.bc.ca); matches the
// suffix shown on the Settings > Email tab.
const SENDER_EMAIL_DOMAIN = 'gov.bc.ca'

// Header, footer and attachment service are not implemented yet.
const NOT_IMPLEMENTED_ITEMS = [{ id: 'not-implemented', label: 'Not implemented' }]

// Subscription service and CSTAR group recipients are not implemented yet.
const SUBSCRIPTION_SERVICE_ID = 'subscription-service'
const CSTAR_GROUPS_ID = 'cstar-groups'
const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

export type EmailSettingsValues = {
  active: boolean
  /** True while this channel has unapplied "Save draft" edits - lets Apply settings run even without further changes, since applying clears it. */
  isDraft: boolean
  senderEmail: string
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
}

// The Apply/Save draft payloads exclude `active` - the "Channel active" toggle saves itself
// immediately via onActiveChange, separate from the rest of the tab's settings - and `isDraft`,
// which the backend derives rather than accepts.
export type EmailApplyValues = Omit<EmailSettingsValues, 'active' | 'isDraft'>

export type EmailDraftValues = {
  senderEmail: string | null
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
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
  /** False until this channel has been saved for the first time (event.emailSettings is still null). */
  isConfigured: boolean
  /** Tenant's default_sender_email (local part only), used to seed the field when unset. */
  defaultSenderEmail?: string | null
}

const EventsEmailTab: FC<EventsEmailTabProps> = ({
  values,
  onSave,
  onSaveDraft,
  onActiveChange,
  isDisabled = false,
  isConfigured,
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
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )
  // Validation errors only surface after a Save draft / Apply settings attempt, not on every keystroke.
  const [validationAttempted, setValidationAttempted] = useState(false)
  // Flipped on by any edit below and only cleared by a successful save - editing a field back to
  // its saved value still counts as a change.
  const [settingsChanged, setSettingsChanged] = useState(false)

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
  const recipientsHaveError =
    invalidRecipients.to.length > 0 ||
    invalidRecipients.cc.length > 0 ||
    invalidRecipients.bcc.length > 0
  const hasValidationError = Boolean(senderEmailError) || recipientsHaveError
  // Only blocks Apply settings - a draft is allowed to have no recipients picked yet.
  const recipientSelectionError =
    selectedRecipients.length === 0 ? 'Select at least one recipient.' : ''
  // Recipients validate live; the sender email error only surfaces once a save attempt has run it.
  const displayedSenderEmailError = validationAttempted ? senderEmailError : ''
  const displayedRecipientSelectionError = validationAttempted ? recipientSelectionError : ''
  const isFormDisabled = isDisabled || saving || savingDraft || togglingActive
  // Nothing below the toggle is editable while the channel is disabled
  // settings can still be applied so the off state itself is persisted.
  const areFieldsDisabled = isFormDisabled || !channelActive
  // Before the channel has ever been saved, there's nothing to configure yet - keep the fields
  // hidden entirely until it's switched on for the first time. Once settings exist, deactivating
  // goes back to showing them disabled rather than hiding them again.
  const showFields = isConfigured || channelActive
  // A draft channel's settings haven't been applied yet, so Apply settings stays enabled even
  // without further edits - clicking it (once valid) both applies the current values and clears
  // isDraft.
  const isApplyDisabled =
    isFormDisabled || (!settingsChanged && !values.isDraft) || recipientsHaveError

  async function handleActiveChange(next: boolean) {
    const previous = channelActive
    setChannelActive(next)
    setTogglingActive(true)
    try {
      await onActiveChange(next)
      showSuccessToast(
        next
          ? 'Email channel reactivated: This channel is now active and can send notifications. Your settings have been restored, and you can make changes at any time.'
          : 'Email channel deactivated: This channel is no longer active and will not send notifications. Your settings are saved and can be reactivated at any time.',
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

    if (hasValidationError || recipientSelectionError) {
      setValidationAttempted(true)
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
      setValidationAttempted(false)
      setSettingsChanged(false)
      showSuccessToast('Settings applied: Your email notification settings have been saved.')
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
      setValidationAttempted(true)
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
      setValidationAttempted(false)
      setSettingsChanged(false)
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
      <h2 className="events__section-heading">Email Notification Settings</h2>

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
        aria-label="Deactivate this channel?"
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivateOpen(false)
        }}
      >
        <AlertDialog
          variant="confirmation"
          isIconHidden
          title="Deactivate this channel?"
          buttons={
            <>
              <Button
                variant="tertiary"
                onPress={() => setConfirmDeactivateOpen(false)}
                isDisabled={togglingActive}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                danger
                onPress={handleConfirmDeactivate}
                isDisabled={togglingActive}
              >
                Deactivate
              </Button>
            </>
          }
        >
          This will stop notifications from being sent through this channel. Your settings will be
          saved and can be reactivated at any time.
        </AlertDialog>
      </Modal>

      {showFields && (
        <>
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
            onChange={(value) => {
              setSenderEmail(value)
              setSettingsChanged(true)
            }}
            description="The default sender email is based on your tenant but can be changed. It must be linked to a registered IDIR account or an approved email address."
            size="small"
            isDisabled={areFieldsDisabled}
            isRequired
            isInvalid={displayedSenderEmailError ? true : undefined}
            errorMessage={displayedSenderEmailError || 'Sender email address cannot be empty.'}
          />

          <CheckboxGroup
            label="Recipient(s)"
            value={selectedRecipients}
            onChange={(value) => {
              setSelectedRecipients(value)
              setSettingsChanged(true)
            }}
            isDisabled={areFieldsDisabled}
            isRequired
            // Native validation flags an empty group as soon as it is touched; drive the error
            // from validationAttempted instead so it only appears after Apply settings.
            validationBehavior="aria"
            isInvalid={Boolean(displayedRecipientSelectionError)}
            errorMessage={displayedRecipientSelectionError}
          >
            <Checkbox value={SUBSCRIPTION_SERVICE_ID} isDisabled>
              Subscription Service
            </Checkbox>
            <Checkbox value={CSTAR_GROUPS_ID} isDisabled>
              CSTAR Group(s)
            </Checkbox>
            <Checkbox value={ADDITIONAL_RECIPIENTS_ID}>Additional recipient(s)</Checkbox>
          </CheckboxGroup>

          {selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID) && (
            <EventsAdditionalRecipients
              values={recipients}
              onChange={(value) => {
                setRecipients(value)
                setSettingsChanged(true)
              }}
              invalidAddresses={invalidRecipients}
              isDisabled={areFieldsDisabled}
            />
          )}

          <Select
            label="Template"
            placeholder="Select a template..."
            items={templateItems}
            value={selectedTemplateId}
            onChange={(key) => {
              setSelectedTemplateId(key == null ? undefined : String(key))
              setSettingsChanged(true)
            }}
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
              isDisabled={isFormDisabled || !settingsChanged || recipientsHaveError}
              onPress={handleSaveDraft}
            >
              {savingDraft ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="submit" variant="primary" isDisabled={isApplyDisabled}>
              {saving ? 'Saving…' : 'Apply settings'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

export default EventsEmailTab
