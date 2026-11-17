import { describe, expect, it } from 'vitest'
import { notificationErrorSummary } from './notification-error-summary'

describe('notificationErrorSummary', () => {
  it.each([undefined, null, '', '  '])('leaves absent errors empty (%s)', (error) => {
    expect(notificationErrorSummary(error)).toBeUndefined()
  })

  it.each([
    'CHES email: upstream 503 - maintenance',
    'connect ECONNREFUSED internal-host:443',
    'request timed out',
    JSON.stringify({ response: { status: 502, data: { message: 'private diagnostics' } } }),
    JSON.stringify({ errors: [{ cause: { code: 'ENOTFOUND' } }] }),
  ])('summarizes dependency failures without exposing diagnostics (%s)', (error) => {
    expect(notificationErrorSummary(error)).toBe(
      'A service we depend on was unavailable at this time.',
    )
  })

  it('keeps safelist failures actionable', () => {
    expect(notificationErrorSummary('Recipient is not on the tenant safelist')).toBe(
      'This recipient is not on the list of permitted recipients.',
    )
  })

  it('recognizes recipient delivery failures', () => {
    expect(notificationErrorSummary('Unreachable destination handset')).toBe(
      'The notification could not be delivered to this recipient.',
    )
  })

  it.each([
    '{broken JSON',
    JSON.stringify({ message: 'Authentication failed', token: 'secret', status: 401 }),
    JSON.stringify({ recipient: 'person@example.com', status: 400 }),
    'Unknown provider response containing person@example.com',
    JSON.stringify({ message: JSON.stringify({ message: 'unknown failure' }) }),
  ])('uses a safe fallback for unknown errors (%s)', (error) => {
    expect(notificationErrorSummary(error)).toBe(
      'The notification could not be sent because an unexpected error occurred.',
    )
  })
})
