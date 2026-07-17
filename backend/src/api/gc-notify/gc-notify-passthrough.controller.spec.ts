import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GcNotifyPassthroughController } from './gc-notify-passthrough.controller'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { PostBulkRequest } from './schemas/post-bulk-request'

describe('GcNotifyPassthroughController', () => {
  let controller: GcNotifyPassthroughController

  const mockGcNotifyApiClient = {
    sendEmail: vi.fn(),
    sendSms: vi.fn(),
    sendBulk: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
    getTemplates: vi.fn(),
    getTemplate: vi.fn(),
  }

  const AUTH_HEADER = 'ApiKey-v1 test-api-key-abc123'

  // Simulates what ApiKeyGuard attaches to the request.
  const makeReq = () => ({ gcNotifyAuthHeader: AUTH_HEADER }) as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcNotifyPassthroughController],
      providers: [{ provide: GcNotifyApiClient, useValue: mockGcNotifyApiClient }],
    }).compile()

    controller = module.get<GcNotifyPassthroughController>(GcNotifyPassthroughController)

    Object.values(mockGcNotifyApiClient).forEach((fn) => fn.mockReset())
  })

  describe('sendEmail', () => {
    it('always calls GcNotifyApiClient.sendEmail and forwards the auth header', async () => {
      const body: CreateEmailNotificationRequest = {
        email_address: 'user@example.com',
        template_id: 'tpl-1',
      }
      const expected = { id: 'notif-1' }
      mockGcNotifyApiClient.sendEmail.mockResolvedValue(expected)

      const result = await controller.sendEmail(body, makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.sendEmail).toHaveBeenCalledWith(body, AUTH_HEADER)
    })
  })

  describe('sendSms', () => {
    it('always calls GcNotifyApiClient.sendSms and forwards the auth header', async () => {
      const body: CreateSmsNotificationRequest = {
        phone_number: '+15555550100',
        template_id: 'tpl-2',
      }
      const expected = { id: 'notif-2' }
      mockGcNotifyApiClient.sendSms.mockResolvedValue(expected)

      const result = await controller.sendSms(body, makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.sendSms).toHaveBeenCalledWith(body, AUTH_HEADER)
    })
  })

  describe('sendBulk', () => {
    it('always calls GcNotifyApiClient.sendBulk and forwards the auth header', async () => {
      const body = { name: 'batch', template_id: 'tpl-1', rows: [] } as PostBulkRequest
      const expected = { id: 'job-1' }
      mockGcNotifyApiClient.sendBulk.mockResolvedValue(expected)

      const result = await controller.sendBulk(body, makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledWith(body, AUTH_HEADER)
    })
  })

  describe('getNotificationById', () => {
    it('always calls GcNotifyApiClient.getNotificationById and forwards the auth header', async () => {
      const expected = { id: 'notif-3' }
      mockGcNotifyApiClient.getNotificationById.mockResolvedValue(expected)

      const result = await controller.getNotificationById('notif-3', makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.getNotificationById).toHaveBeenCalledWith('notif-3', AUTH_HEADER)
    })
  })

  describe('getNotifications', () => {
    it('always calls GcNotifyApiClient.getNotifications and forwards the auth header', async () => {
      const expected = { notifications: [], links: {} }
      mockGcNotifyApiClient.getNotifications.mockResolvedValue(expected)

      const result = await controller.getNotifications(makeReq(), 'email', undefined, 'ref-1')

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'email', reference: 'ref-1' }),
        AUTH_HEADER,
      )
    })
  })

  describe('getTemplate', () => {
    it('always calls GcNotifyApiClient.getTemplate and forwards the auth header', async () => {
      const expected = { id: 'tpl-1' }
      mockGcNotifyApiClient.getTemplate.mockResolvedValue(expected)

      const result = await controller.getTemplate('tpl-1', makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.getTemplate).toHaveBeenCalledWith('tpl-1', AUTH_HEADER)
    })
  })

  describe('getTemplates', () => {
    it('always calls GcNotifyApiClient.getTemplates and forwards the auth header', async () => {
      const expected = { templates: [] }
      mockGcNotifyApiClient.getTemplates.mockResolvedValue(expected)

      const result = await controller.getTemplates('email', makeReq())

      expect(result).toBe(expected)
      expect(mockGcNotifyApiClient.getTemplates).toHaveBeenCalledWith('email', AUTH_HEADER)
    })
  })
})
