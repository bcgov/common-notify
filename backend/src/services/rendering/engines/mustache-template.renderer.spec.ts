import { Test, TestingModule } from '@nestjs/testing'

import { MustacheTemplateRenderer } from './mustache-template.renderer'
import type { RenderContext } from '../../../adapters/interfaces'

describe('MustacheTemplateRenderer', () => {
  let renderer: MustacheTemplateRenderer

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MustacheTemplateRenderer],
    }).compile()

    renderer = module.get<MustacheTemplateRenderer>(MustacheTemplateRenderer)
  })

  describe('renderEmail', () => {
    it('should render email with subject and body', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Welcome',
          type: 'email',
          subject: 'Welcome {{name}}',
          body: 'Hello {{name}}, welcome to {{site}}!',
          active: true,
        },
        personalisation: { name: 'John', site: 'MyApp' },
        defaultSubject: 'Notification',
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Welcome John')
      expect(result.body).toBe('Hello John, welcome to MyApp!')
      expect(result.attachments).toBeUndefined()
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

    it('should use default subject when template subject is undefined', async () => {
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
        defaultSubject: 'Fallback Subject',
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Fallback Subject')
    })

    it('should use default "Notification" when no default provided', async () => {
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

    it('should handle Mustache sections (arrays)', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'List',
          type: 'email',
          subject: 'Items',
          body: 'Items: {{#items}}{{.}} {{/items}}',
          active: true,
        },
        personalisation: { items: ['apple', 'banana', 'cherry'] },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe('Items: apple banana cherry ')
    })

    it('should handle Mustache inverted sections (negation)', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Inverted',
          type: 'email',
          subject: 'Status',
          body: '{{^premium}}You are not a premium member{{/premium}}',
          active: true,
        },
        personalisation: { premium: false },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toBe('You are not a premium member')
    })

    it('should handle triple mustaches (unescaped HTML)', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'HTML',
          type: 'email',
          subject: 'HTML Content',
          body: 'Content: {{{htmlContent}}}',
          active: true,
        },
        personalisation: { htmlContent: '<strong>bold</strong>' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('<strong>bold</strong>')
    })

    it('should escape HTML in double braces', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Escaped',
          type: 'email',
          subject: 'Escaped',
          body: 'Content: {{htmlContent}}',
          active: true,
        },
        personalisation: { htmlContent: '<script>alert("xss")</script>' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).not.toContain('<script>')
    })

    it('should handle missing variables gracefully', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Missing',
          type: 'email',
          subject: 'Missing {{missing}}',
          body: 'Value: {{missing}}',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Missing ')
      expect(result.body).toBe('Value: ')
    })

    it('should return attachments when provided in personalisation', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Attachment',
          type: 'email',
          subject: 'With attachment',
          body: 'See attachment',
          active: true,
        },
        personalisation: {
          name: 'John',
          file: {
            file: 'path/to/document.pdf',
            filename: 'document.pdf',
            sending_method: 'attach' as const,
          },
        },
      }

      const result = await renderer.renderEmail(context)

      expect(result.attachments).toBeDefined()
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments[0].filename).toBe('document.pdf')
      expect(result.attachments[0].sendingMethod).toBe('attach')
    })

    it('should not fail on empty personalisation', async () => {
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
    it('should render SMS with body only', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS',
          type: 'sms',
          body: 'Hi {{name}}, your code is {{code}}',
          active: true,
        },
        personalisation: { name: 'John', code: '123456' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hi John, your code is 123456')
    })

    it('should handle Mustache sections in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS List',
          type: 'sms',
          body: 'Item: {{#items}}{{name}} {{/items}}',
          active: true,
        },
        personalisation: { items: { name: 'apple' } },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toContain('Item:')
    })

    it('should not fail on empty SMS body', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Empty',
          type: 'sms',
          body: '',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('')
    })

    it('should handle missing variables in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'Missing',
          type: 'sms',
          body: 'Hello {{missing}}',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hello ')
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
    it('should have name "mustache"', () => {
      expect(renderer.name).toBe('mustache')
    })
  })
})
