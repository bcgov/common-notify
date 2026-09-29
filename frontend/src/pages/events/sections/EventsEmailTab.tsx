import { useEffect, useRef, useState } from 'react'
import type { FC, SubmitEvent } from 'react'
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Radio,
  RadioGroup,
  Select,
  Switch,
  TextField,
  Tooltip,
  TooltipTrigger,
  SvgInfoIcon,
} from '@bcgov/design-system-react-components'
import EventsAdditionalRecipients from '../components/EventsAdditionalRecipients'
import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import EventsCstarGroups from '../components/EventsCstarGroups'
import type { CstarGroupSelections } from '../components/EventsCstarGroups'
import ConfirmDeactivateDialog from '../components/ConfirmDeactivateDialog'
import { useChannelDeactivation } from '../hooks/useChannelDeactivation'
import EventsEmailPreviewModal from './EventsEmailPreviewModal'
import StickyBar from '@/components/StickyBar'
import { NotificationChannel } from '@/api/templates.api'
import { useChannelTemplates } from '@/hooks/useChannelTemplates'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'
import type { CstarGroup } from '@/api/cstar.api'

const SENDER_EMAIL_TOOLTIP =
  'Replies and bounce messages may be sent to this address, but the inbox is not monitored.'

// Tenant default_sender_email stores only the local part (before @gov.bc.ca); matches the
// suffix shown on the Settings > Email tab. The backend holds an event's sender to this same
// domain (events.senderEmailDomain), so entering anything else is rejected there too.
const SENDER_EMAIL_DOMAIN = 'gov.bc.ca'

const HEADER_TENANT_DEFAULT_ID = 'tenant-default'
const HEADER_CUSTOM_ID = 'custom'
// Sentinel for the "No logo" entry in the logo select; saved as a null headerLogoId.
const NO_LOGO_ID = 'no-logo'

// Subscription service recipients are not implemented yet.
const SUBSCRIPTION_SERVICE_ID = 'subscription-service'
const CSTAR_GROUPS_ID = 'cstar-groups'
const ADDITIONAL_RECIPIENTS_ID = 'additional-recipients'

// What a recipient source contributes while its checkbox is off. Its own fields are left holding
// what was entered, so checking it back on restores them, but nothing there is saved or validated.
const NO_SELECTION: RecipientAddresses & CstarGroupSelections = { to: [], cc: [], bcc: [] }

