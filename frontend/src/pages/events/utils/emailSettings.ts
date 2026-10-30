import type { RecipientAddresses } from '../components/EventsAdditionalRecipients'
import type { CstarGroupSelections } from '../components/EventsCstarGroups'
import { ADDITIONAL_RECIPIENTS_ID, CSTAR_GROUPS_ID } from '../constants'
import { isValidEmail } from '@/utils/email'

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

// Used to validate that the sender address is a gov.bc.ca domain
export const SENDER_EMAIL_DOMAIN = 'gov.bc.ca'

// What a recipient source contributes while its checkbox is off. Its own fields are left holding
// what was entered, so checking it back on restores them, but nothing there is saved or validated.
const NO_SELECTION: RecipientAddresses & CstarGroupSelections = { to: [], cc: [], bcc: [] }

/** Empty string when the address is usable as a sender; otherwise why it isn't. */
function senderEmailProblem(value: string): string {
  if (value === '') return ''
  if (!isValidEmail(value)) return 'Enter a valid sender email address.'
  if (value.toLowerCase().split('@').pop() !== SENDER_EMAIL_DOMAIN) {
    return `The sender email address must be an @${SENDER_EMAIL_DOMAIN} address.`
  }
  return ''
}

type EmailSettingsForm = {
  senderEmail: string
  recipients: { sources: string[]; addresses: RecipientAddresses; groups: CstarGroupSelections }
  templateId: string | undefined
}

/** What the form would save, and every problem with it. */
export function validateEmailSettings({ senderEmail, recipients, templateId }: EmailSettingsForm) {
  const senderEmailFormatError = senderEmailProblem(senderEmail)
  const senderEmailError =
    senderEmail === '' ? 'Sender email address cannot be empty.' : senderEmailFormatError
  // Only the sources ticked in Recipient(s) reach the validation + save.
  const selectedRecipients = recipients.sources
  const submittedRecipients = selectedRecipients.includes(ADDITIONAL_RECIPIENTS_ID)
    ? recipients.addresses
    : NO_SELECTION
  const submittedGroups = selectedRecipients.includes(CSTAR_GROUPS_ID)
    ? recipients.groups
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
  const hasValidationError = Boolean(senderEmailFormatError) || recipientsHaveError
  // Must include at least one 'To' recipient
  const recipientSelectionError =
    selectedRecipients.length === 0 ||
    (submittedRecipients.to.length === 0 && submittedGroups.to.length === 0)
      ? 'Please select at least one recipient.'
      : ''
  const templateError = templateId ? '' : 'Please select a template.'
  const isIncomplete = Boolean(senderEmailError || recipientSelectionError || templateError)

  return {
    submittedRecipients,
    /** The recipient fields as the save sends them. */
    submitted: {
      to: submittedRecipients.to,
      cc: submittedRecipients.cc,
      bcc: submittedRecipients.bcc,
      cstarGroupIdsTo: submittedGroups.to,
      cstarGroupIdsCc: submittedGroups.cc,
      cstarGroupIdsBcc: submittedGroups.bcc,
    },
    invalidRecipients,
    recipientsHaveError,
    hasValidationError,
    senderEmailError,
    recipientSelectionError,
    templateError,
    isIncomplete,
  }
}
