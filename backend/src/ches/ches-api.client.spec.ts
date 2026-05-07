import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ChesApiClient } from './ches-api.client'
import { ChesOAuthService } from './ches-oauth.service'
import { ConfigService } from '@nestjs/config'
import type { ChesMessageObject } from './schemas/ches-message-object'
import type { ChesMergeRequest } from './schemas/ches-merge-request'
import type { ChesStatusQuery } from './ches-api.client'

const mockConfigService = {
  get: vi.fn(),
}

const mockChesOAuthService = {
  getValidToken: vi.fn(),
}

describe('ChesApiClient', () => {
  let client: ChesApiClient

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChesApiClient,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ChesOAuthService,
          useValue: mockChesOAuthService,
        },
      ],
    }).compile()

    client = module.get<ChesApiClient>(ChesApiClient)
    vi.clearAllMocks()
  })

  describe('sendEmail', () => {
    it('should send email and return transaction response', async () => {
      mockConfigService.get.mockReturnValue('https://ches.example.com/api/v1')

      const token = 'valid-token-123'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        body: 'Test Body',
        bodyType: 'html',
      }

      const mockResponse: any = {
        txId: 'tx-123',
        messages: [{ msgId: 'msg-123', to: ['recipient@example.com'] }],
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.sendEmail(message)

      expect(mockChesOAuthService.getValidToken).toHaveBeenCalled()
      expect(result).toEqual(mockResponse)
    })

    it('should throw BadRequestException on 400 status', async () => {
      const token = 'valid-token-123'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['invalid@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      const errorBody = JSON.stringify({
        errors: [{ message: 'Invalid email address' }],
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => errorBody,
      })

      await expect(client.sendEmail(message)).rejects.toThrow(BadRequestException)
    })

    it('should throw UnauthorizedException on 401 status', async () => {
      const token = 'invalid-token'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await expect(client.sendEmail(message)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('sendEmailMerge', () => {
    it('should send merge request and return array of responses', async () => {
      const token = 'valid-token-123'
      const mergeRequest: ChesMergeRequest = {
        from: 'template@example.com',
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Hello {{name}}',
        body: 'Welcome {{name}}',
        bodyType: 'html',
        data: [{ name: 'John' }, { name: 'Jane' }],
      }

      const mockResponse = [
        { txId: 'tx-1', messages: [{ msgId: 'msg-1', to: ['user1@example.com'] }] },
        { txId: 'tx-2', messages: [{ msgId: 'msg-2', to: ['user2@example.com'] }] },
      ]

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.sendEmailMerge(mergeRequest)

      expect(result).toEqual(mockResponse)
      expect(result.length).toBe(2)
    })
  })

  describe('previewEmailMerge', () => {
    it('should preview merge and return array of messages', async () => {
      const token = 'valid-token-123'
      const mergeRequest: ChesMergeRequest = {
        from: 'template@example.com',
        to: ['user@example.com'],
        subject: 'Hello {{name}}',
        body: 'Welcome {{name}}',
        bodyType: 'html',
        data: [{ name: 'Test User' }],
      }

      const mockResponse = [
        {
          from: 'template@example.com',
          to: ['user@example.com'],
          subject: 'Hello Test User',
          body: 'Welcome Test User',
          bodyType: 'html',
        },
      ]

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.previewEmailMerge(mergeRequest)

      expect(result).toEqual(mockResponse)
    })
  })

  describe('getStatusQuery', () => {
    it('should query status with parameters', async () => {
      const token = 'valid-token-123'
      const query: ChesStatusQuery = {
        status: 'completed',
        tag: 'newsletter',
      }

      const mockResponse = [{ msgId: 'msg-1', status: 'completed', to: 'user@example.com' }]

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.getStatusQuery(query)

      expect(result).toEqual(mockResponse)
    })

    it('should build query string correctly', async () => {
      const token = 'valid-token-123'
      const query: ChesStatusQuery = {
        msgId: 'msg-123',
        status: 'pending',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })

      await client.getStatusQuery(query)

      const fetchCall = (global.fetch as any).mock.calls[0]
      expect(fetchCall[0]).toContain('?')
      expect(fetchCall[0]).toContain('msgId=msg-123')
      expect(fetchCall[0]).toContain('status=pending')
    })
  })

  describe('getStatusMessage', () => {
    it('should get status for single message', async () => {
      const token = 'valid-token-123'
      const msgId = 'msg-456'

      const mockResponse = {
        msgId: 'msg-456',
        status: 'completed',
        to: 'user@example.com',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const result = await client.getStatusMessage(msgId)

      expect(result).toEqual(mockResponse)
    })

    it('should throw NotFoundException on 404', async () => {
      const token = 'valid-token-123'
      const msgId = 'nonexistent-msg'

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Message not found',
      })

      await expect(client.getStatusMessage(msgId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('promoteQuery', () => {
    it('should promote messages with query', async () => {
      const token = 'valid-token-123'
      const query: ChesStatusQuery = {
        status: 'pending',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      })

      const result = await client.promoteQuery(query)

      expect(result).toBeUndefined()
    })
  })

  describe('promoteMessage', () => {
    it('should promote single message', async () => {
      const token = 'valid-token-123'
      const msgId = 'msg-789'

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      })

      const result = await client.promoteMessage(msgId)

      expect(result).toBeUndefined()
    })
  })

  describe('cancelQuery', () => {
    it('should cancel messages with query', async () => {
      const token = 'valid-token-123'
      const query: ChesStatusQuery = {
        tag: 'test-campaign',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      })

      const result = await client.cancelQuery(query)

      expect(result).toBeUndefined()
    })
  })

  describe('cancelMessage', () => {
    it('should cancel single message', async () => {
      const token = 'valid-token-123'
      const msgId = 'msg-cancel'

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      })

      const result = await client.cancelMessage(msgId)

      expect(result).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      const token = 'valid-token-123'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      })

      await expect(client.sendEmail(message)).rejects.toThrow(BadRequestException)
    })

    it('should handle validation errors (422)', async () => {
      const token = 'valid-token-123'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'Validation failed',
      })

      await expect(client.sendEmail(message)).rejects.toThrow(BadRequestException)
    })

    it('should handle non-JSON error responses', async () => {
      const token = 'valid-token-123'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      await expect(client.sendEmail(message)).rejects.toThrow(BadRequestException)
    })
  })

  describe('authentication', () => {
    it('should request valid token before each operation', async () => {
      const token = 'auth-token-xyz'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ txId: 'tx-1' }),
      })

      await client.sendEmail(message)

      expect(mockChesOAuthService.getValidToken).toHaveBeenCalled()
    })

    it('should include bearer token in authorization header', async () => {
      const token = 'bearer-token-abc'
      const message: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        body: 'Test',
        bodyType: 'html',
      }

      mockChesOAuthService.getValidToken.mockResolvedValue(token)
      mockConfigService.get.mockReturnValue('https://ches.example.com')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ txId: 'tx-1' }),
      })

      await client.sendEmail(message)

      const fetchCall = (global.fetch as any).mock.calls[0]
      expect(fetchCall[1].headers.Authorization).toBe(`Bearer ${token}`)
    })
  })
})
