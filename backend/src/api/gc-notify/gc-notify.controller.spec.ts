import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GcNotifyController } from './gc-notify.controller'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../api-keys/entities/api-key-consumer.entity'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { PostBulkRequest } from './schemas/post-bulk-request'

describe('GcNotifyController', () => {
  let controller: GcNotifyController

  const mockGcNotifyInternalExecutionService = {
    sendBulk: vi.fn(),
    sendEmail: vi.fn(),
    sendSms: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
    getTemplates: vi.fn(),
    getTemplate: vi.fn(),
  }

  const TENANT_ID = 'tenant-1'
  const API_KEY_CONSUMER_ID = 'consumer-1'
  const TENANT_EXTERNAL_ID = 'ext-tenant-1'

  // Guards run before the controller in production; for these unit tests we
  // simulate what GcNotifyServiceGuard already attached to the request.
  const makeReq = () =>
    ({
      tenantId: TENANT_ID,
      apiKeyConsumerId: API_KEY_CONSUMER_ID,
      tenantExternalId: TENANT_EXTERNAL_ID,
    }) as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcNotifyController],
      providers: [
        {
          provide: GcNotifyInternalExecutionService,
          useValue: mockGcNotifyInternalExecutionService,
        },
        // GcNotifyServiceGuard is referenced by @UseGuards() on the controller, so
        // Nest's DI container instantiates it during module compilation even
        // though guards aren't executed when calling controller methods directly
        // in these unit tests - its repository dependencies just need to resolve.
        { provide: getRepositoryToken(Tenant), useValue: {} },
        { provide: getRepositoryToken(ApiKeyConsumer), useValue: {} },
      ],
    }).compile()

    controller = module.get<GcNotifyController>(GcNotifyController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getNotifications', () => {
    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = { notifications: [], links: { current: '/gcnotify/v2/notifications' } }
      mockGcNotifyInternalExecutionService.getNotifications.mockResolvedValue(expected)

      const result = await controller.getNotifications(makeReq(), 'email')

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'email' }),
        TENANT_ID,
        TENANT_EXTERNAL_ID,
      )
    })

    it('coerces a single status string into an array', async () => {
      mockGcNotifyInternalExecutionService.getNotifications.mockResolvedValue({
        notifications: [],
        links: {},
      })

      await controller.getNotifications(makeReq(), undefined, 'delivered')

      expect(mockGcNotifyInternalExecutionService.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['delivered'] }),
        TENANT_ID,
        TENANT_EXTERNAL_ID,
      )
    })
  })

  describe('sendEmail', () => {
    const emailBody: CreateEmailNotificationRequest = {
      email_address: 'user@example.com',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = {
        id: 'notif-id-2',
        content: { from_email: 'sender@example.com', body: 'Hello', subject: 'Hi' },
        uri: '/gcnotify/v2/notifications/notif-id-2',
        template: { id: 'tpl-1', version: 1, uri: '/gcnotify/v2/template/tpl-1' },
      }
      mockGcNotifyInternalExecutionService.sendEmail.mockResolvedValue(expected)

      const result = await controller.sendEmail(emailBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.sendEmail).toHaveBeenCalledWith(
        emailBody,
        TENANT_ID,
        API_KEY_CONSUMER_ID,
        undefined,
      )
    })
  })

  describe('sendSms', () => {
    const smsBody: CreateSmsNotificationRequest = {
      phone_number: '+12345678901',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = {
        id: 'notif-sms-2',
        content: { body: 'Hello', from_number: '+10000000000' },
        uri: '/gcnotify/v2/notifications/notif-sms-2',
        template: { id: 'tpl-1', version: 1, uri: '/gcnotify/v2/template/tpl-1' },
      }
      mockGcNotifyInternalExecutionService.sendSms.mockResolvedValue(expected)

      const result = await controller.sendSms(smsBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.sendSms).toHaveBeenCalledWith(
        smsBody,
        TENANT_ID,
        API_KEY_CONSUMER_ID,
        undefined,
      )
    })
  })

  describe('sendBulk', () => {
    const bulkBody: PostBulkRequest = {
      template_id: '12345678-1234-1234-1234-123456789012',
      name: 'January Reminders',
      rows: [
        ['phone number', 'name'],
        ['+12505551234', 'Alice'],
      ],
    }

    // Row validation, csv parsing and the merge translation live in
    // GcNotifyInternalExecutionService and are covered by its own spec. The controller only
    // delegates - there is no upstream client left for it to choose between.
    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = { data: { id: 'job-id-1', job_status: 'pending', notification_count: 1 } }
      mockGcNotifyInternalExecutionService.sendBulk.mockResolvedValue(expected)

      const result = await controller.sendBulk(bulkBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.sendBulk).toHaveBeenCalledWith(
        bulkBody,
        TENANT_ID,
        API_KEY_CONSUMER_ID,
        undefined,
      )
    })
  })

  describe('getNotificationById', () => {
    const notificationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = { id: notificationId, type: 'email', status: 'delivered' }
      mockGcNotifyInternalExecutionService.getNotificationById.mockResolvedValue(expected)

      const result = await controller.getNotificationById(notificationId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getNotificationById).toHaveBeenCalledWith(
        notificationId,
        TENANT_ID,
      )
    })
  })

  describe('getTemplates', () => {
    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = { templates: [] }
      mockGcNotifyInternalExecutionService.getTemplates.mockResolvedValue(expected)

      const result = await controller.getTemplates('sms', makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getTemplates).toHaveBeenCalledWith(
        'sms',
        TENANT_ID,
      )
    })
  })

  describe('getTemplate', () => {
    const templateId = '11111111-2222-3333-4444-555555555555'

    it('executes internally through GcNotifyInternalExecutionService', async () => {
      const expected = { id: templateId, name: 'My Template', type: 'email', body: 'Hello' }
      mockGcNotifyInternalExecutionService.getTemplate.mockResolvedValue(expected)

      const result = await controller.getTemplate(templateId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getTemplate).toHaveBeenCalledWith(
        templateId,
        TENANT_ID,
      )
    })
  })
})
