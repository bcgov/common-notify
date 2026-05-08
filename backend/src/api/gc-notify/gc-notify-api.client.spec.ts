import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GcNotifyApiClient } from './gc-notify-api.client'

const mockConfigService = {
  get: vi.fn(),
}

describe('GcNotifyApiClient', () => {
  let client: GcNotifyApiClient

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcNotifyApiClient,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    client = module.get<GcNotifyApiClient>(GcNotifyApiClient)
    vi.clearAllMocks()
  })

  describe('getBaseUrl', () => {
    it('should throw error when GC_NOTIFY_BASE_URL is not configured', () => {
      mockConfigService.get.mockReturnValue(undefined)

      expect(() => (client as any).getBaseUrl()).toThrow(
        'GC_NOTIFY_BASE_URL is required when using GC Notify passthrough mode',
      )
    })

    it('should remove trailing slash from URL', () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com/')

      const baseUrl = (client as any).getBaseUrl()

      expect(baseUrl).toBe('https://gcnotify.example.com')
    })

    it('should return URL without modification if no trailing slash', () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const baseUrl = (client as any).getBaseUrl()

      expect(baseUrl).toBe('https://gcnotify.example.com')
    })
  })

  describe('sendEmail', () => {
    it('should send email notification', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
        personalisation: { name: 'John' },
        reference: 'ref-123',
      }

      const mockResponse = {
        id: 'notif-456',
        reference: 'ref-123',
        content: {
          subject: 'Hello John',
          body: 'Welcome John',
          from_email: 'noreply@example.com',
        },
        uri: '/api/gcnotify/v2/notifications/notif-456',
        template: {
          id: 'template-123',
          version: 1,
          uri: '/api/gcnotify/v2/templates/template-123',
        },
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.sendEmail(request, 'apikey-123')

      expect(result.id).toBe('notif-456')
      expect(result.content.from_email).toBe('noreply@example.com')
    })

    it('should throw UnauthorizedException on 401', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ errors: [{ message: 'Invalid API key' }] }),
      })

      await expect(client.sendEmail(request, 'invalid-key')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw BadRequestException on 400', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'invalid-email',
        template_id: 'template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ message: 'Invalid email' }] }),
      })

      await expect(client.sendEmail(request, 'apikey-123')).rejects.toThrow(BadRequestException)
    })

    it('should throw NotFoundException on 404', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'missing-template',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ errors: [{ message: 'Template not found' }] }),
      })

      await expect(client.sendEmail(request, 'apikey-123')).rejects.toThrow(NotFoundException)
    })

    it('should include personalisation in request payload', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
        personalisation: { firstName: 'John', lastName: 'Doe' },
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notif-1',
          reference: undefined,
          content: {
            subject: 'Test',
            body: 'Test',
            from_email: 'noreply@example.com',
          },
          uri: '/api/v2/notifications/notif-1',
          template: { id: 'template-123', version: 1, uri: '/api/v2/templates/template-123' },
        }),
      })

      await client.sendEmail(request, 'apikey-123')

      const fetchCall = (global.fetch as any).mock.calls[0]
      const bodyText = fetchCall[1].body
      const bodyObj = JSON.parse(bodyText)

      expect(bodyObj.personalisation).toBeDefined()
      expect(bodyObj.personalisation.firstName).toBe('John')
    })

    it('should handle file attachments in personalisation', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
        personalisation: {
          document: {
            file: 'base64-encoded-content',
            filename: 'document.pdf',
            sending_method: 'attach',
          },
        },
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notif-1',
          content: { subject: 'Test', body: 'Test', from_email: 'noreply@example.com' },
          uri: '/api/v2/notifications/notif-1',
          template: { id: 'template-123', version: 1, uri: '/api/v2/templates/template-123' },
        }),
      })

      await client.sendEmail(request, 'apikey-123')

      const fetchCall = (global.fetch as any).mock.calls[0]
      const bodyText = fetchCall[1].body
      const bodyObj = JSON.parse(bodyText)

      expect(bodyObj.personalisation.document).toBeDefined()
      expect(bodyObj.personalisation.document.filename).toBe('document.pdf')
    })
  })

  describe('sendSms', () => {
    it('should send SMS notification', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        phone_number: '+12025551234',
        template_id: 'sms-template-123',
        personalisation: { code: 'ABC123' },
        reference: 'ref-sms-123',
      }

      const mockResponse = {
        id: 'notif-sms-456',
        reference: 'ref-sms-123',
        content: {
          body: 'Your code is ABC123',
          from_number: '+16175551234',
        },
        uri: '/api/gcnotify/v2/notifications/notif-sms-456',
        template: {
          id: 'sms-template-123',
          version: 1,
          uri: '/api/gcnotify/v2/templates/sms-template-123',
        },
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.sendSms(request, 'apikey-123')

      expect(result.id).toBe('notif-sms-456')
      expect(result.content.from_number).toBe('+16175551234')
    })

    it('should throw UnauthorizedException on 401 for SMS', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        phone_number: '+12025551234',
        template_id: 'sms-template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await expect(client.sendSms(request, 'invalid-key')).rejects.toThrow(UnauthorizedException)
    })

    it('should throw NotFoundException on 404 for SMS', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        phone_number: '+12025551234',
        template_id: 'missing-template',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Template not found',
      })

      await expect(client.sendSms(request, 'apikey-123')).rejects.toThrow(NotFoundException)
    })

    it('should include personalisation in SMS request', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        phone_number: '+12025551234',
        template_id: 'sms-template-123',
        personalisation: { verificationCode: '123456' },
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notif-1',
          content: { body: 'Code: 123456', from_number: '+16175551234' },
          uri: '/api/v2/notifications/notif-1',
          template: {
            id: 'sms-template-123',
            version: 1,
            uri: '/api/v2/templates/sms-template-123',
          },
        }),
      })

      await client.sendSms(request, 'apikey-123')

      const fetchCall = (global.fetch as any).mock.calls[0]
      const bodyText = fetchCall[1].body
      const bodyObj = JSON.parse(bodyText)

      expect(bodyObj.personalisation.verificationCode).toBe('123456')
    })
  })

  describe('error handling', () => {
    it('should handle rate limit (429)', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Too many requests',
      })

      await expect(client.sendEmail(request, 'apikey-123')).rejects.toThrow(BadRequestException)
    })

    it('should handle non-JSON error responses', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '<html>Internal Server Error</html>',
      })

      await expect(client.sendEmail(request, 'apikey-123')).rejects.toThrow(BadRequestException)
    })

    it('should extract error message from response body', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      const errorMessage = 'Template version is archived'

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ message: errorMessage }] }),
      })

      try {
        await client.sendEmail(request, 'apikey-123')
      } catch (error: any) {
        expect(error.message).toContain(errorMessage)
      }
    })
  })

  describe('authentication', () => {
    it('should use Authorization header for API key', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      const apiKey = 'my-api-key-12345'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notif-1',
          content: { subject: 'Test', body: 'Test', from_email: 'noreply@example.com' },
          uri: '/api/v2/notifications/notif-1',
          template: { id: 'template-123', version: 1, uri: '/api/v2/templates/template-123' },
        }),
      })

      await client.sendEmail(request, apiKey)

      const fetchCall = (global.fetch as any).mock.calls[0]
      expect(fetchCall[1].headers.Authorization).toBe(apiKey)
    })

    it('should set content type header', async () => {
      mockConfigService.get.mockReturnValue('https://gcnotify.example.com')

      const request: any = {
        email_address: 'user@example.com',
        template_id: 'template-123',
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notif-1',
          content: { subject: 'Test', body: 'Test', from_email: 'noreply@example.com' },
          uri: '/api/v2/notifications/notif-1',
          template: { id: 'template-123', version: 1, uri: '/api/v2/templates/template-123' },
        }),
      })

      await client.sendEmail(request, 'apikey-123')

      const fetchCall = (global.fetch as any).mock.calls[0]
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json')
    })
  })

  describe('mapPersonalisation', () => {
    it('should return undefined for empty personalisation', () => {
      const result = (client as any).mapPersonalisation({})

      expect(result).toBeUndefined()
    })

    it('should return undefined for undefined personalisation', () => {
      const result = (client as any).mapPersonalisation(undefined)

      expect(result).toBeUndefined()
    })

    it('should map string values', () => {
      const personalisation = {
        name: 'John',
        email: 'john@example.com',
      }

      const result = (client as any).mapPersonalisation(personalisation)

      expect(result.name).toBe('John')
      expect(result.email).toBe('john@example.com')
    })

    it('should map file attachment values', () => {
      const personalisation: any = {
        attachment: {
          file: 'base64-content',
          filename: 'document.pdf',
          sending_method: 'attach',
        },
      }

      const result = (client as any).mapPersonalisation(personalisation)

      expect(result.attachment.file).toBe('base64-content')
      expect(result.attachment.filename).toBe('document.pdf')
      expect(result.attachment.sending_method).toBe('attach')
    })

    it('should handle mixed string and file attachments', () => {
      const personalisation: any = {
        name: 'John',
        document: {
          file: 'base64-doc',
          filename: 'contract.pdf',
          sending_method: 'link',
        },
      }

      const result = (client as any).mapPersonalisation(personalisation)

      expect(result.name).toBe('John')
      expect(result.document.filename).toBe('contract.pdf')
    })
  })
})
