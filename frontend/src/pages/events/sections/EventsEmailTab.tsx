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
  senderEmail: string
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
}

// The Apply payload carries `active` - switching the channel on is only persisted here, since
// the backend requires a complete set of settings alongside it. Turning it off is the one thing
// that saves on its own, via onDeactivate.
export type EmailApplyValues = EmailSettingsValues

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

function isValidEmail(value: string): boolean {
  return value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)
}

type EventsEmailTabProps = {
  values: EmailSettingsValues
  /** Saves the email channel settings, including whether the channel is switched on. */
  onSave: (values: EmailApplyValues) => Promise<void>
  /** Immediately persists switching the channel off, ahead of the rest of the tab's settings. */
  onDeactivate: () => Promise<void>
  isDisabled?: boolean
  /** False until this channel has been saved for the first time (event.emailSettings is still null). */
  isConfigured: boolean
  /** Tenant's default_sender_email (local part only), used to seed the field when unset. */
  defaultSenderEmail?: string | null
}

const EventsEmailTab: FC<EventsEmailTabProps> = ({
  values,
  onSave,
  onDeactivate,
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
  const [deactivating, setDeactivating] = useState(false)
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )
  const [validationAttempted, setValidationAttempted] = useState(false)
  // Save button is only active if changes have been made
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
  const recipientSelectionError =
    selectedRecipients.length === 0 ? 'Select at least one recipient.' : ''
  // Recipients validate live; the sender email error only surfaces once a save attempt has run it.
  const displayedSenderEmailError = validationAttempted ? senderEmailError : ''
  const displayedRecipientSelectionError = validationAttempted ? recipientSelectionError : ''
  const isFormDisabled = isDisabled || saving || deactivating
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

  // Turning the channel on only unlocks the fields - it isn't persisted until the settings it
  // depends on are applied. Turning it off takes effect immediately, so it asks first.
  function handleSwitchChange(next: boolean) {
    if (next) {
      setChannelActive(true)
    } else {
      setConfirmDeactivateOpen(true)
    }
  }

  async function handleConfirmDeactivate() {
    setConfirmDeactivateOpen(false)
    setChannelActive(false)
    setDeactivating(true)
    try {
      await onDeactivate()
      showSuccessToast(
        'Email channel deactivated: This channel is no longer active and will not send notifications. Your settings are saved and can be reactivated at any time.',
      )
    } catch (error) {
      setChannelActive(true)
      showErrorToast(
        `Unable to update channel: ${error instanceof Error ? error.message : 'Something went wrong.'}`,
      )
    } finally {
      setDeactivating(false)
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaveDisabled) {
      return
    }

    // Only an active channel has to be complete, matching what the backend enforces.
    if (hasValidationError || (channelActive && recipientSelectionError)) {
      setValidationAttempted(true)
      return
    }

    setSaving(true)
    try {
      await onSave({
        active: channelActive,
        senderEmail: trimmedSenderEmail,
        templateId: selectedTemplateId ?? null,
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
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
        isDismissable={!deactivating}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivateOpen(false)
        }}
      >
        <AlertDialog
          variant="confirmation"
          isIconHidden
          title="Deactivate this channel?"
          // AlertDialog renders `title` as a plain div rather than a <Heading slot="title">, so
          // the underlying Dialog needs an explicit label.
          aria-label="Deactivate this channel?"
          buttons={
            <>
              <Button
                variant="tertiary"
                onPress={() => setConfirmDeactivateOpen(false)}
                isDisabled={deactivating}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                danger
                onPress={handleConfirmDeactivate}
                isDisabled={deactivating}
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
            // from validationAttempted instead so it only appears after a save attempt.
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
            <Button type="submit" variant="primary" isDisabled={isSaveDisabled}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

export default EventsEmailTab
