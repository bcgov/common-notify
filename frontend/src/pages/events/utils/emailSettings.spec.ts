import { describe, expect, it } from 'vitest'
import { validateEmailSettings } from './emailSettings'
import { ADDITIONAL_RECIPIENTS_ID } from '../constants'

describe('validateEmailSettings', () => {
  it('flags invalid cc and bcc addresses', () => {
    const result = validateEmailSettings({
      senderEmail: 'permits@gov.bc.ca',
      recipients: {
        sources: [ADDITIONAL_RECIPIENTS_ID],
        addresses: {
          to: ['to@example.com'],
          cc: ['cc@example.com', 'not-an-email'],
          bcc: ['also bad'],
        },
        groups: { to: [], cc: [], bcc: [] },
      },
      templateId: 'template',
    })

    expect(result.invalidRecipients).toEqual({ to: [], cc: ['not-an-email'], bcc: ['also bad'] })
    expect(result.recipientsHaveError).toBe(true)
    expect(result.hasValidationError).toBe(true)
  })
})
