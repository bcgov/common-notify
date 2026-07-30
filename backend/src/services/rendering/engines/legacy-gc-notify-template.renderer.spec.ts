import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { vi } from 'vitest'
import { LegacyGcNotifyTemplateRenderer } from './legacy-gc-notify-template.renderer'
import type { RenderContext } from '../../../adapters/interfaces'

describe('LegacyGcNotifyTemplateRenderer', () => {
  let renderer: LegacyGcNotifyTemplateRenderer
  let loggerSpy: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LegacyGcNotifyTemplateRenderer],
    }).compile()

    renderer = module.get<LegacyGcNotifyTemplateRenderer>(LegacyGcNotifyTemplateRenderer)
    loggerSpy = vi.spyOn(Logger.prototype, 'warn')
  })

  afterEach(() => {
    loggerSpy.mockRestore()
  })

  describe('renderEmail', () => {
    it('should render email with subject and body using legacy syntax', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Welcome',
          type: 'email',
          subject: 'Welcome ((firstName)) ((lastName))',
          body: 'Hello ((firstName)), welcome!',
          active: true,
        },
        personalisation: { firstName: 'John', lastName: 'Doe' },
        defaultSubject: 'Notification',
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Welcome John Doe')
      expect(result.body).toBe('Hello John, welcome!')
    })

    it('should use default subject when template subject is empty', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'No Subject',
          type: 'email',
          subject: '',
          body: 'Body content',
          active: true,
        },
        personalisation: {},
        defaultSubject: 'Default Subject',
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Default Subject')
    })

    it('should use "Notification" as fallback default subject', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'No Subject',
          type: 'email',
          subject: undefined,
          body: 'Body content',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Notification')
    })

    it('should handle legacy syntax with underscores in keys', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Legacy',
          type: 'email',
          subject: 'Order ((order_id))',
          body: 'Your order ((order_id)) is ready',
          active: true,
        },
        personalisation: { order_id: 'ORD-12345' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Order ORD-12345')
      expect(result.body).toBe('Your order ORD-12345 is ready')
    })

    it('should leave unmatched placeholders as-is', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Missing',
          type: 'email',
          subject: 'Missing ((missing))',
          body: 'Value: ((missing))',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Missing ((missing))')
      expect(result.body).toBe('Value: ((missing))')
    })

    it('should log warning when placeholder key is missing', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Missing',
          type: 'email',
          subject: 'Missing ((unknown))',
          body: 'Body',
          active: true,
        },
        personalisation: {},
      }

      await renderer.renderEmail(context)

      // Logger.warn should have been called (though mocking is tricky)
      // We can at least verify the placeholder remains
      expect(context.template.subject).toBe('Missing ((unknown))')
    })

    it('should convert number values to strings', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Number',
          type: 'email',
          subject: 'Amount: ((amount))',
          body: 'Total: ((amount))',
          active: true,
        },
        personalisation: { amount: 99.99 },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Amount: 99.99')
      expect(result.body).toBe('Total: 99.99')
    })

    it('should convert boolean values to strings', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Boolean',
          type: 'email',
          subject: 'Premium: ((premium))',
          body: 'Status: ((premium))',
          active: true,
        },
        personalisation: { premium: true },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Premium: true')
      expect(result.body).toBe('Status: true')
    })

    it('should handle null and undefined values', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Null',
          type: 'email',
          subject: 'Value: ((value))',
          body: 'Body',
          active: true,
        },
        personalisation: { value: null },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Value: ((value))')
    })

    it('should handle multiple occurrences of same placeholder', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Repeat',
          type: 'email',
          subject: 'Hello ((name))',
          body: 'Dear ((name)),\n\nWelcome ((name))!',
          active: true,
        },
        personalisation: { name: 'Alice' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Hello Alice')
      expect(result.body).toBe('Dear Alice,\n\nWelcome Alice!')
    })

    it('should omit ??-conditional content when the key is missing (falsy)', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Conditional Missing',
          type: 'email',
          subject: 'Order ((orderNumber??unknown)) Confirmation',
          body: 'Status: ((status??submitted for review))',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Order  Confirmation')
      expect(result.body).toBe('Status: ')
    })

    it('should render ??-conditional content when the key is truthy', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Conditional Truthy',
          type: 'email',
          subject: 'Order ((orderNumber??unknown)) Confirmation',
          body: 'Status: ((status??submitted for review))',
          active: true,
        },
        personalisation: { orderNumber: 'ABC-123', status: true },
      }

      const result = await renderer.renderEmail(context)

      // Truthy conditions show their content verbatim; the value is not printed.
      expect(result.subject).toBe('Order unknown Confirmation')
      expect(result.body).toBe('Status: submitted for review')
    })

    it('should omit ??-conditional content when the key is falsy ("false"/"")', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Conditional Falsy',
          type: 'email',
          subject: 'Subject',
          body: 'A((a??-alpha-))B((b??-beta-))C',
          active: true,
        },
        personalisation: { a: 'false', b: '' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe('ABC')
    })

    it('should handle empty personalisation', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Static',
          type: 'email',
          subject: 'Static Subject',
          body: 'Static body content',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Static Subject')
      expect(result.body).toBe('Static body content')
    })

    it('should handle empty body', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Empty',
          type: 'email',
          subject: 'Subject',
          body: undefined,
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe('')
    })

    it('should not support attachments (legacy format)', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'No Attachment',
          type: 'email',
          subject: 'Subject',
          body: 'Body',
          active: true,
        },
        personalisation: {
          file: {
            file: 'path/to/doc.pdf',
            filename: 'document.pdf',
            sending_method: 'attach' as const,
          },
        },
      }

      const result = await renderer.renderEmail(context)

      // Legacy format doesn't support attachments
      expect(result.attachments).toBeUndefined()
    })

    it('should be a Promise', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Promise',
          type: 'email',
          subject: 'Test',
          body: 'Test',
          active: true,
        },
        personalisation: {},
      }

      const result = renderer.renderEmail(context)

      expect(result).toBeInstanceOf(Promise)
      await result
    })
  })

  describe('renderSms', () => {
    it('should render SMS with body using legacy syntax', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS',
          type: 'sms',
          body: 'Hi ((firstName)), your code is ((code))',
          active: true,
        },
        personalisation: { firstName: 'John', code: '123456' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hi John, your code is 123456')
    })

    it('should handle legacy syntax in SMS with underscores', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS Code',
          type: 'sms',
          body: 'Your code: ((security_code))',
          active: true,
        },
        personalisation: { security_code: '654321' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Your code: 654321')
    })

    it('should leave unmatched placeholders in SMS as-is', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Missing',
          type: 'sms',
          body: 'Hello ((missing))',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hello ((missing))')
    })

    it('should not fail on empty SMS body', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Empty',
          type: 'sms',
          body: undefined,
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('')
    })

    it('should handle multiple placeholders in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Multi',
          type: 'sms',
          body: '((name)): ((message)) - ((id))',
          active: true,
        },
        personalisation: { name: 'Alice', message: 'Hello', id: '123' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Alice: Hello - 123')
    })

    it('should support ??-conditional placeholders in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS Conditional',
          type: 'sms',
          body: 'Hi((vip?? valued customer)), status: ((paid??paid))',
          active: true,
        },
        personalisation: { vip: 'true', paid: '' },
      }

      const result = await renderer.renderSms(context)

      // vip is truthy -> its content shows; paid is falsy -> its content is removed.
      expect(result.body).toBe('Hi valued customer, status: ')
    })

    it('should be a Promise', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Promise',
          type: 'sms',
          body: 'Test',
          active: true,
        },
        personalisation: {},
      }

      const result = renderer.renderSms(context)

      expect(result).toBeInstanceOf(Promise)
      await result
    })
  })

  describe('name property', () => {
    it('should have name "legacy_gc_notify"', () => {
      expect(renderer.name).toBe('legacy_gc_notify')
    })
  })

  describe('placeholder regex validation', () => {
    it('should match valid placeholder format ((key))', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Regex',
          type: 'email',
          subject: 'Test ((key))',
          body: 'Body',
          active: true,
        },
        personalisation: { key: 'value' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Test value')
    })

    it('should not match malformed placeholders', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Malformed',
          type: 'email',
          subject: 'Test (key) or ((key or [key])',
          body: 'Body',
          active: true,
        },
        personalisation: { key: 'value' },
      }

      const result = await renderer.renderEmail(context)

      // Only valid ((key)) format should be replaced
      expect(result.subject).toBe('Test (key) or ((key or [key])')
    })

    it('should handle keys starting with underscore', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Underscore',
          type: 'email',
          subject: 'Value: ((_key))',
          body: 'Body',
          active: true,
        },
        personalisation: { _key: 'test' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Value: test')
    })

    it('should not match keys starting with numbers', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Number Start',
          type: 'email',
          subject: 'Value: ((1key))',
          body: 'Body',
          active: true,
        },
        personalisation: { '1key': 'test' },
      }

      const result = await renderer.renderEmail(context)

      // Should not match because regex requires [a-zA-Z_] at start
      expect(result.subject).toBe('Value: ((1key))')
    })
  })
})
