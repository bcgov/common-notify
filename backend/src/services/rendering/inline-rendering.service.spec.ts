import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'
import { InlineRenderingService } from './inline-rendering.service'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from './tokens'
import type { ITemplateRendererRegistry, ITemplateRenderer } from '../../adapters/interfaces'
import type { NotifyContent } from '../../api/notify/schemas/notify-content'

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

      const result = await service.renderEmail(content, { name: 'John' })

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
})
