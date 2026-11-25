import { describe, expect, it } from 'vitest'
import { notificationErrorSummary } from './notification-error-summary'

describe('notificationErrorSummary', () => {
  it.each([undefined, null, '', '  '])('leaves absent errors empty (%s)', (error) => {
    expect(notificationErrorSummary(error)).toBeUndefined()
  })

  it.each([
    'CHES email: upstream 503 - maintenance',
    'ACS returned HTTP 408',
    'ACS returned HTTP 429',
    'ACS returned HTTP 500',
    'ACS returned HTTP 503',
    'ACS returned HTTP 599',
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
    'Missing personalisation for template ID template-uuid: firstName, email',
    JSON.stringify({ message: 'Missing personalisation for template ID template-sms-uuid: code' }),
  ])('keeps missing template values actionable without exposing diagnostics (%s)', (error) => {
    expect(notificationErrorSummary(error)).toBe(
      'Required template values are missing. Check the template and provide all required values.',
    )
  })

  it.each([
    '{broken JSON',
    'ACS returned HTTP 400',
    'ACS returned HTTP 401',
    'ACS returned HTTP 404',
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
