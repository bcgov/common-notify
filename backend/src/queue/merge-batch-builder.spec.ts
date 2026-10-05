import { describe, it, expect } from 'vitest'
import { NotificationChannel } from '../enum/notification-channel.enum'
import {
  delayUntilScheduled,
  ingestionJobFromRequest,
  mergeJobDataFromRequest,
  mergeRequestChannel,
} from './merge-batch-builder'

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

describe('ingestionJobFromRequest', () => {
  const createdAt = new Date('2026-10-05T12:00:00Z')

  it('rebuilds a plain send with its stored request', () => {
    const payload = {
      email: { recipients: { to: ['a@example.com'] }, content: { subject: 'S', body: 'B' } },
    }
    expect(ingestionJobFromRequest({ id: 'r1', tenantId: 't1', payload, createdAt })).toEqual({
      notifyId: 'r1',
      tenantId: 't1',
      request: payload,
      requestedAt: createdAt.toISOString(),
    })
  })

  it('rebuilds a merge with its fan-out fields and no recipients', () => {
    const job = ingestionJobFromRequest({
      id: 'r1',
      tenantId: 't1',
      payload: emailMerge,
      createdAt,
    })
    expect(job).toMatchObject({ mailMerge: true, mailMergeChannel: NotificationChannel.EMAIL })
    expect(job.mailMergeData).not.toHaveProperty('recipients')
  })

  it('keeps a scheduled send time', () => {
    const payload = {
      sms: {
        recipients: { to: ['+12505550123'] },
        content: { body: 'B' },
        delayedSend: '2026-10-06T09:00:00Z',
      },
    }
    const job = ingestionJobFromRequest({ id: 'r1', tenantId: 't1', payload, createdAt })
    expect(job.scheduledFor).toBe('2026-10-06T09:00:00Z')
  })
})

describe('delayUntilScheduled', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')

  it('is the time left until the send', () => {
    expect(delayUntilScheduled({ scheduledFor: '2026-10-05T12:10:00Z' }, now)).toBe(10 * 60_000)
  })

  it('is zero when unscheduled or already due', () => {
    expect(delayUntilScheduled({}, now)).toBe(0)
    expect(delayUntilScheduled({ scheduledFor: '2026-10-05T11:00:00Z' }, now)).toBe(0)
  })
})
