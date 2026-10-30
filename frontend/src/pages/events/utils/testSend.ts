import { toMergeArray } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv } from '@/utils/bulkNotificationsCsv'
import { isValidEmail } from '@/utils/email'
import { showErrorToast } from '@/redux/utils/toastUtils'

export type Recipient = 'myself' | 'other'
export type AddRecipients = 'one' | 'many'

export const MAX_TEST_RECIPIENTS = 5

/**
 * The single address a test goes to: the user's own, or the one typed in. Null for a CSV send
 * or before a recipient is chosen. A typed address isn't validated until send.
 */
export function recipientEmailFor(
  recipient: Recipient | null,
  isOneRecipient: boolean,
  userEmail: string | undefined,
  typedEmail: string,
): string | null {
  if (recipient === 'myself') return userEmail ?? null
  if (isOneRecipient) return typedEmail
  return null
}

/** Why a typed recipient address cannot be sent to, or '' when it can. */
export function typedEmailErrorFor(email: string): string {
  if (email === '') return 'Enter an email address.'
  if (!isValidEmail(email)) return 'Enter a valid email address.'
  return ''
}

/**
 * The recipients to send to - the CSV rows, or the one other address. Undefined when
 * sending to yourself, since the API defaults to the signed-in user.
 */
export function testRecipientsFor(
  mergeRows: ParsedCsv | null,
  otherEmail: string | null,
): { to: string[] } | { mergeArray: string[][] } | undefined {
  if (mergeRows) return { mergeArray: toMergeArray(mergeRows, 'email') }
  if (otherEmail) return { to: [otherEmail] }
  return undefined
}

export function showSendBlockedToast() {
  showErrorToast(
    'Unable to send test notification',
    'Complete all required fields before sending a test notification.',
  )
}
