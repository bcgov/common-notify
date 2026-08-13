export type SafelistChannel = 'EMAIL' | 'SMS'

export interface SafelistEntry {
  id: string
  tenantId: string
  channelCode: SafelistChannel
  /** The value as it was entered, shown back to the administrator. */
  recipient: string
  /** Canonical form the send path matches against (lowercased email / E.164 number). */
  recipientNormalized: string
  label: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface SafelistResponse {
  entries: SafelistEntry[]
  /**
   * Whether this environment enforces the safelist. False in production, where the guardrail
   * does not apply and the list is informational only.
   */
  enforced: boolean
  maxEntries: number
}

export interface CreateSafelistEntry {
  channelCode: SafelistChannel
  recipient: string
  label?: string | null
}
