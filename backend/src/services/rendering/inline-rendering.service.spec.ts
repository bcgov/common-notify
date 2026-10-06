import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'
import { InlineRenderingService } from './inline-rendering.service'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from './tokens'
import type { ITemplateRendererRegistry, ITemplateRenderer } from '../../adapters/interfaces'
import type { NotifyContent } from '../../api/notify/schemas/notify-content'
import { RenderingModule } from './rendering.module'

describe('InlineRenderingService', () => {
  let service: InlineRenderingService
  let mockRegistry: ITemplateRendererRegistry
  let mockRenderer: ITemplateRenderer

  beforeEach(async () => {
    mockRenderer = {
      name: 'handlebars',
      renderEmail: vi.fn(),
      renderSms: vi.fn(),
    }

    mockRegistry = {
      getRenderer: vi.fn(() => mockRenderer),
      hasEngine: vi.fn(() => true),
      getDefaultEngine: vi.fn(() => 'handlebars'),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InlineRenderingService,
        {
          provide: TEMPLATE_RENDERER_REGISTRY_TOKEN,
          useValue: mockRegistry,
        },
      ],
    }).compile()

    service = module.get<InlineRenderingService>(InlineRenderingService)
    vi.clearAllMocks()
  })

  describe('renderEmail', () => {
    it('should throw error when renderer is not specified', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        subject: 'Welcome',
        renderer: undefined,
      }

      await expect(service.renderEmail(content, {})).rejects.toThrow(
        'Renderer must be specified in content for inline rendering',
      )
    })

    it('should render email with subject and body', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        subject: 'Welcome {{name}}',
        renderer: 'handlebars',
      }

      const params = { name: 'John' }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Welcome John',
        body: 'Hello John',
      })

      const result = await service.renderEmail(content, params)

      expect(result).toEqual({
        subject: 'Welcome John',
        body: 'Hello John',
      })
      expect(mockRegistry.getRenderer).toHaveBeenCalledWith('handlebars')
    })

    it('should use default subject when template subject is not provided', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Hello John',
      })

      await service.renderEmail(content, { name: 'John' })

      expect(mockRenderer.renderEmail).toHaveBeenCalled()
      const callArgs = mockRenderer.renderEmail.mock.calls[0][0]
      // The inline service sets subject to content.subject || 'Notification'
      expect(callArgs.template.subject).toBe('Notification')
      expect(callArgs.personalisation).toEqual({ name: 'John' })
      expect(callArgs.defaultSubject).toBe('Notification')
    })

    it('should convert all params to strings', async () => {
      const content: NotifyContent = {
        body: 'Count: {{count}}, Active: {{active}}',
        renderer: 'mustache',
      }

      const params = {
        name: 'John',
        count: 42,
        active: true,
        data: { nested: 'value' },
        nullable: null,
        undefined_val: undefined,
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Rendered content',
      })

      await service.renderEmail(content, params)

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: {
          name: 'John',
          count: '42',
          active: 'true',
          data: '{"nested":"value"}',
          nullable: '',
          undefined_val: '',
        },
        defaultSubject: 'Notification',
      })
    })

    it('should handle empty params', async () => {
      const content: NotifyContent = {
        body: 'Static content',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Static content',
      })

      const result = await service.renderEmail(content, {})

      expect(result).toBeDefined()
      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: {},
        defaultSubject: 'Notification',
      })
    })

    it('should use provided default subject from content', async () => {
      const content: NotifyContent = {
        body: 'Body text',
        subject: 'Custom Subject',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Custom Subject',
        body: 'Body text',
      })

      await service.renderEmail(content)

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.objectContaining({
          subject: 'Custom Subject',
        }),
        personalisation: {},
        defaultSubject: 'Notification',
      })
    })

    it('should handle empty body', async () => {
      const content: NotifyContent = {
        body: undefined,
        subject: 'Subject',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Subject',
        body: '',
      })

      await service.renderEmail(content)

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.objectContaining({
          body: '',
        }),
        personalisation: {},
        defaultSubject: 'Notification',
      })
    })

    it('should return email with attachments if provided by renderer', async () => {
      const content: NotifyContent = {
        body: 'Email with attachment',
        subject: 'Attachment',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Attachment',
        body: 'Email with attachment',
        attachments: [
          {
            filename: 'document.pdf',
            content: Buffer.from('PDF content'),
            sendingMethod: 'attach',
          },
        ],
      })

      const result = await service.renderEmail(content)

      expect(result.attachments).toBeDefined()
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments[0].filename).toBe('document.pdf')
    })

    it('should use specific renderer for rendering', async () => {
      const content: NotifyContent = {
        body: 'Content',
        renderer: 'mustache',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Content',
      })

      await service.renderEmail(content)

      expect(mockRegistry.getRenderer).toHaveBeenCalledWith('mustache')
    })
  })

  describe('renderSms', () => {
    it('should throw error when renderer is not specified', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        renderer: undefined,
      }

      await expect(service.renderSms(content, {})).rejects.toThrow(
        'Renderer must be specified in content for inline rendering',
      )
    })

    it('should render SMS with body', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'Hello John',
      })

      const result = await service.renderSms(content, { name: 'John' })

      expect(result).toEqual({
        body: 'Hello John',
      })
    })

    it('should convert params to strings for SMS', async () => {
      const content: NotifyContent = {
        body: 'Your code: {{code}}',
        renderer: 'handlebars',
      }

      const params = {
        code: 12345,
        verified: true,
        user_data: { id: 1 },
        empty: null,
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'Your code: 12345',
      })

      await service.renderSms(content, params)

      expect(mockRenderer.renderSms).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: {
          code: '12345',
          verified: 'true',
          user_data: '{"id":1}',
          empty: '',
        },
      })
    })

    it('should handle empty SMS body', async () => {
      const content: NotifyContent = {
        body: undefined,
        renderer: 'handlebars',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: '',
      })

      await service.renderSms(content)

      expect(mockRenderer.renderSms).toHaveBeenCalledWith({
        template: expect.objectContaining({
          body: '',
        }),
        personalisation: {},
      })
    })

    it('should use different renderer for SMS rendering', async () => {
      const content: NotifyContent = {
        body: 'SMS content',
        renderer: 'legacy_gc_notify',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'SMS content',
      })

      await service.renderSms(content)

      expect(mockRegistry.getRenderer).toHaveBeenCalledWith('legacy_gc_notify')
    })
  })

  describe('renderMsgApp', () => {
    it('should render message app content using SMS renderer', async () => {
      const content: NotifyContent = {
        body: 'App notification {{user}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'App notification John',
      })

      const result = await service.renderMsgApp(content, { user: 'John' })

      expect(result).toEqual({
        body: 'App notification John',
      })
    })

    it('should throw error when renderer not specified for msgapp', async () => {
      const content: NotifyContent = {
        body: 'Content',
        renderer: undefined,
      }

      await expect(service.renderMsgApp(content)).rejects.toThrow('Renderer must be specified')
    })

    it('should convert params to strings for message app', async () => {
      const content: NotifyContent = {
        body: 'Message: {{message}}, count: {{count}}',
        renderer: 'mustache',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'Message: Hello, count: 5',
      })

      await service.renderMsgApp(content, { message: 'Hello', count: 5 })

      expect(mockRenderer.renderSms).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: {
          message: 'Hello',
          count: '5',
        },
      })
    })

    it('should handle empty params for message app', async () => {
      const content: NotifyContent = {
        body: 'Static message',
        renderer: 'handlebars',
      }

      mockRenderer.renderSms.mockResolvedValue({
        body: 'Static message',
      })

      const result = await service.renderMsgApp(content)

      expect(result).toBeDefined()
      expect(mockRenderer.renderSms).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: {},
      })
    })
  })

  describe('normalizeParams', () => {
    it('should convert string params as-is', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Hello Alice',
      })

      await service.renderEmail(content, { name: 'Alice' })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { name: 'Alice' },
        defaultSubject: 'Notification',
      })
    })

    it('should convert number params to strings', async () => {
      const content: NotifyContent = {
        body: 'Amount: {{amount}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Amount: 99.99',
      })

      await service.renderEmail(content, { amount: 99.99 })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { amount: '99.99' },
        defaultSubject: 'Notification',
      })
    })

    it('should convert boolean params to strings', async () => {
      const content: NotifyContent = {
        body: 'Premium: {{premium}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Premium: false',
      })

      await service.renderEmail(content, { premium: false })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { premium: 'false' },
        defaultSubject: 'Notification',
      })
    })

    it('should pass arrays through to the legacy GC Notify renderer, which renders them as lists', async () => {
      const content: NotifyContent = {
        body: 'Items: ((items))',
        renderer: 'legacy_gc_notify',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Items: \n\n* a\n* b',
      })

      await service.renderEmail(content, { items: ['a', 'b'] })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { items: ['a', 'b'] },
        defaultSubject: 'Notification',
      })
    })

    it('should still convert arrays to JSON strings for the other engines', async () => {
      const content: NotifyContent = {
        body: 'Items: {{items}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Items: ["a","b"]',
      })

      await service.renderEmail(content, { items: ['a', 'b'] })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { items: '["a","b"]' },
        defaultSubject: 'Notification',
      })
    })

    it('should convert objects to JSON strings', async () => {
      const content: NotifyContent = {
        body: 'Data: {{data}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Data: {"id":123}',
      })

      await service.renderEmail(content, { data: { id: 123 } })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { data: '{"id":123}' },
        defaultSubject: 'Notification',
      })
    })

    it('should convert null to empty string', async () => {
      const content: NotifyContent = {
        body: 'Value: {{value}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Value: ',
      })

      await service.renderEmail(content, { value: null })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { value: '' },
        defaultSubject: 'Notification',
      })
    })

    it('should convert undefined to empty string', async () => {
      const content: NotifyContent = {
        body: 'Value: {{value}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Value: ',
      })

      await service.renderEmail(content, { value: undefined })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { value: '' },
        defaultSubject: 'Notification',
      })
    })

    it('should handle array params', async () => {
      const content: NotifyContent = {
        body: 'Items: {{items}}',
        renderer: 'handlebars',
      }

      mockRenderer.renderEmail.mockResolvedValue({
        subject: 'Notification',
        body: 'Items: [1,2,3]',
      })

      await service.renderEmail(content, { items: [1, 2, 3] })

      expect(mockRenderer.renderEmail).toHaveBeenCalledWith({
        template: expect.any(Object),
        personalisation: { items: '[1,2,3]' },
        defaultSubject: 'Notification',
      })
    })
  })

  describe('html body sanitisation', () => {
    let realService: InlineRenderingService

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [RenderingModule],
      }).compile()

      realService = module.get<InlineRenderingService>(InlineRenderingService)
    })

    // The boundary sanitiser on NotifyContent.body has already run by the time content reaches
    // this service, so every body below is one it would have passed: the dangerous markup only
    // exists once a personalisation value has been substituted into it.

    it('strips markup a handlebars triple-stache injected into an html body', async () => {
      const rendered = await realService.renderEmail(
        { body: '<p>{{{block}}}</p>', bodyType: 'html', renderer: 'handlebars' },
        {
          block:
            '<iframe src="https://evil.example"></iframe><div style="display:none">hidden</div>',
        },
      )

      expect(rendered.body).not.toContain('<iframe')
      expect(rendered.body).not.toContain('display:none')
      // The text stays; only the means of hiding it from the reader is removed.
      expect(rendered.body).toContain('hidden')
    })

    it('strips markup the legacy engine injected, which escapes no placeholder at all', async () => {
      const rendered = await realService.renderEmail(
        { body: '<p>((block))</p>', bodyType: 'html', renderer: 'legacy_gc_notify' },
        { block: '<a href="javascript:alert(1)">Click</a>' },
      )

      expect(rendered.body).not.toContain('javascript:')
      expect(rendered.body).toContain('Click')
    })

    it('keeps the formatting an html email is written with', async () => {
      const body =
        '<table width="100%"><tr><td style="padding:16px;color:#234075">' +
        '<img src="https://x.ca/a.png" width="240" alt="A">' +
        '<a href="https://x.ca">link</a></td></tr></table>'

      const rendered = await realService.renderEmail(
        { body, bodyType: 'html', renderer: 'handlebars' },
        {},
      )

      expect(rendered.body).toContain('src="https://x.ca/a.png"')
      expect(rendered.body).toContain('padding:16px')
      expect(rendered.body).toContain('href="https://x.ca"')
      expect(rendered.body).toContain('width="100%"')
    })

    it('leaves an escaped value escaped rather than double-escaping it', async () => {
      const rendered = await realService.renderEmail(
        { body: '<p>{{name}}</p>', bodyType: 'html', renderer: 'handlebars' },
        { name: 'Bob & Co <tag>' },
      )

      expect(rendered.body).toContain('Bob &amp; Co &lt;tag&gt;')
      expect(rendered.body).not.toContain('&amp;amp;')
    })

    it('does not touch a markdown body, which markdown-it neutralises later', async () => {
      const rendered = await realService.renderEmail(
        {
          body: 'Hi {{name}}\n\n<iframe src="https://evil.example"></iframe>',
          bodyType: 'markdown',
          renderer: 'handlebars',
        },
        { name: 'Alice' },
      )

      expect(rendered.body).toContain('<iframe')
    })

    it('does not sanitise the subject, which is header text rather than html', async () => {
      const rendered = await realService.renderEmail(
        {
          subject: 'Re: {{{tag}}}',
          body: '<p>x</p>',
          bodyType: 'html',
          renderer: 'handlebars',
        },
        { tag: '<b>x</b>' },
      )

      expect(rendered.subject).toBe('Re: <b>x</b>')
    })
  })

  describe('MJML integration', () => {
    let realService: InlineRenderingService

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [RenderingModule],
      }).compile()

      realService = module.get<InlineRenderingService>(InlineRenderingService)
    })

    it('should render inline MJML email content', async () => {
      const content: NotifyContent = {
        subject: 'Welcome {{name}}',
        body: `
          <mjml>
            <mj-body>
              <mj-section>
                <mj-column>
                  <mj-text>Hello {{name}}</mj-text>
                </mj-column>
              </mj-section>
            </mj-body>
          </mjml>
        `,
        renderer: 'mjml',
      }

      const result = await realService.renderEmail(content, { name: 'John' })

      expect(result.subject).toBe('Welcome John')
      expect(result.body).toContain('<!doctype html>')
      expect(result.body).toContain('Hello John')
    })

    it('should render inline SMS as plain interpolated text for mjml renderer', async () => {
      const content: NotifyContent = {
        body: 'Hello {{name}}, code {{code}}',
        renderer: 'mjml',
      }

      const result = await realService.renderSms(content, { name: 'John', code: '123456' })

      expect(result.body).toBe('Hello John, code 123456')
    })
  })
})
