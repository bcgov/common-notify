import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'
import { UsagePeriodType } from '../../../enum/usage-period-type.enum'
import { NotificationStatus } from '../../../enum/notification-status.enum'
import { QueueName } from '../../../enum/queue-name.enum'
import { ClaimedLimitAlert, LimitAlertService } from '../../api-keys/limit-alert.service'
import { NotificationService } from '../../notification/notification.service'
import {
  buildLimitAlertEmail,
  LimitAlertNotificationService,
  ProcessLimitAlertNotificationsInput,
} from './limit-alert-notification.service'

describe('LimitAlertNotificationService', () => {
  let service: LimitAlertNotificationService

  const limitAlertService = {
    evaluateAndClaim: vi.fn(),
    markNotificationCreated: vi.fn(),
    markEnqueued: vi.fn(),
  }
  const notificationService = {
    create: vi.fn(),
    update: vi.fn(),
  }
  const ingestionQueue = {
    add: vi.fn(),
  }

  const dayWarning: ClaimedLimitAlert = {
    alertLogId: 'alert-log-day',
    tenantId: 'tenant-1',
    recipientEmail: 'operations@example.com',
    apiKeyConsumerId: 'consumer-1',
    channelCode: 'EMAIL',
    periodTypeCode: 'DAY',
    alertLevel: 'WARN',
    periodStart: new Date('2026-07-29T00:00:00.000Z'),
    sentCount: 80,
    limit: 100,
    percent: 80,
  }

  const annualSmsReached: ClaimedLimitAlert = {
    alertLogId: 'alert-log-year',
    tenantId: 'tenant-2',
    recipientEmail: 'tenant-ops@example.com',
    apiKeyConsumerId: 'consumer-2',
    channelCode: 'SMS',
    periodTypeCode: 'YEAR',
    alertLevel: 'LIMIT_REACHED',
    periodStart: new Date('2026-04-01T00:00:00.000Z'),
    sentCount: 1_250,
    limit: 1_000,
    percent: 125,
  }

  const acceptedUsageInput: ProcessLimitAlertNotificationsInput = {
    apiKeyConsumerId: 'consumer-1',
    usageResults: [
      {
        channelCode: 'EMAIL',
        periodTypeCode: UsagePeriodType.DAY,
        periodStart: dayWarning.periodStart,
        sentCount: dayWarning.sentCount,
      },
    ],
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LimitAlertNotificationService,
        {
          provide: LimitAlertService,
          useValue: limitAlertService,
        },
        {
          provide: NotificationService,
          useValue: notificationService,
        },
        {
          provide: QueueName.INGESTION,
          useValue: ingestionQueue,
        },
      ],
    }).compile()

    service = module.get(LimitAlertNotificationService)
    vi.clearAllMocks()
    limitAlertService.evaluateAndClaim.mockResolvedValue([])
    limitAlertService.markNotificationCreated.mockResolvedValue(undefined)
    limitAlertService.markEnqueued.mockResolvedValue(undefined)
    notificationService.create.mockResolvedValue({
      id: 'notification-1',
      createdAt: new Date('2026-07-29T23:59:59.999Z'),
    })
    notificationService.update.mockResolvedValue(undefined)
    ingestionQueue.add.mockResolvedValue({ id: 'notification-1' })
  })

  it.each([
    { apiKeyConsumerId: '', usageResults: acceptedUsageInput.usageResults },
    { apiKeyConsumerId: 'consumer-1', usageResults: [] },
  ])('performs no work for empty input', async (input) => {
    await expect(service.processAcceptedUsage(input)).resolves.toBeUndefined()

    expect(limitAlertService.evaluateAndClaim).not.toHaveBeenCalled()
    expect(notificationService.create).not.toHaveBeenCalled()
    expect(ingestionQueue.add).not.toHaveBeenCalled()
  })

  it('performs no notification or queue work when no alerts are claimed', async () => {
    await service.processAcceptedUsage(acceptedUsageInput)

    expect(limitAlertService.evaluateAndClaim).toHaveBeenCalledWith(acceptedUsageInput)
    expect(notificationService.create).not.toHaveBeenCalled()
    expect(ingestionQueue.add).not.toHaveBeenCalled()
  })

  it('creates a tenant-scoped EMAIL notification with deterministic warning content', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])

    await service.processAcceptedUsage(acceptedUsageInput)

    expect(notificationService.create).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: NotificationStatus.PENDING,
      createdBy: 'tenant-1',
      payload: {
        email: {
          recipients: { to: ['operations@example.com'] },
          content: {
            subject: 'BC Notify usage warning: EMAIL daily limit at 80%',
            body: [
              'BC Notify usage alert',
              '',
              'Tenant: tenant-1',
              'Monitored channel: EMAIL',
              'Period: daily',
              'Alert level: Warning',
              'Current sent count: 80',
              'Configured limit: 100',
              'Usage: 80%',
              'Period start: 2026-07-29T00:00:00.000Z',
            ].join('\n'),
            bodyType: 'text',
          },
        },
      },
    })
  })

  it('creates an EMAIL alert for an SMS annual limit-reached claim', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([annualSmsReached])

    await service.processAcceptedUsage(acceptedUsageInput)

    const createInput = notificationService.create.mock.calls[0][0]
    expect(createInput.payload).not.toHaveProperty('sms')
    expect(createInput.payload.email).toMatchObject({
      recipients: { to: ['tenant-ops@example.com'] },
      content: {
        subject: 'BC Notify usage limit reached: SMS annual limit',
      },
    })
    expect(createInput.payload.email.content.body).toContain('Monitored channel: SMS')
    expect(createInput.payload.email.content.body).toContain('Alert level: Limit reached')
    expect(createInput.payload.email.content.body).toContain('Current sent count: 1250')
  })

  it('does not include an API key value in generated content', () => {
    const content = buildLimitAlertEmail(dayWarning)

    expect(JSON.stringify(content)).not.toContain('raw-api-key-secret')
    expect(JSON.stringify(content)).not.toContain(dayWarning.apiKeyConsumerId)
  })

  it('enqueues with the established ingestion payload and job options', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])

    await service.processAcceptedUsage(acceptedUsageInput)

    const createdPayload = notificationService.create.mock.calls[0][0].payload
    expect(ingestionQueue.add).toHaveBeenCalledWith(
      {
        notifyId: 'notification-1',
        tenantId: 'tenant-1',
        request: createdPayload,
        requestedAt: expect.any(String),
      },
      {
        jobId: 'notification-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    )
    expect(notificationService.update).toHaveBeenCalledWith('notification-1', 'tenant-1', {
      status: NotificationStatus.QUEUED,
      updatedBy: 'system',
    })
  })

  it('records the notification request ID before enqueueing and finalizes after queue success', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])

    await service.processAcceptedUsage(acceptedUsageInput)

    expect(limitAlertService.markNotificationCreated).toHaveBeenCalledWith(
      'alert-log-day',
      'notification-1',
    )
    expect(limitAlertService.markNotificationCreated.mock.invocationCallOrder[0]).toBeLessThan(
      ingestionQueue.add.mock.invocationCallOrder[0],
    )
    expect(ingestionQueue.add.mock.invocationCallOrder[0]).toBeLessThan(
      notificationService.update.mock.invocationCallOrder[0],
    )
    expect(notificationService.update.mock.invocationCallOrder[0]).toBeLessThan(
      limitAlertService.markEnqueued.mock.invocationCallOrder[0],
    )
    expect(limitAlertService.markEnqueued).toHaveBeenCalledWith('alert-log-day')
  })

  it('leaves a claim incomplete and resolves when notification creation fails', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])
    notificationService.create.mockRejectedValue(new Error('database unavailable'))

    await expect(service.processAcceptedUsage(acceptedUsageInput)).resolves.toBeUndefined()

    expect(limitAlertService.markNotificationCreated).not.toHaveBeenCalled()
    expect(ingestionQueue.add).not.toHaveBeenCalled()
    expect(limitAlertService.markEnqueued).not.toHaveBeenCalled()
  })

  it('records notification creation but does not mark enqueued when queueing fails', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])
    ingestionQueue.add.mockRejectedValue(new Error('redis unavailable'))

    await expect(service.processAcceptedUsage(acceptedUsageInput)).resolves.toBeUndefined()

    expect(limitAlertService.markNotificationCreated).toHaveBeenCalledWith(
      'alert-log-day',
      'notification-1',
    )
    expect(limitAlertService.markEnqueued).not.toHaveBeenCalled()
    expect(notificationService.update).not.toHaveBeenCalled()
  })

  it('continues processing claims after one claim fails', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning, annualSmsReached])
    notificationService.create
      .mockRejectedValueOnce(new Error('first create failed'))
      .mockResolvedValueOnce({ id: 'notification-2', createdAt: new Date() })

    await service.processAcceptedUsage(acceptedUsageInput)

    expect(notificationService.create).toHaveBeenCalledTimes(2)
    expect(ingestionQueue.add).toHaveBeenCalledTimes(1)
    expect(limitAlertService.markNotificationCreated).toHaveBeenCalledWith(
      'alert-log-year',
      'notification-2',
    )
    expect(limitAlertService.markEnqueued).toHaveBeenCalledWith('alert-log-year')
  })

  it('does not record API-key usage or invoke decorator request handling', async () => {
    limitAlertService.evaluateAndClaim.mockResolvedValue([dayWarning])

    await service.processAcceptedUsage(acceptedUsageInput)

    expect(Object.keys(service)).not.toContain('apiKeyUsageService')
    expect(Object.keys(service)).not.toContain('queueMap')
  })
})
