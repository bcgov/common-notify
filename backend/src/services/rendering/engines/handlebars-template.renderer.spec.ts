import { Test, TestingModule } from '@nestjs/testing'
import { HandlebarsTemplateRenderer } from './handlebars-template.renderer'
import type { RenderContext } from '../../../adapters/interfaces'

describe('HandlebarsTemplateRenderer', () => {
  let renderer: HandlebarsTemplateRenderer

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandlebarsTemplateRenderer],
    }).compile()

    renderer = module.get<HandlebarsTemplateRenderer>(HandlebarsTemplateRenderer)
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

    it('should handle Handlebars conditions with if', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Conditional',
          type: 'email',
          subject: 'Status',
          body: '{{#if premium}}You are a premium member{{else}}Free account{{/if}}',
          active: true,
        },
        personalisation: { premium: true },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('You are a premium member')
      expect(result.body).not.toContain('Free account')
    })

    it('should handle Handlebars iteration', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'List',
          type: 'email',
          subject: 'Items',
          body: 'Items: {{#each items}}{{this}} {{/each}}',
          active: true,
        },
        personalisation: { items: ['apple', 'banana', 'cherry'] },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('apple')
      expect(result.body).toContain('banana')
      expect(result.body).toContain('cherry')
    })

    it('should render with lookup operator', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Lookup',
          type: 'email',
          subject: 'Dynamic',
          body: '{{lookup data key}}',
          active: true,
        },
        personalisation: { data: { foo: 'bar' }, key: 'foo' },
      }

      const result = await renderer.renderEmail(context)
      expect(result).toBeDefined()
      expect(result.body).toBe('bar')
    })

    it('should escape HTML by default in double braces', async () => {
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

    it('should handle triple braces for unescaped HTML', async () => {
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

    it('should return attachments when provided', async () => {
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

    it('should handle complex nested objects', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Nested',
          type: 'email',
          subject: 'Nested {{user.name}}',
          body: 'User: {{user.name}}, Email: {{user.email}}',
          active: true,
        },
        personalisation: {
          user: {
            name: 'John',
            email: 'john@example.com',
          },
        },
      }

      const result = await renderer.renderEmail(context)

      expect(result.subject).toBe('Nested John')
      expect(result.body).toBe('User: John, Email: john@example.com')
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

    it('should handle Handlebars if/else in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS Status',
          type: 'sms',
          body: '{{#if verified}}Verified{{else}}Not verified{{/if}}',
          active: true,
        },
        personalisation: { verified: 'true' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Verified')
    })

    it('should handle Handlebars iteration in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS List',
          type: 'sms',
          body: 'Items: {{#each items}}{{this}} {{/each}}',
          active: true,
        },
        personalisation: { items: 'apple,banana,cherry' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toContain('Items:')
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
    it('should have name "handlebars"', () => {
      expect(renderer.name).toBe('handlebars')
    })
  })
})
