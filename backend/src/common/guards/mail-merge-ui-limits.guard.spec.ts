import { describe, expect, it } from 'vitest'
import { UnprocessableEntityException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { MailMergeUiLimitsGuard } from './mail-merge-ui-limits.guard'
import { MAIL_MERGE_UI_MAX_RECIPIENTS } from '../../api/notify/schemas/mail-merge.constants'

function contextFor(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext
}

describe('MailMergeUiLimitsGuard', () => {
  const guard = new MailMergeUiLimitsGuard()

  function mergeOf(recipientCount: number) {
    return {
      recipients: {
        mergeArray: [
          ['to', 'firstName'],
          ...Array.from({ length: recipientCount }, (_, i) => [`p${i}@gov.bc.ca`, 'Name']),
        ],
      },
    }
  }

  it('allows a merge at the cap', () => {
    expect(guard.canActivate(contextFor(mergeOf(MAIL_MERGE_UI_MAX_RECIPIENTS)))).toBe(true)
  })

  it('rejects a merge one recipient over the cap', () => {
    expect(() => guard.canActivate(contextFor(mergeOf(MAIL_MERGE_UI_MAX_RECIPIENTS + 1)))).toThrow(
      UnprocessableEntityException,
    )
  })

  it('reports the count and the limit so the caller can act on it', () => {
    try {
      guard.canActivate(contextFor(mergeOf(MAIL_MERGE_UI_MAX_RECIPIENTS + 1)))
      expect.unreachable('guard should have thrown')
    } catch (error) {
      const response = (error as UnprocessableEntityException).getResponse() as {
        errors: string[]
      }
      expect(response.errors[0]).toContain('5,001 recipients')
      expect(response.errors[0]).toContain('5,000')
    }
  })

  it('does not count the header row against the cap', () => {
    // Exactly cap+1 rows in the array = cap recipients, which is allowed.
    const body = mergeOf(MAIL_MERGE_UI_MAX_RECIPIENTS)
    expect(body.recipients.mergeArray).toHaveLength(MAIL_MERGE_UI_MAX_RECIPIENTS + 1)
    expect(guard.canActivate(contextFor(body))).toBe(true)
  })

  it('passes through a send that is not a merge', () => {
    expect(guard.canActivate(contextFor({ recipients: { to: ['alice@gov.bc.ca'] } }))).toBe(true)
  })

  it('passes through a malformed body and lets the validation pipe answer', () => {
    expect(guard.canActivate(contextFor(undefined))).toBe(true)
    expect(guard.canActivate(contextFor({}))).toBe(true)
    expect(guard.canActivate(contextFor({ recipients: { mergeArray: 'nope' } }))).toBe(true)
  })
})
