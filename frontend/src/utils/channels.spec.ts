import { describe, expect, it } from 'vitest'
import { channelFilterOptions, formatChannel } from './channels'

describe('formatChannel', () => {
  it('labels each channel code, whatever its case', () => {
    expect(formatChannel('EMAIL')).toBe('Email')
    expect(formatChannel('sms')).toBe('SMS')
    expect(formatChannel('MSGAPP')).toBe('Msgapp')
  })

  it('shows an unknown code as given', () => {
    expect(formatChannel('FAX')).toBe('FAX')
  })
})

describe('channelFilterOptions', () => {
  it('offers every channel by default, or just the ones asked for', () => {
    expect(channelFilterOptions().map((option) => option.label)).toEqual(['Email', 'SMS', 'Msgapp'])
    expect(channelFilterOptions(['EMAIL', 'SMS'])).toEqual([
      { label: 'Email', value: 'EMAIL' },
      { label: 'SMS', value: 'SMS' },
    ])
  })
})
