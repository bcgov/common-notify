import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { GcNotifyController } from './gc-notify.controller'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { PostBulkRequest } from './schemas/post-bulk-request'
import { TenantGuard } from 'src/common/guards/tenant.guard'
import type * as express from 'express'

describe('GcNotifyController', () => {
  let controller: GcNotifyController

  const mockGcNotifyApiClient = {
    sendEmail: vi.fn(),
    sendSms: vi.fn(),
    sendBulk: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
    getTemplates: vi.fn(),
    getTemplate: vi.fn(),
  }

  const mockTenantGuard = {
    canActivate: vi.fn().mockReturnValue(true),
  }

  const makeReq = (apiKey?: string): express.Request => {
    return {
      headers: apiKey ? { authorization: `ApiKey-v1 ${apiKey}` } : {},
    } as unknown as express.Request
  }

  const VALID_KEY = 'test-api-key-abc123'
  const EXPECTED_AUTH_HEADER = `ApiKey-v1 ${VALID_KEY}`

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcNotifyController],
      providers: [
        {
          provide: GcNotifyApiClient,
          useValue: mockGcNotifyApiClient,
        },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue(mockTenantGuard)
      .compile()

    controller = module.get<GcNotifyController>(GcNotifyController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('requireAuthHeader (via any endpoint)', () => {
    it('should throw BadRequestException when Authorization header is missing', async () => {
      await expect(controller.getTemplates(undefined, makeReq())).rejects.toThrow(
        BadRequestException,
      )
    })

    it('should throw BadRequestException when Authorization header is blank', async () => {
      await expect(controller.getTemplates(undefined, makeReq('   '))).rejects.toThrow(
        BadRequestException,
      )
    })

    it('should prefix the key with ApiKey-v1 and pass it through', async () => {
      mockGcNotifyApiClient.getTemplates.mockResolvedValue({ templates: [] })
      await controller.getTemplates(undefined, makeReq(VALID_KEY))
      expect(mockGcNotifyApiClient.getTemplates).toHaveBeenCalledWith(
        undefined,
        EXPECTED_AUTH_HEADER,
      )
    })
  })

  describe('getNotifications', () => {
    it('should return a list of notifications', async () => {
      const expected = { notifications: [], links: { current: '/api/gcnotify/v2/notifications' } }
      mockGcNotifyApiClient.getNotifications.mockResolvedValue(expected)

      const result = await controller.getNotifications(makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        {
          template_type: undefined,
          status: undefined,
          reference: undefined,
          older_than: undefined,
          include_jobs: undefined,
        },
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should pass query filters through to the client', async () => {
      mockGcNotifyApiClient.getNotifications.mockResolvedValue({ notifications: [], links: {} })

      await controller.getNotifications(
        makeReq(VALID_KEY),
        'email',
        ['delivered', 'failed'],
        'ref-1',
        'uuid-older',
        true,
      )

      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        {
          template_type: 'email',
          status: ['delivered', 'failed'],
          reference: 'ref-1',
          older_than: 'uuid-older',
          include_jobs: true,
        },
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should coerce a single status string into an array', async () => {
      mockGcNotifyApiClient.getNotifications.mockResolvedValue({ notifications: [], links: {} })

      await controller.getNotifications(makeReq(VALID_KEY), undefined, 'delivered')

      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['delivered'] }),
        EXPECTED_AUTH_HEADER,
      )
    })
  })

  describe('sendEmail', () => {
    const emailBody: CreateEmailNotificationRequest = {
      email_address: 'user@example.com',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('should send an email notification successfully', async () => {
      const expected = {
        id: 'notif-id-1',
        content: { from_email: 'sender@example.com', body: 'Hello', subject: 'Hi' },
        uri: '/api/gcnotify/v2/notifications/notif-id-1',
        template: { id: 'tpl-1', version: 1, uri: '/api/gcnotify/v2/templates/tpl-1' },
      }
      mockGcNotifyApiClient.sendEmail.mockResolvedValue(expected)

      const result = await controller.sendEmail(emailBody, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.sendEmail).toHaveBeenCalledWith(emailBody, EXPECTED_AUTH_HEADER)
      expect(mockGcNotifyApiClient.sendEmail).toHaveBeenCalledTimes(1)
    })

    it('should send an email with personalisation', async () => {
      const bodyWithPersonalisation: CreateEmailNotificationRequest = {
        ...emailBody,
        personalisation: { name: 'Alice' },
      }
      mockGcNotifyApiClient.sendEmail.mockResolvedValue({ id: 'notif-id-2' })

      await controller.sendEmail(bodyWithPersonalisation, makeReq(VALID_KEY))

      expect(mockGcNotifyApiClient.sendEmail).toHaveBeenCalledWith(
        bodyWithPersonalisation,
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.sendEmail(emailBody, makeReq())).rejects.toThrow(BadRequestException)
      expect(mockGcNotifyApiClient.sendEmail).not.toHaveBeenCalled()
    })
  })

  describe('sendSms', () => {
    const smsBody: CreateSmsNotificationRequest = {
      phone_number: '+12345678901',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('should send an SMS notification successfully', async () => {
      const expected = {
        id: 'notif-sms-1',
        content: { body: 'Hello', from_number: '+10000000000' },
        uri: '/api/gcnotify/v2/notifications/notif-sms-1',
        template: { id: 'tpl-1', version: 1, uri: '/api/gcnotify/v2/templates/tpl-1' },
      }
      mockGcNotifyApiClient.sendSms.mockResolvedValue(expected)

      const result = await controller.sendSms(smsBody, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.sendSms).toHaveBeenCalledWith(smsBody, EXPECTED_AUTH_HEADER)
      expect(mockGcNotifyApiClient.sendSms).toHaveBeenCalledTimes(1)
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.sendSms(smsBody, makeReq())).rejects.toThrow(BadRequestException)
      expect(mockGcNotifyApiClient.sendSms).not.toHaveBeenCalled()
    })
  })

  describe('sendBulk', () => {
    const bulkBody: PostBulkRequest = {
      template_id: '12345678-1234-1234-1234-123456789012',
      name: 'January Reminders',
      rows: [
        ['email address', 'name'],
        ['alice@example.com', 'Alice'],
      ],
    }

    it('should create a bulk notification job successfully', async () => {
      const expected = { data: { id: 'job-id-1', job_status: 'pending', notification_count: 1 } }
      mockGcNotifyApiClient.sendBulk.mockResolvedValue(expected)

      const result = await controller.sendBulk(bulkBody, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledWith(bulkBody, EXPECTED_AUTH_HEADER)
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledTimes(1)
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.sendBulk(bulkBody, makeReq())).rejects.toThrow(BadRequestException)
      expect(mockGcNotifyApiClient.sendBulk).not.toHaveBeenCalled()
    })
  })

  describe('getNotificationById', () => {
    const notificationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    it('should return a notification by ID', async () => {
      const expected = { id: notificationId, type: 'email', status: 'delivered' }
      mockGcNotifyApiClient.getNotificationById.mockResolvedValue(expected)

      const result = await controller.getNotificationById(notificationId, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.getNotificationById).toHaveBeenCalledWith(
        notificationId,
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.getNotificationById(notificationId, makeReq())).rejects.toThrow(
        BadRequestException,
      )
      expect(mockGcNotifyApiClient.getNotificationById).not.toHaveBeenCalled()
    })
  })

  describe('getTemplates', () => {
    it('should return a list of all templates', async () => {
      const expected = { templates: [{ id: 'tpl-1', name: 'My Template', type: 'email' }] }
      mockGcNotifyApiClient.getTemplates.mockResolvedValue(expected)

      const result = await controller.getTemplates(undefined, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.getTemplates).toHaveBeenCalledWith(
        undefined,
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should filter templates by type', async () => {
      mockGcNotifyApiClient.getTemplates.mockResolvedValue({ templates: [] })

      await controller.getTemplates('sms', makeReq(VALID_KEY))

      expect(mockGcNotifyApiClient.getTemplates).toHaveBeenCalledWith('sms', EXPECTED_AUTH_HEADER)
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.getTemplates(undefined, makeReq())).rejects.toThrow(
        BadRequestException,
      )
      expect(mockGcNotifyApiClient.getTemplates).not.toHaveBeenCalled()
    })
  })

  describe('getTemplate', () => {
    const templateId = '11111111-2222-3333-4444-555555555555'

    it('should return a template by ID', async () => {
      const expected = { id: templateId, name: 'My Template', type: 'email', body: 'Hello' }
      mockGcNotifyApiClient.getTemplate.mockResolvedValue(expected)

      const result = await controller.getTemplate(templateId, makeReq(VALID_KEY))

      expect(result).toEqual(expected)
      expect(mockGcNotifyApiClient.getTemplate).toHaveBeenCalledWith(
        templateId,
        EXPECTED_AUTH_HEADER,
      )
    })

    it('should throw when GC Notify api key header is missing', async () => {
      await expect(controller.getTemplate(templateId, makeReq())).rejects.toThrow(
        BadRequestException,
      )
      expect(mockGcNotifyApiClient.getTemplate).not.toHaveBeenCalled()
    })
  })
})
