import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Channels the safelist applies to. MSGAPP is deliberately absent: it delivers inside the
 * application rather than to an external contact point, so there is no real person to protect
 * from a non-production send.
 */
export const SAFELIST_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.SMS] as const

export type SafelistChannel = (typeof SAFELIST_CHANNELS)[number]

export function isSafelistChannel(channel: string): channel is SafelistChannel {
  return (SAFELIST_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Canonicalize a recipient so that the same person entered two different ways matches one
 * safelist entry. The result is what gets stored in `recipient_normalized` and what the send
 * path compares against — both sides must go through this function or entries silently miss.
 *
 * EMAIL: trimmed and lowercased. Addresses are case-insensitive in practice for every provider
 * we send through, and treating `Person@GOV.BC.CA` as distinct from `person@gov.bc.ca` would
 * let a blocked recipient through on a capitalization change.
 *
 * SMS: reduced to E.164. Separators, spaces and brackets are dropped; a bare 10-digit number is
 * assumed to be North American and gets `+1`, as does an 11-digit number starting with 1.
 * Anything else keeps its digits behind a `+` and is compared as-is.
 *
 * Returns null when the value cannot be normalized (empty, or no digits at all for SMS).
 */
export function normalizeRecipient(channel: string, value: string): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null

  if (channel === NotificationChannel.EMAIL) {
    return trimmed.toLowerCase()
  }

  if (channel === NotificationChannel.SMS) {
    const digits = trimmed.replace(/\D/g, '')
    if (!digits) return null
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return `+${digits}`
  }

  return trimmed
}

/** Loose format check used before an entry is accepted into the safelist. */
export function isValidRecipient(channel: string, value: string): boolean {
  const trimmed = (value ?? '').trim()

  if (channel === NotificationChannel.EMAIL) {
    // Deliberately permissive: the send path's own @IsEmail validation is the strict gate. This
    // only rejects values that are obviously not addresses.
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed) && trimmed.length <= 320
  }

  if (channel === NotificationChannel.SMS) {
    const digits = trimmed.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  }

  return false
}
