import { Test, TestingModule } from '@nestjs/testing'
import { EjsTemplateRenderer } from './ejs-template.renderer'
import type { RenderContext } from '../../../adapters/interfaces'

describe('EjsTemplateRenderer', () => {
  let renderer: EjsTemplateRenderer

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EjsTemplateRenderer],
    }).compile()

    renderer = module.get<EjsTemplateRenderer>(EjsTemplateRenderer)
  })

  describe('renderEmail', () => {
    it('should render email with subject and body', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Welcome',
          type: 'email',
          subject: 'Welcome <%= name %>',
          body: 'Hello <%= name %>, welcome to <%= site %>!',
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

    it('should handle EJS output tags with escaping', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Escape',
          type: 'email',
          subject: 'Test',
          body: 'Value: <%= value %>',
          active: true,
        },
        personalisation: { value: '<script>alert("xss")</script>' },
      }

      const result = await renderer.renderEmail(context)

      // EJS escapes by default with <%=
      expect(result.body).not.toContain('<script>')
    })

    it('should handle EJS unescaped output with dash', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'HTML',
          type: 'email',
          subject: 'HTML',
          body: 'Content: <%- htmlContent %>',
          active: true,
        },
        personalisation: { htmlContent: '<strong>bold</strong>' },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('<strong>bold</strong>')
    })

    it('should handle EJS code tags', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Code',
          type: 'email',
          subject: 'Test',
          body: '<% var x = 5; %>Value: <%= x %>',
          active: true,
        },
        personalisation: {},
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('Value: 5')
    })

    it('should handle EJS conditionals', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Conditional',
          type: 'email',
          subject: 'Status',
          body: '<% if (premium) { %>Premium Member<% } else { %>Standard<% } %>',
          active: true,
        },
        personalisation: { premium: true },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('Premium Member')
      expect(result.body).not.toContain('Standard')
    })

    it('should handle EJS loops', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Loop',
          type: 'email',
          subject: 'Items',
          body: '<% items.forEach(item => { %><%= item %> <% }); %>',
          active: true,
        },
        personalisation: { items: ['apple', 'banana', 'cherry'] },
      }

      const result = await renderer.renderEmail(context)

      expect(result.body).toContain('apple')
      expect(result.body).toContain('banana')
      expect(result.body).toContain('cherry')
    })

    it('should handle missing variables with provided context', async () => {
      const context: RenderContext = {
        template: {
          id: 'template-1',
          name: 'Dynamic',
          type: 'email',
          subject: 'Subject',
          body: 'Hello <%= name %>',
          active: true,
        },
        personalisation: { name: 'World' },
      }

      const result = await renderer.renderEmail(context)
      expect(result.body).toBe('Hello World')
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

    it('should handle attachments in personalisation', async () => {
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
    it('should render SMS with body', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS',
          type: 'sms',
          body: 'Hi <%= name %>, your code is <%= code %>',
          active: true,
        },
        personalisation: { name: 'John', code: '123456' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Hi John, your code is 123456')
    })

    it('should handle EJS in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS Code',
          type: 'sms',
          body: 'Code: <%= code %>',
          active: true,
        },
        personalisation: { code: '654321' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toBe('Code: 654321')
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

    it('should handle EJS conditionals in SMS', async () => {
      const context: RenderContext & { personalisation: Record<string, string> } = {
        template: {
          id: 'template-1',
          name: 'SMS Status',
          type: 'sms',
          body: '<% if (verified === "true") { %>Verified<% } else { %>Not verified<% } %>',
          active: true,
        },
        personalisation: { verified: 'true' },
      }

      const result = await renderer.renderSms(context)

      expect(result.body).toContain('Verified')
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
    it('should have name "ejs"', () => {
      expect(renderer.name).toBe('ejs')
    })
  })
})
