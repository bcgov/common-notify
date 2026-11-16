import type { SmsCode, SmsNumber } from '@/api/smsNumbers.api'

/** A code's description, else the code itself. */
export function codeLabel(codes: readonly SmsCode[], code: string): string {
  return codes.find((entry) => entry.code === code)?.description ?? code
}

/** A number as it reads in a picker: "+15551234567 (AWS End User Messaging)". */
export function numberOptionLabel(number: SmsNumber, providers: readonly SmsCode[]): string {
  return `${number.phoneNumber} (${codeLabel(providers, number.providerCode)})`
}
