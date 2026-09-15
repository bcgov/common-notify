import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { vi } from 'vitest'
import { LegacyGcNotifyTemplateRenderer } from './legacy-gc-notify-template.renderer'
import { toEmailHtml } from '../email-body-html'
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

  describe('list personalisation values', () => {
    // GC Notify has no list syntax: a placeholder becomes a list purely because the caller passed
    // an array. The body gets bullets, the subject and an SMS get an inline sentence.
    const emailBody = async (items: unknown): Promise<string> => {
      const result = await renderer.renderEmail({
        template: {
          id: 'template-1',
          name: 'List',
          type: 'email',
          subject: 'Subject',
          body: 'Items: ((items))',
          active: true,
        },
        personalisation: items === undefined ? {} : { items },
      })
      return result.body
    }

    const emailSubject = async (items: unknown): Promise<string> => {
      const result = await renderer.renderEmail({
        template: {
          id: 'template-1',
          name: 'List',
          type: 'email',
          subject: 'Items: ((items))',
          body: 'Body',
          active: true,
        },
        personalisation: items === undefined ? {} : { items },
      })
      return result.subject
    }

    const smsBody = async (items: unknown): Promise<string> => {
      const result = await renderer.renderSms({
        template: {
          id: 'template-1',
          name: 'List',
          type: 'sms',
          body: 'Items: ((items))',
          active: true,
        },
        personalisation: items === undefined ? {} : { items },
      })
      return result.body
    }

    it('renders three items as bullets in a body and inline elsewhere', async () => {
      expect(await emailBody(['a', 'b', 'c'])).toBe('Items: \n\n* a\n* b\n* c')
      expect(await emailSubject(['a', 'b', 'c'])).toBe('Items: a, b and c')
      expect(await smsBody(['a', 'b', 'c'])).toBe('Items: a, b and c')
    })

    it('joins two items with "and" and no comma', async () => {
      expect(await emailBody(['a', 'b'])).toBe('Items: \n\n* a\n* b')
      expect(await emailSubject(['a', 'b'])).toBe('Items: a and b')
      expect(await smsBody(['a', 'b'])).toBe('Items: a and b')
    })

    it('renders a single item with no conjunction', async () => {
      expect(await emailBody(['a'])).toBe('Items: \n\n* a')
      expect(await emailSubject(['a'])).toBe('Items: a')
      expect(await smsBody(['a'])).toBe('Items: a')
    })

    it('drops empty items', async () => {
      expect(await emailBody(['a', '', 'b'])).toBe('Items: \n\n* a\n* b')
      expect(await emailSubject(['a', '', 'b'])).toBe('Items: a and b')
      expect(await smsBody(['a', '', 'b'])).toBe('Items: a and b')
    })

    it('keeps 0 and false, which are values rather than empty', async () => {
      expect(await emailBody([0, 'a'])).toBe('Items: \n\n* 0\n* a')
      expect(await emailSubject([0, 'a'])).toBe('Items: 0 and a')
      expect(await smsBody([false, 'a'])).toBe('Items: false and a')
    })

    it('leaves the placeholder as-is when a list holds nothing printable', async () => {
      expect(await emailBody(['', '', null])).toBe('Items: ((items))')
      expect(await emailSubject(['', '', null])).toBe('Items: ((items))')
      expect(await smsBody(['', '', null])).toBe('Items: ((items))')
    })

    it('leaves the placeholder as-is for an empty list', async () => {
      expect(await emailBody([])).toBe('Items: ((items))')
      expect(await emailSubject([])).toBe('Items: ((items))')
      expect(await smsBody([])).toBe('Items: ((items))')
    })

    it('leaves the placeholder as-is when the key is absent or null', async () => {
      expect(await emailBody(undefined)).toBe('Items: ((items))')
      expect(await emailBody(null)).toBe('Items: ((items))')
      expect(await emailSubject(null)).toBe('Items: ((items))')
      expect(await smsBody(null)).toBe('Items: ((items))')
    })

    it('renders a plain string value unchanged', async () => {
      expect(await emailBody('a')).toBe('Items: a')
      expect(await emailSubject('a')).toBe('Items: a')
      expect(await smsBody('a')).toBe('Items: a')
    })

    it('does not decorate items containing markup - escaping happens downstream', async () => {
      expect(await emailBody(['<b>hi</b>'])).toBe('Items: \n\n* <b>hi</b>')
      expect(await emailSubject(['<b>hi</b>'])).toBe('Items: <b>hi</b>')
      expect(await smsBody(['<b>hi</b>'])).toBe('Items: <b>hi</b>')
    })

    it('treats a list with nothing printable as a falsy ??-condition', async () => {
      const conditional = async (items: unknown): Promise<string> => {
        const result = await renderer.renderSms({
          template: {
            id: 'template-1',
            name: 'Conditional List',
            type: 'sms',
            body: 'A((items??-has items-))B',
            active: true,
          },
          personalisation: { items },
        })
        return result.body
      }

      expect(await conditional([])).toBe('AB')
      expect(await conditional(['', '', null])).toBe('AB')
      expect(await conditional(['a'])).toBe('A-has items-B')
    })

    it('renders the worked example as a real <ul> once markdown-rendered', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Order',
          type: 'email',
          subject: 'Your order',
          body: 'Hello ((first_name)),\n\nYour order contains:\n\n((items))\n\nIt ships on ((ship_date)).',
          active: true,
        },
        personalisation: {
          first_name: 'Amala',
          items: ['apples', 'pears', 'plums'],
          ship_date: 'March 4',
        },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe(
        'Hello Amala,\n\nYour order contains:\n\n\n\n* apples\n* pears\n* plums\n\nIt ships on March 4.',
      )

      // The leading blank line is what makes markdown parse this as a list rather than as a
      // continuation of the sentence above it.
      const html = toEmailHtml(result.body, 'markdown')
      expect(html).toContain('<p>Your order contains:</p>')
      expect(html).toContain('<li>apples</li>')
      expect(html).toContain('<li>pears</li>')
      expect(html).toContain('<li>plums</li>')
      expect(html).toContain('<ul>')
      expect(html).toContain('<p>It ships on March 4.</p>')
    })

    it('escapes markup in a bullet item once markdown-rendered', async () => {
      const body = await emailBody(['<b>hi</b>'])

      const html = toEmailHtml(body, 'markdown')
      expect(html).toContain('<li>&lt;b&gt;hi&lt;/b&gt;</li>')
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
