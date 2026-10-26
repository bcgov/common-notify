import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { NotifyService } from './notify.service'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import type { NotifyEmailChannel } from './schemas/notify-email-channel'
import type { NotifySmsChannel } from './schemas/notify-sms-channel'
import type { NotifyMsgAppChannel } from './schemas/notify-msg-app-channel'

const mockInlineRenderingService = {
  renderEmail: vi.fn(),
  renderSms: vi.fn(),
  renderMsgApp: vi.fn(),
}

describe('NotifyService', () => {
  let service: NotifyService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyService,
        {
          provide: InlineRenderingService,
          useValue: mockInlineRenderingService,
        },
      ],
    }).compile()

    service = module.get<NotifyService>(NotifyService)
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('notImplemented', () => {
    it('should return error response', () => {
      const result = service.notImplemented()

      expect(result).toBeDefined()
      expect(result.error).toBe('Not implemented')
      expect(result.message).toBe('This endpoint is not yet implemented')
      expect(result.timestamp).toBeDefined()
    })

    it('should return ISO timestamp', () => {
      const result = service.notImplemented()

      expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should return consistent structure on multiple calls', () => {
      const result1 = service.notImplemented()
      const result2 = service.notImplemented()

      expect(result1.error).toBe(result2.error)
      expect(result1.message).toBe(result2.message)
    })

    it('should have all required response properties', () => {
      const result = service.notImplemented()

      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('timestamp')
      expect(Object.keys(result).length).toBe(3)
    })
  })

  describe('renderEmailIfInline', () => {
    it('should render email when inline rendering is enabled and content exists', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test Subject',
          body: 'Test Body',
          renderer: 'handlebars',
        },
        params: { key: 'value' },
      }

      const mockRendered = {
        subject: 'Rendered Subject',
        body: 'Rendered Body',
      }
      mockInlineRenderingService.renderEmail.mockResolvedValue(mockRendered)

      const result = await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(
        channel.content,
        channel.params,
      )
      expect(result).toEqual(mockRendered)
    })

    it('should not render when templateId is specified (template-based rendering)', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: { templateId: 'template-123' },
      }

      const result = await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should not render when content is missing', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        // No content field
      }

      const result = await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should pass params to rendering service', async () => {
      const params = { firstName: 'John', lastName: 'Doe', orderId: 'ORD123' }
      const channel: NotifyEmailChannel = {
        recipients: { to: ['john@example.com'] },
        content: {
          subject: 'Hello {{firstName}}',
          body: 'Your order {{orderId}} is ready',
          renderer: 'handlebars',
        },
        params,
      }

      mockInlineRenderingService.renderEmail.mockResolvedValue({
        subject: 'Hello John',
        body: 'Your order ORD123 is ready',
      })

      await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(channel.content, params)
    })

    it('should handle empty params', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
        params: {},
      }

      mockInlineRenderingService.renderEmail.mockResolvedValue({
        subject: 'Test',
        body: 'Body',
      })

      await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(channel.content, {})
    })

    it('should handle undefined params', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
        params: undefined,
      }

      mockInlineRenderingService.renderEmail.mockResolvedValue({
        subject: 'Test',
        body: 'Body',
      })

      await service.renderEmailIfInline(channel)

      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(
        channel.content,
        undefined,
      )
    })

    it('should propagate rendering service errors', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          subject: 'Test',
          body: 'Body',
          renderer: 'handlebars',
        },
      }

      const error = new Error('Rendering failed')
      mockInlineRenderingService.renderEmail.mockRejectedValue(error)

      await expect(service.renderEmailIfInline(channel)).rejects.toThrow('Rendering failed')
    })

    it('should return null when templateId exists even with content', async () => {
      const channel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: {
          templateId: 'template-456',
          subject: 'Subject',
          body: 'Body',
        },
      }

      const result = await service.renderEmailIfInline(channel)

      expect(result).toBeNull()
      expect(mockInlineRenderingService.renderEmail).not.toHaveBeenCalled()
    })
  })

  describe('renderSmsIfInline', () => {
    it('should render SMS when inline rendering is enabled and content exists', async () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: {
          body: 'Hello {{firstName}}',
          renderer: 'handlebars',
        },
        params: { firstName: 'John' },
      }

      const mockRendered = {
        body: 'Hello John',
      }
      mockInlineRenderingService.renderSms.mockResolvedValue(mockRendered)

      const result = await service.renderSmsIfInline(channel)

      expect(mockInlineRenderingService.renderSms).toHaveBeenCalledWith(
        channel.content,
        channel.params,
      )
      expect(result).toEqual(mockRendered)
    })

    it('should not render when templateId is specified', async () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: { templateId: 'sms-template-123' },
      }

      const result = await service.renderSmsIfInline(channel)

      expect(mockInlineRenderingService.renderSms).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should not render when content is missing', async () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
      }

      const result = await service.renderSmsIfInline(channel)

      expect(mockInlineRenderingService.renderSms).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should pass params to rendering service', async () => {
      const params = { code: 'ABC123', expiresIn: '5 minutes' }
      const channel: NotifySmsChannel = {
        recipients: { to: ['+19876543210'] },
        content: {
          body: 'Your code: {{code}} (expires in {{expiresIn}})',
          renderer: 'handlebars',
        },
        params,
      }

      mockInlineRenderingService.renderSms.mockResolvedValue({
        body: 'Your code: ABC123 (expires in 5 minutes)',
      })

      await service.renderSmsIfInline(channel)

      expect(mockInlineRenderingService.renderSms).toHaveBeenCalledWith(channel.content, params)
    })

    it('should propagate rendering service errors', async () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: {
          body: 'Test',
          renderer: 'handlebars',
        },
      }

      const error = new Error('SMS rendering failed')
      mockInlineRenderingService.renderSms.mockRejectedValue(error)

      await expect(service.renderSmsIfInline(channel)).rejects.toThrow('SMS rendering failed')
    })

    it('should return null when templateId exists even with content', async () => {
      const channel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: {
          templateId: 'sms-template-789',
          body: 'Body',
        },
      }

      const result = await service.renderSmsIfInline(channel)

      expect(result).toBeNull()
      expect(mockInlineRenderingService.renderSms).not.toHaveBeenCalled()
    })
  })

  describe('renderMsgAppIfInline', () => {
    it('should render msgApp when inline rendering is enabled and content exists', async () => {
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: {
          body: 'Notification: {{message}}',
          renderer: 'handlebars',
        },
        params: { message: 'Your package arrived' },
      }

      const mockRendered = {
        body: 'Notification: Your package arrived',
      }
      mockInlineRenderingService.renderMsgApp.mockResolvedValue(mockRendered)

      const result = await service.renderMsgAppIfInline(channel)

      expect(mockInlineRenderingService.renderMsgApp).toHaveBeenCalledWith(
        channel.content,
        channel.params,
      )
      expect(result).toEqual(mockRendered)
    })

    it('should not render when templateId is specified', async () => {
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-456'] },
        content: { templateId: 'msgapp-template-123' },
      }

      const result = await service.renderMsgAppIfInline(channel)

      expect(mockInlineRenderingService.renderMsgApp).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should not render when content is missing', async () => {
      const channel = {
        recipients: { to: ['user-789'] },
      } as NotifyMsgAppChannel

      const result = await service.renderMsgAppIfInline(channel)

      expect(mockInlineRenderingService.renderMsgApp).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should pass params to rendering service', async () => {
      const params = { userName: 'Alice', alertType: 'warning' }
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: {
          body: 'Hello {{userName}}, {{alertType}} alert',
          renderer: 'handlebars',
        },
        params,
      }

      mockInlineRenderingService.renderMsgApp.mockResolvedValue({
        body: 'Hello Alice, warning alert',
      })

      await service.renderMsgAppIfInline(channel)

      expect(mockInlineRenderingService.renderMsgApp).toHaveBeenCalledWith(channel.content, params)
    })

    it('should propagate rendering service errors', async () => {
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: {
          body: 'Test',
          renderer: 'handlebars',
        },
      }

      const error = new Error('MsgApp rendering failed')
      mockInlineRenderingService.renderMsgApp.mockRejectedValue(error)

      await expect(service.renderMsgAppIfInline(channel)).rejects.toThrow('MsgApp rendering failed')
    })

    it('should return null when templateId exists even with content', async () => {
      const channel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: {
          templateId: 'msgapp-template-999',
          body: 'Body',
        },
      }

      const result = await service.renderMsgAppIfInline(channel)

      expect(result).toBeNull()
      expect(mockInlineRenderingService.renderMsgApp).not.toHaveBeenCalled()
    })
  })

  describe('rendering consistency', () => {
    it('should not call any rendering service methods when all channels have templates', async () => {
      const emailChannel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: { templateId: 'email-template', subject: 'Ignored', body: 'Ignored' },
      }
      const smsChannel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: { templateId: 'sms-template', body: 'Ignored' },
      }
      const msgAppChannel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: { templateId: 'msgapp-template', body: 'Ignored' },
      }

      await service.renderEmailIfInline(emailChannel)
      await service.renderSmsIfInline(smsChannel)
      await service.renderMsgAppIfInline(msgAppChannel)

      expect(mockInlineRenderingService.renderEmail).not.toHaveBeenCalled()
      expect(mockInlineRenderingService.renderSms).not.toHaveBeenCalled()
      expect(mockInlineRenderingService.renderMsgApp).not.toHaveBeenCalled()
    })

    it('should render all channels when all use inline rendering', async () => {
      const emailChannel: NotifyEmailChannel = {
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Email', body: 'Email Body', renderer: 'handlebars' },
      }
      const smsChannel: NotifySmsChannel = {
        recipients: { to: ['+12025551234'] },
        content: { body: 'SMS Body', renderer: 'handlebars' },
      }
      const msgAppChannel: NotifyMsgAppChannel = {
        recipients: { to: ['user-123'] },
        content: { body: 'MsgApp Body', renderer: 'handlebars' },
      }

      mockInlineRenderingService.renderEmail.mockResolvedValue({
        subject: 'Email',
        body: 'Email Body',
      })
      mockInlineRenderingService.renderSms.mockResolvedValue({ body: 'SMS Body' })
      mockInlineRenderingService.renderMsgApp.mockResolvedValue({ body: 'MsgApp Body' })

      await service.renderEmailIfInline(emailChannel)
      await service.renderSmsIfInline(smsChannel)
      await service.renderMsgAppIfInline(msgAppChannel)

      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledTimes(1)
      expect(mockInlineRenderingService.renderSms).toHaveBeenCalledTimes(1)
      expect(mockInlineRenderingService.renderMsgApp).toHaveBeenCalledTimes(1)
    })
  })
})
