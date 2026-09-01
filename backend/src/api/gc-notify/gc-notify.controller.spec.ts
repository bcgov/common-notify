import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GcNotifyController } from './gc-notify.controller'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { GcNotifyRoutingService } from './gc-notify-routing.service'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../api-keys/entities/api-key-consumer.entity'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { PostBulkRequest } from './schemas/post-bulk-request'
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'

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

  const mockGcNotifyRoutingService = {
    shouldExecuteInternally: vi.fn(),
  }

  const mockGcNotifyInternalExecutionService = {
    sendEmail: vi.fn(),
    sendSms: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
    getTemplates: vi.fn(),
    getTemplate: vi.fn(),
  }

  const mockGcNotifyBulkValidationService = {
    validateRows: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  }

  const TENANT_ID = 'tenant-1'
  const TENANT_EXTERNAL_ID = 'ext-tenant-1'
  const AUTH_HEADER = 'ApiKey-v1 test-api-key-abc123'

  // Guards run before the controller in production; for these unit tests we
  // simulate what GcNotifyServiceGuard already attached to the request.
  const makeReq = () =>
    ({
      gcNotifyAuthHeader: AUTH_HEADER,
      tenantId: TENANT_ID,
      tenantExternalId: TENANT_EXTERNAL_ID,
    }) as any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GcNotifyController],
      providers: [
        { provide: GcNotifyApiClient, useValue: mockGcNotifyApiClient },
        { provide: GcNotifyRoutingService, useValue: mockGcNotifyRoutingService },
        {
          provide: GcNotifyInternalExecutionService,
          useValue: mockGcNotifyInternalExecutionService,
        },
        {
          provide: GcNotifyBulkValidationService,
          useValue: mockGcNotifyBulkValidationService,
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
    mockGcNotifyBulkValidationService.validateRows.mockReturnValue({ valid: true, errors: [] })
  })

  describe('getNotifications', () => {
    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = { notifications: [], links: { current: '/gcnotify/v2/notifications' } }
      mockGcNotifyApiClient.getNotifications.mockResolvedValue(expected)

      const result = await controller.getNotifications(makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_LIST_NOTIFICATIONS,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        {
          template_type: undefined,
          status: undefined,
          reference: undefined,
          older_than: undefined,
          include_jobs: undefined,
        },
        AUTH_HEADER,
      )
      expect(mockGcNotifyInternalExecutionService.getNotifications).not.toHaveBeenCalled()
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
      const expected = { notifications: [], links: { current: '/gcnotify/v2/notifications' } }
      mockGcNotifyInternalExecutionService.getNotifications.mockResolvedValue(expected)

      const result = await controller.getNotifications(makeReq(), 'email')

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'email' }),
        TENANT_ID,
        TENANT_EXTERNAL_ID,
      )
      expect(mockGcNotifyApiClient.getNotifications).not.toHaveBeenCalled()
    })

    it('coerces a single status string into an array', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      mockGcNotifyApiClient.getNotifications.mockResolvedValue({ notifications: [], links: {} })

      await controller.getNotifications(makeReq(), undefined, 'delivered')

      expect(mockGcNotifyApiClient.getNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['delivered'] }),
        AUTH_HEADER,
      )
    })
  })

  describe('sendEmail', () => {
    const emailBody: CreateEmailNotificationRequest = {
      email_address: 'user@example.com',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = {
        id: 'notif-id-1',
        content: { from_email: 'sender@example.com', body: 'Hello', subject: 'Hi' },
        uri: '/gcnotify/v2/notifications/notif-id-1',
        template: { id: 'tpl-1', version: 1, uri: '/gcnotify/v2/template/tpl-1' },
      }
      mockGcNotifyApiClient.sendEmail.mockResolvedValue(expected)

      const result = await controller.sendEmail(emailBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_EMAIL,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.sendEmail).toHaveBeenCalledWith(emailBody, AUTH_HEADER)
      expect(mockGcNotifyInternalExecutionService.sendEmail).not.toHaveBeenCalled()
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
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
        undefined,
      )
      expect(mockGcNotifyApiClient.sendEmail).not.toHaveBeenCalled()
    })
  })

  describe('sendSms', () => {
    const smsBody: CreateSmsNotificationRequest = {
      phone_number: '+12345678901',
      template_id: '12345678-1234-1234-1234-123456789012',
    }

    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = {
        id: 'notif-sms-1',
        content: { body: 'Hello', from_number: '+10000000000' },
        uri: '/gcnotify/v2/notifications/notif-sms-1',
        template: { id: 'tpl-1', version: 1, uri: '/gcnotify/v2/template/tpl-1' },
      }
      mockGcNotifyApiClient.sendSms.mockResolvedValue(expected)

      const result = await controller.sendSms(smsBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_SMS,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.sendSms).toHaveBeenCalledWith(smsBody, AUTH_HEADER)
      expect(mockGcNotifyInternalExecutionService.sendSms).not.toHaveBeenCalled()
    })

    it('forwards a normalizable non-canonical phone number unchanged to upstream GC Notify', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      mockGcNotifyApiClient.sendSms.mockResolvedValue({ id: 'notif-sms-raw' })
      const body = { ...smsBody, phone_number: '250-555-1234' }

      await controller.sendSms(body, makeReq())

      expect(mockGcNotifyApiClient.sendSms).toHaveBeenCalledWith(body, AUTH_HEADER)
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
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
        undefined,
      )
      expect(mockGcNotifyApiClient.sendSms).not.toHaveBeenCalled()
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

    it('validates rows and passes the original request through unchanged', async () => {
      const expected = { data: { id: 'job-id-1', job_status: 'pending', notification_count: 1 } }
      mockGcNotifyApiClient.sendBulk.mockResolvedValue(expected)

      const result = await controller.sendBulk(bulkBody, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyBulkValidationService.validateRows).toHaveBeenCalledWith(bulkBody.rows)
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledWith(bulkBody, AUTH_HEADER)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).not.toHaveBeenCalled()
    })

    it('forwards accepted non-canonical bulk rows unchanged', async () => {
      const body: PostBulkRequest = {
        ...bulkBody,
        rows: [
          ['phone number', 'name'],
          ['250-555-1234', 'Alice'],
        ],
      }
      mockGcNotifyApiClient.sendBulk.mockResolvedValue({ data: { id: 'job-id-raw' } })

      await controller.sendBulk(body, makeReq())

      expect(mockGcNotifyBulkValidationService.validateRows).toHaveBeenCalledWith(body.rows)
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledWith(body, AUTH_HEADER)
    })

    it('rejects all invalid rows atomically with 422 and never calls the upstream client', async () => {
      const messages = [
        'Row 1: "12345" is not a valid E.164 phone number',
        'Row 3: "not-a-number" is not a valid E.164 phone number',
      ]
      mockGcNotifyBulkValidationService.validateRows.mockReturnValue({
        valid: false,
        errors: messages,
      })

      await expect(controller.sendBulk(bulkBody, makeReq())).rejects.toMatchObject({
        status: 422,
        response: {
          errors: messages.map((message) => ({ error: 'ValidationError', message })),
        },
      })
      expect(mockGcNotifyApiClient.sendBulk).not.toHaveBeenCalled()
    })

    it('rejects rows when no phone-number column can be identified', async () => {
      const message = 'A phone number column could not be identified in the header row'
      mockGcNotifyBulkValidationService.validateRows.mockReturnValue({
        valid: false,
        errors: [message],
      })

      await expect(controller.sendBulk(bulkBody, makeReq())).rejects.toMatchObject({
        status: 422,
        response: {
          errors: [{ error: 'ValidationError', message }],
        },
      })
      expect(mockGcNotifyApiClient.sendBulk).not.toHaveBeenCalled()
    })

    it('forwards csv content unchanged without attempting local validation', async () => {
      const csvBody: PostBulkRequest = {
        template_id: '12345678-1234-1234-1234-123456789012',
        name: 'Raw CSV',
        csv: 'phone number,name\nnot-even-a-number,Alice',
      }
      const expected = { data: { id: 'job-id-csv', job_status: 'pending' } }
      mockGcNotifyApiClient.sendBulk.mockResolvedValue(expected)

      await expect(controller.sendBulk(csvBody, makeReq())).resolves.toEqual(expected)
      expect(mockGcNotifyBulkValidationService.validateRows).not.toHaveBeenCalled()
      expect(mockGcNotifyApiClient.sendBulk).toHaveBeenCalledWith(csvBody, AUTH_HEADER)
    })
  })

  describe('getNotificationById', () => {
    const notificationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = { id: notificationId, type: 'email', status: 'delivered' }
      mockGcNotifyApiClient.getNotificationById.mockResolvedValue(expected)

      const result = await controller.getNotificationById(notificationId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_GET_NOTIFICATION,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getNotificationById).toHaveBeenCalledWith(
        notificationId,
        AUTH_HEADER,
      )
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
      const expected = { id: notificationId, type: 'email', status: 'delivered' }
      mockGcNotifyInternalExecutionService.getNotificationById.mockResolvedValue(expected)

      const result = await controller.getNotificationById(notificationId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getNotificationById).toHaveBeenCalledWith(
        notificationId,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getNotificationById).not.toHaveBeenCalled()
    })
  })

  describe('getTemplates', () => {
    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = { templates: [{ id: 'tpl-1', name: 'My Template', type: 'email' }] }
      mockGcNotifyApiClient.getTemplates.mockResolvedValue(expected)

      const result = await controller.getTemplates(undefined, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_LIST_TEMPLATES,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getTemplates).toHaveBeenCalledWith(undefined, AUTH_HEADER)
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
      const expected = { templates: [] }
      mockGcNotifyInternalExecutionService.getTemplates.mockResolvedValue(expected)

      const result = await controller.getTemplates('sms', makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getTemplates).toHaveBeenCalledWith(
        'sms',
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getTemplates).not.toHaveBeenCalled()
    })
  })

  describe('getTemplate', () => {
    const templateId = '11111111-2222-3333-4444-555555555555'

    it('passes through to GcNotifyApiClient when internal routing is disabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(false)
      const expected = { id: templateId, name: 'My Template', type: 'email', body: 'Hello' }
      mockGcNotifyApiClient.getTemplate.mockResolvedValue(expected)

      const result = await controller.getTemplate(templateId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyRoutingService.shouldExecuteInternally).toHaveBeenCalledWith(
        FeatureFlagCode.GC_NOTIFY_ROUTE_GET_TEMPLATE,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getTemplate).toHaveBeenCalledWith(templateId, AUTH_HEADER)
    })

    it('routes to GcNotifyInternalExecutionService when internal routing is enabled', async () => {
      mockGcNotifyRoutingService.shouldExecuteInternally.mockResolvedValue(true)
      const expected = { id: templateId, name: 'My Template', type: 'email', body: 'Hello' }
      mockGcNotifyInternalExecutionService.getTemplate.mockResolvedValue(expected)

      const result = await controller.getTemplate(templateId, makeReq())

      expect(result).toEqual(expected)
      expect(mockGcNotifyInternalExecutionService.getTemplate).toHaveBeenCalledWith(
        templateId,
        TENANT_ID,
      )
      expect(mockGcNotifyApiClient.getTemplate).not.toHaveBeenCalled()
    })
  })
})
