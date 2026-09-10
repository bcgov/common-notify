import { describe, expect, it, beforeEach, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { NotificationService } from './notification.service'

/**
 * Covers the flat-CSV-to-nested-params expansion. The service has a wide constructor, so it is
 * built with every dependency stubbed - none of them are touched by parseMailMergeRecipients.
 */
describe('parseMailMergeRecipients nesting', () => {
  let service: NotificationService

  beforeEach(async () => {
    // The constructor reads config; nothing else is touched by parseMailMergeRecipients.
    const module = await Test.createTestingModule({
      providers: [NotificationService],
    })
      .useMocker(() => ({ get: vi.fn(), getOrThrow: vi.fn() }))
      .compile()

    service = module.get(NotificationService)
  })

  it('keeps a flat column flat', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'firstName'],
      ['alice@gov.bc.ca', 'Alice'],
    ])

    expect(recipient).toEqual({ address: 'alice@gov.bc.ca', params: { firstName: 'Alice' } })
  })

  it('expands a dotted column so the renderer can bind {{alert.id}}', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'alert.id', 'alert.severity', 'recipient.firstName'],
      ['alice@gov.bc.ca', 'A-1', 'High', 'Alice'],
    ])

    expect(recipient.params).toEqual({
      alert: { id: 'A-1', severity: 'High' },
      recipient: { firstName: 'Alice' },
    })
  })

  it('supplies the root key the personalisation check looks for', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'alert.id'],
      ['alice@gov.bc.ca', 'A-1'],
    ])

    expect(Object.prototype.hasOwnProperty.call(recipient.params, 'alert')).toBe(true)
  })

  it('nests more than two levels deep', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'a.b.c'],
      ['alice@gov.bc.ca', 'deep'],
    ])

    expect(recipient.params).toEqual({ a: { b: { c: 'deep' } } })
  })

  it('ignores a column that would write through the prototype chain', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', '__proto__.polluted', 'constructor.x', 'firstName'],
      ['alice@gov.bc.ca', 'yes', 'yes', 'Alice'],
    ])

    expect(recipient.params).toEqual({ firstName: 'Alice' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('ignores an empty segment rather than creating a blank key', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'a..b', 'firstName'],
      ['alice@gov.bc.ca', 'x', 'Alice'],
    ])

    expect(recipient.params).toEqual({ firstName: 'Alice' })
  })

  it('keeps the first value when a column collides with a nested one', () => {
    const [recipient] = service.parseMailMergeRecipients([
      ['to', 'alert', 'alert.id'],
      ['alice@gov.bc.ca', 'scalar', 'A-1'],
    ])

    expect(recipient.params).toEqual({ alert: 'scalar' })
  })
})
