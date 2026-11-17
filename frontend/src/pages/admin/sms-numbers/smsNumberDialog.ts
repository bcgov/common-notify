import type { SmsNumber, SmsNumberTenant } from '@/api/smsNumbers.api'

/** What can be done with a number from its row's menu, each opening a dialog. */
export type SmsNumberAction = 'edit' | 'assign' | 'makeDefault' | 'clearDefault' | 'remove'

/** What an admin has open on the SMS numbers page: one dialog at a time. */
export type SmsNumberDialog =
  | { kind: 'add' }
  | { kind: SmsNumberAction; number: SmsNumber }
  | { kind: 'unassign'; number: SmsNumber; tenant: SmsNumberTenant }
  | { kind: 'chooseDefault'; providerCode: string }
