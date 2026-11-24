import { describe, expect, it } from 'vitest'
import { withSmsSenderName } from './sms-sender-name'

describe('withSmsSenderName', () => {
  it('starts the body with the tenant name and a colon', () => {
    expect(withSmsSenderName('Your site is booked.', 'Parks Booking')).toBe(
      'Parks Booking: Your site is booked.',
    )
  })

  it('leaves the body alone when there is no sender name', () => {
    expect(withSmsSenderName('Your site is booked.', null)).toBe('Your site is booked.')
  })

  it('leaves a missing body missing', () => {
    expect(withSmsSenderName(undefined, 'Parks Booking')).toBeUndefined()
  })
})
