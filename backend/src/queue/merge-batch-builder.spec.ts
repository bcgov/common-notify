import { describe, it, expect } from 'vitest'
import { NotificationChannel } from '../enum/notification-channel.enum'
import { mergeJobDataFromRequest, mergeRequestChannel } from './merge-batch-builder'

const parse = (rows: string[][]) =>
  rows.slice(1).map(([address, name]) => ({ address, params: { name } }))

const emailMerge = {
  params: { org: 'BC', team: 'global' },
  email: {
    content: { templateId: 'tpl-1' },
    params: { team: 'email' },
    recipients: {
      mergeArray: [
        ['email', 'name'],
        ['a@example.com', 'Ann'],
        ['b@example.com', 'Bo'],
      ],
    },
  },
}

describe('mergeRequestChannel', () => {
  it('detects email and SMS merges and nothing else', () => {
    expect(mergeRequestChannel(emailMerge)).toBe(NotificationChannel.EMAIL)
    expect(mergeRequestChannel({ sms: { recipients: { mergeArray: [] } } })).toBe(
      NotificationChannel.SMS,
    )
    expect(mergeRequestChannel({ email: { recipients: { to: ['a@example.com'] } } })).toBeNull()
    expect(mergeRequestChannel(null)).toBeNull()
  })
})

describe('mergeJobDataFromRequest', () => {
  it('rebuilds content, merged global params and every recipient', () => {
    expect(mergeJobDataFromRequest(emailMerge, NotificationChannel.EMAIL, parse)).toEqual({
      content: { templateId: 'tpl-1' },
      // Channel params win over request-level ones, as at acceptance.
      params: { org: 'BC', team: 'email' },
      recipients: [
        { address: 'a@example.com', params: { name: 'Ann' } },
        { address: 'b@example.com', params: { name: 'Bo' } },
      ],
    })
  })

  it('narrows to the recipients kept', () => {
    const data = mergeJobDataFromRequest(
      emailMerge,
      NotificationChannel.EMAIL,
      parse,
      (address) => address === 'b@example.com',
    )
    expect(data.recipients).toEqual([{ address: 'b@example.com', params: { name: 'Bo' } }])
  })

  it('refuses a stored request that is not a merge on that channel', () => {
    expect(() => mergeJobDataFromRequest(emailMerge, NotificationChannel.SMS, parse)).toThrow(
      /not a SMS merge/,
    )
  })
})