export type EmailSettingsValues = {
  active: boolean
  senderEmail: string
  templateId: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  /** CSTAR groups addressed in each field; only the group IDs, resolved to people at send time. */
  cstarGroupIdsTo: string[]
  cstarGroupIdsCc: string[]
  cstarGroupIdsBcc: string[]
  useCustomHeader: boolean
  headerLogoId: string | null
  headerTitle: string
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

/** Empty string when the address is usable as a sender; otherwise why it isn't. */
function senderEmailProblem(value: string): string {
  if (value === '') return ''
  if (!isValidEmail(value)) return 'Enter a valid sender email address.'
  if (value.toLowerCase().split('@').pop() !== SENDER_EMAIL_DOMAIN) {
    return `The sender email address must be an @${SENDER_EMAIL_DOMAIN} address.`
  }
  return ''
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
  /** Approved logos available for the custom header. */
  approvedLogos?: ApprovedEmailLogo[]
  /** Tenant's configured email logo, used as the starting selection for a custom header. */
  tenantEmailLogoId?: string | null
  /** Selected tenant's name, used as the default header title. */
  tenantName?: string | null
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
  tenantName,
  cstarGroups = [],
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
  const [groupSelections, setGroupSelections] = useState<CstarGroupSelections>({
    to: values.cstarGroupIdsTo,
    cc: values.cstarGroupIdsCc,
    bcc: values.cstarGroupIdsBcc,
  })
  // A source is shown as chosen when the saved settings carry anything for it, so the tab opens
  // on what the event actually sends to.
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(() => {
    const sources: string[] = []
    if (
      values.cstarGroupIdsTo.length ||
      values.cstarGroupIdsCc.length ||
      values.cstarGroupIdsBcc.length
    ) {
      sources.push(CSTAR_GROUPS_ID)
    }
    if (values.to.length || values.cc.length || values.bcc.length) {
      sources.push(ADDITIONAL_RECIPIENTS_ID)
    }
    return sources
  })
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const templates = useChannelTemplates(NotificationChannel.EMAIL)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    values.templateId ?? undefined,
  )
  // A saved custom header is shown as saved; otherwise the fields start on the tenant's own logo
  // and name, so switching to Custom opens on a sensible default rather than empty controls.
  const [headerMode, setHeaderMode] = useState(
    values.useCustomHeader ? HEADER_CUSTOM_ID : HEADER_TENANT_DEFAULT_ID,
  )
  const [headerLogoId, setHeaderLogoId] = useState<string | undefined>(
    values.useCustomHeader ? (values.headerLogoId ?? NO_LOGO_ID) : (tenantEmailLogoId ?? undefined),
  )
  const [headerTitle, setHeaderTitle] = useState(
    values.useCustomHeader ? values.headerTitle : (tenantName ?? ''),
  )
  const [validationAttempted, setValidationAttempted] = useState(false)
  // Save button is only active if changes have been made
  const [settingsChanged, setSettingsChanged] = useState(false)
  // Once the field has been edited it is the user's, including when they empty it - the tenant
  // default must not be reapplied on top of a deliberately cleared field.
  const senderEmailTouched = useRef(false)
  // Same for the header title: clearing it is a deliberate choice (a custom header with no title),
  // so the tenant name must not be written back over an emptied field.
  const headerTitleTouched = useRef(false)
  const { isConfirmOpen, isDeactivating, requestDeactivate, cancelDeactivate, confirmDeactivate } =
    useChannelDeactivation({
      channelLabel: 'Email',
      onDeactivate,
      onActiveChange: setChannelActive,
    })

  // The tenant default loads asynchronously and can arrive after this tab has already mounted;
  // backfill it once it does, but only while the field is still untouched and unsaved.
  useEffect(() => {
    if (!senderEmailTouched.current && !values.senderEmail && !senderEmail && defaultSenderEmail) {
      setSenderEmail(`${defaultSenderEmail}@${SENDER_EMAIL_DOMAIN}`)
    }
  }, [defaultSenderEmail, senderEmail, values.senderEmail])

  // Tenant settings can also land after mount; seed the header defaults from them the same way,
  // while both fields are still untouched and no custom header has been saved.
  useEffect(() => {
    if (!values.useCustomHeader && !headerLogoId && tenantEmailLogoId) {
      setHeaderLogoId(tenantEmailLogoId)
    }
  }, [headerLogoId, tenantEmailLogoId, values.useCustomHeader])

  useEffect(() => {
    if (!headerTitleTouched.current && !values.useCustomHeader && !headerTitle && tenantName) {
      setHeaderTitle(tenantName)
    }
  }, [headerTitle, tenantName, values.useCustomHeader])

  const templateItems = templates.map((t) => ({ id: t.id, label: t.name }))
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  const logoItems = [
    { id: NO_LOGO_ID, label: 'No logo' },
    ...approvedLogos.map((logo) => ({
      id: logo.id,
      label: logo.name ?? 'Unnamed logo',
    })),
  ]
  // A custom header previews its own logo and title; the tenant default previews the tenant's
  // configured logo on its own.
  const previewLogoId = headerMode === HEADER_CUSTOM_ID ? headerLogoId : tenantEmailLogoId
  const previewLogo = approvedLogos.find((logo) => logo.id === previewLogoId)
  const previewTitle = headerMode === HEADER_CUSTOM_ID ? headerTitle : ''

  const trimmedSenderEmail = senderEmail.trim()
  const senderEmailFormatError = senderEmailProblem(trimmedSenderEmail)
  const senderEmailError =
    trimmedSenderEmail === '' ? 'Sender email address cannot be empty.' : senderEmailFormatError
  // Only the sources ticked in Recipient(s) reach the save, so they are also what is validated -
  // an address left behind in an unticked field must not block a save it isn't part of.
  const submittedRecipients = selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID)
    ? recipients
    : NO_SELECTION
  const submittedGroups = selectedRecipients.includes(CSTAR_GROUPS_ID)
    ? groupSelections
    : NO_SELECTION
  const invalidRecipients: RecipientAddresses = {
    to: submittedRecipients.to.filter((address) => !isValidEmail(address)),
    cc: submittedRecipients.cc.filter((address) => !isValidEmail(address)),
    bcc: submittedRecipients.bcc.filter((address) => !isValidEmail(address)),
  }
  const recipientsHaveError =
    invalidRecipients.to.length > 0 ||
    invalidRecipients.cc.length > 0 ||
    invalidRecipients.bcc.length > 0
  // Malformed input is rejected whatever the channel's state; the required-but-empty fields
  // below only have to be complete while it is active, matching what the backend enforces.
  const hasValidationError = Boolean(senderEmailFormatError) || recipientsHaveError
  // A recipient source is only a complete choice once something addresses the To field, so a
  // chosen source with an empty To counts as no recipient at all and reports the same error under
  // the checkbox group. An address or a CSTAR group satisfies it - the rule the backend applies
  // before it will activate the channel - while cc and bcc on their own never do.
  const recipientSelectionError =
    selectedRecipients.length === 0 ||
    (submittedRecipients.to.length === 0 && submittedGroups.to.length === 0)
      ? 'Please select at least one recipient.'
      : ''
  const templateError = selectedTemplateId ? '' : 'Please select a template.'
  const isIncomplete = Boolean(senderEmailError || recipientSelectionError || templateError)
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
      return
    }

    setSaving(true)
    try {
      const useCustomHeader = headerMode === HEADER_CUSTOM_ID
      await onSave({
        active: channelActive,
        senderEmail: trimmedSenderEmail,
        templateId: selectedTemplateId ?? null,
        to: submittedRecipients.to,
        cc: submittedRecipients.cc,
        bcc: submittedRecipients.bcc,
        cstarGroupIdsTo: submittedGroups.to,
        cstarGroupIdsCc: submittedGroups.cc,
        cstarGroupIdsBcc: submittedGroups.bcc,
        useCustomHeader,
        // "No logo" is a real choice, so it saves as no logo rather than as the tenant default.
        headerLogoId:
          useCustomHeader && headerLogoId && headerLogoId !== NO_LOGO_ID ? headerLogoId : null,
        headerTitle: useCustomHeader ? headerTitle.trim() : '',
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
      <div className="events__switch-field">
        <span className="events__field-label">Activate channel</span>
        <Switch
          labelPosition="right"
          aria-label="Activate channel"
          isSelected={channelActive}
          onChange={handleSwitchChange}
          isDisabled={isFormDisabled}
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
              senderEmailTouched.current = true
              setSenderEmail(value)
              setSettingsChanged(true)
            }}
            description="The default sender email is based on your tenant but can be changed. It must be linked to a registered IDIR account or an approved email address."
            size="small"
            isDisabled={areFieldsDisabled}
            isRequired
            // Native validation blocks the submit outright on an empty required field, which
            // hides the other fields' errors; drive this from validationAttempted instead.
            validationBehavior="aria"
            isInvalid={Boolean(displayedSenderEmailError)}
            errorMessage={displayedSenderEmailError}
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
            <Checkbox value={CSTAR_GROUPS_ID}>CSTAR Group(s)</Checkbox>
            <Checkbox value={ADDITIONAL_RECIPIENTS_ID}>Additional recipient(s)</Checkbox>
          </CheckboxGroup>

          {selectedRecipients.includes(CSTAR_GROUPS_ID) && (
            <EventsCstarGroups
              values={groupSelections}
              groups={cstarGroups}
              onChange={(value) => {
                setGroupSelections(value)
                setSettingsChanged(true)
              }}
              isDisabled={areFieldsDisabled}
            />
          )}

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
            validationBehavior="aria"
            isInvalid={Boolean(displayedTemplateError)}
            errorMessage={displayedTemplateError}
          />

          {selectedTemplate && (
            <div
              className={`events__template-preview${
                areFieldsDisabled ? ' events__template-preview--disabled' : ''
              }`}
            >
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

          <RadioGroup
            label="Email notification header"
            value={headerMode}
            onChange={(value) => {
              setHeaderMode(value)
              setSettingsChanged(true)
            }}
            isDisabled={areFieldsDisabled}
          >
            <Radio value={HEADER_TENANT_DEFAULT_ID}>Use tenant default</Radio>
            <Radio value={HEADER_CUSTOM_ID}>Custom</Radio>
          </RadioGroup>

          {headerMode === HEADER_CUSTOM_ID && (
            <>
              <Select
                label="Email logo/brand"
                placeholder="Select a logo..."
                items={logoItems}
                value={headerLogoId}
                onChange={(key) => {
                  setHeaderLogoId(key == null ? undefined : String(key))
                  setSettingsChanged(true)
                }}
                size="small"
                isDisabled={areFieldsDisabled}
              />

              <TextField
                label="Header title"
                value={headerTitle}
                onChange={(value) => {
                  headerTitleTouched.current = true
                  setHeaderTitle(value)
                  setSettingsChanged(true)
                }}
                description="Defaults to your tenant name. Changes only affect the title displayed in email notifications and do not change your tenant name."
                size="small"
                isDisabled={areFieldsDisabled}
              />
            </>
          )}

          {(previewLogo || previewTitle) && (
            <div className="events__header-preview">
              <span className="events__field-label">Header Preview</span>
              <div className="events__header-preview-row">
                {previewLogo && (
                  <img
                    alt=""
                    className="events__header-preview-logo"
                    loading="lazy"
                    src={previewLogo.imageUrl}
                  />
                )}
                {previewTitle && (
                  <span className="events__header-preview-title">{previewTitle}</span>
                )}
              </div>
            </div>
          )}

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
