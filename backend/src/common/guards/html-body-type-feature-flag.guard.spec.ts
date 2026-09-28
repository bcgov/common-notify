import { Test, TestingModule } from '@nestjs/testing'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { HtmlBodyTypeFeatureFlagGuard } from './html-body-type-feature-flag.guard'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'

const contextFor = (body: unknown, tenant: unknown = { id: 'tenant-123' }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ body, tenant }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext

describe('HtmlBodyTypeFeatureFlagGuard', () => {
  let guard: HtmlBodyTypeFeatureFlagGuard
  let featureFlagService: FeatureFlagService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HtmlBodyTypeFeatureFlagGuard,
        { provide: FeatureFlagService, useValue: { isEnabled: vi.fn().mockResolvedValue(false) } },
      ],
    }).compile()

    guard = module.get(HtmlBodyTypeFeatureFlagGuard)
    featureFlagService = module.get(FeatureFlagService)
  })

  describe('bodies that do not ask for html', () => {
    it.each([
      ['markdown', { email: { content: { bodyType: 'markdown' } } }],
      ['text', { email: { content: { bodyType: 'text' } } }],
      ['bodyType omitted', { email: { content: { body: 'hi' } } }],
      ['no content', { email: { recipients: { to: ['a@b.ca'] } } }],
      ['template send', { email: { content: { templateId: 'abc' } } }],
      ['empty body', {}],
    ])('allows %s without consulting the flag', async (_label, body) => {
      await expect(guard.canActivate(contextFor(body))).resolves.toBe(true)
      expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
    })

    it('allows a non-object body', async () => {
      await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true)
    })
  })

  describe('bodies that ask for html', () => {
    it.each([
      ['a single channel posted on its own', { content: { bodyType: 'html' } }],
      ['the email channel', { email: { content: { bodyType: 'html' } } }],
      ['the sms channel', { sms: { content: { bodyType: 'html' } } }],
      ['the msgApp channel', { msgApp: { content: { bodyType: 'html' } } }],
    ])('rejects %s when the flag is off', async (_label, body) => {
      await expect(guard.canActivate(contextFor(body))).rejects.toThrow(ForbiddenException)
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('html_body_type', 'tenant-123')
    })

    it('allows the request when the tenant holds the flag', async () => {
      vi.mocked(featureFlagService.isEnabled).mockResolvedValue(true)

      const body = { email: { content: { bodyType: 'html' } } }
      await expect(guard.canActivate(contextFor(body))).resolves.toBe(true)
    })

    it('names markdown as the alternative so the caller can act on the error', async () => {
      const body = { email: { content: { bodyType: 'html' } } }

      await expect(guard.canActivate(contextFor(body))).rejects.toThrow(/markdown/)
    })

    it('checks the flag once when several channels ask for html', async () => {
      const body = {
        email: { content: { bodyType: 'html' } },
        sms: { content: { bodyType: 'html' } },
      }

      await expect(guard.canActivate(contextFor(body))).rejects.toThrow(ForbiddenException)
      expect(featureFlagService.isEnabled).toHaveBeenCalledTimes(1)
    })
  })

  it('rejects a request with no tenant context', async () => {
    const body = { email: { content: { bodyType: 'html' } } }

    await expect(guard.canActivate(contextFor(body, null))).rejects.toThrow(ForbiddenException)
    expect(featureFlagService.isEnabled).not.toHaveBeenCalled()
  })
})
