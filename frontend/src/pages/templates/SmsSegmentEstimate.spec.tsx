import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SmsSegmentEstimate from './SmsSegmentEstimate'

/** The estimate is split across elements for styling, so assert on the collapsed text. */
const renderEstimate = (body: string) =>
  render(<SmsSegmentEstimate body={body} />).container.textContent?.replace(/\s+/g, ' ') ?? ''

describe('SmsSegmentEstimate', () => {
  it('reports a short body as a single message', () => {
    const text = renderEstimate('Your appointment is confirmed.')

    expect(text).toContain('30 characters')
    expect(text).toContain('1 message')
    expect(text).toContain('130 of 160 remaining')
    expect(text).toContain('GSM-7')
  })

  it('shows an empty body as one message so the billing floor is clear', () => {
    const text = renderEstimate('')

    expect(text).toContain('0 characters')
    expect(text).toContain('1 message')
  })

  it('explains when a long body is billed as several messages', () => {
    const text = renderEstimate('a'.repeat(400))

    expect(text).toContain('3 messages')
    expect(text).toContain('sent as 3 linked messages and billed as 3')
  })

  it('warns that non-GSM characters cut the per-message limit', () => {
    const text = renderEstimate('Party 🎉')

    expect(text).toContain('Unicode (UCS-2)')
    expect(text).toContain('reduces the limit to 70 characters per message')
  })

  it('always flags the estimate as approximate because of placeholders', () => {
    const text = renderEstimate('Hello {{firstName}}')

    expect(text).toContain('Placeholders are replaced when the message is sent')
  })

  it('tells the author that markdown is not rendered but emoji are fine', () => {
    const text = renderEstimate('**Reminder**')

    expect(text).toContain('SMS is sent as plain text')
    expect(text).toContain('is not rendered')
    expect(text).toContain('Emoji are supported')
    // The asterisks are literal characters, so they count towards the length.
    expect(text).toContain('12 characters')
  })
})
