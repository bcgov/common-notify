import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ChesController } from './ches.controller'
import { ChesApiClient } from './ches-api.client'
import { ChesMessageObject } from './schemas/ches-message-object'
import { ChesMergeRequest } from './schemas/ches-merge-request'
import { TenantGuard } from 'src/common/guards/tenant.guard'

describe('ChesController', () => {
  let controller: ChesController

  const mockChesApiClient = {
    sendEmail: vi.fn(),
    sendEmailMerge: vi.fn(),
    previewEmailMerge: vi.fn(),
    getTransactionStatus: vi.fn(),
    getMessageStatus: vi.fn(),
    updateStatusCallbackUrl: vi.fn(),
    getStatusCallbackUrl: vi.fn(),
    deleteStatusCallbackUrl: vi.fn(),
    getStatusCallbackUrls: vi.fn(),
  }

  const mockTenantGuard = {
    canActivate: vi.fn().mockReturnValue(true),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChesController],
      providers: [
        {
          provide: ChesApiClient,
          useValue: mockChesApiClient,
        },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue(mockTenantGuard)
      .compile()

    controller = module.get<ChesController>(ChesController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('postEmail', () => {
    it('should send an email successfully', async () => {
      const emailMessage: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        body: 'This is a test email',
        bodyType: 'text',
      }

      const expectedResponse = {
        txId: 'tx-123',
        messages: [{ msgId: 'msg-123', to: ['recipient@example.com'], delayTs: null }],
      }

      mockChesApiClient.sendEmail.mockResolvedValue(expectedResponse)

      const result = await controller.postEmail(emailMessage)

      expect(result).toEqual(expectedResponse)
      expect(mockChesApiClient.sendEmail).toHaveBeenCalledWith(emailMessage)
      expect(mockChesApiClient.sendEmail).toHaveBeenCalledTimes(1)
    })

    it('should handle email with HTML body', async () => {
      const emailMessage: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test HTML Email',
        body: '<h1>Hello</h1><p>This is HTML</p>',
        bodyType: 'html',
      }

      const expectedResponse = {
        txId: 'tx-124',
        messages: [{ msgId: 'msg-124', to: ['recipient@example.com'] }],
      }

      mockChesApiClient.sendEmail.mockResolvedValue(expectedResponse)

      const result = await controller.postEmail(emailMessage)

      expect(result).toEqual(expectedResponse)
      expect(mockChesApiClient.sendEmail).toHaveBeenCalledWith(emailMessage)
    })

    it('should handle email with cc and bcc', async () => {
      const emailMessage: ChesMessageObject = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test Email with CC/BCC',
        body: 'Email body',
        bodyType: 'text',
      }

      const expectedResponse = {
        txId: 'tx-125',
        messages: [{ msgId: 'msg-125', to: ['recipient@example.com'] }],
      }

      mockChesApiClient.sendEmail.mockResolvedValue(expectedResponse)

      const result = await controller.postEmail(emailMessage)

      expect(result).toEqual(expectedResponse)
      expect(mockChesApiClient.sendEmail).toHaveBeenCalledWith(emailMessage)
    })
  })

  describe('postMerge', () => {
    it('should send merge emails successfully', async () => {
      const mergeRequest: ChesMergeRequest = {
        from: 'sender@example.com',
        subject: 'Merge Email',
        body: 'Hello {{name}}, this is your message',
        bodyType: 'text',
        contexts: [
          {
            context: { name: 'User 1' },
            to: ['recipient1@example.com'],
          },
          {
            context: { name: 'User 2' },
            to: ['recipient2@example.com'],
          },
        ],
      }

      const expectedResponse = [
        { txId: 'tx-200', messages: [{ msgId: 'msg-200', to: ['recipient1@example.com'] }] },
        { txId: 'tx-201', messages: [{ msgId: 'msg-201', to: ['recipient2@example.com'] }] },
      ]

      mockChesApiClient.sendEmailMerge.mockResolvedValue(expectedResponse)

      const result = await controller.postMerge(mergeRequest)

      expect(result).toEqual(expectedResponse)
      expect(mockChesApiClient.sendEmailMerge).toHaveBeenCalledWith(mergeRequest)
    })
  })

  describe('getStatusQuery', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for getStatusQuery method
      expect(true).toBe(true)
    })
  })

  describe('getStatusMessage', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for getStatusMessage method
      expect(true).toBe(true)
    })
  })

  describe('postPromoteQuery', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for postPromoteQuery method
      expect(true).toBe(true)
    })
  })

  describe('postPromoteMessage', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for postPromoteMessage method
      expect(true).toBe(true)
    })
  })

  describe('deleteCancelQuery', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for deleteCancelQuery method
      expect(true).toBe(true)
    })
  })

  describe('deleteCancelMessage', () => {
    it('should be skipped for now', () => {
      // TODO: Add tests for deleteCancelMessage method
      expect(true).toBe(true)
    })
  })

  describe('postPreview', () => {
    it('should preview merge emails successfully', async () => {
      const mergeRequest: ChesMergeRequest = {
        from: 'sender@example.com',
        subject: 'Merge Email Preview',
        body: 'Hello {{name}}, here is your preview',
        bodyType: 'text',
        contexts: [
          {
            context: { name: 'User 1' },
            to: ['recipient1@example.com'],
          },
          {
            context: { name: 'User 2' },
            to: ['recipient2@example.com'],
          },
        ],
      }

      const expectedResponse: ChesMessageObject[] = [
        {
          from: 'sender@example.com',
          to: ['recipient1@example.com'],
          subject: 'Merge Email Preview',
          body: 'Hello User 1, here is your preview',
          bodyType: 'text',
        },
        {
          from: 'sender@example.com',
          to: ['recipient2@example.com'],
          subject: 'Merge Email Preview',
          body: 'Hello User 2, here is your preview',
          bodyType: 'text',
        },
      ]

      mockChesApiClient.previewEmailMerge.mockResolvedValue(expectedResponse)

      const result = await controller.postPreview(mergeRequest)

      expect(result).toEqual(expectedResponse)
      expect(mockChesApiClient.previewEmailMerge).toHaveBeenCalledWith(mergeRequest)
    })
  })
})
