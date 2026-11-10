import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotifySubmissionService } from './notify-submission.service'
import { NotificationService } from '../../notification/notification.service'
import { NotificationRequestDetailService } from '../../notification/notification-request-detail.service'
import { ApiKeyUsageService } from '../../api-keys/api-key-usage.service'
import { SafelistService } from '../../safelist/safelist.service'
import { EventNotificationResolver } from '../../events/event-notification.resolver'
import { AttachmentValidationService } from './attachment-validation.service'
import { AttachmentProcessingService } from './attachment-processing.service'
import { LimitAlertNotificationService } from './limit-alert-notification.service'
import { SmsSegmentService } from './sms-segment.service'
import { NotificationDedupService } from './notification-dedup.service'
import { QueueName } from '../../../enum/queue-name.enum'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { UsagePeriodType } from '../../../enum/usage-period-type.enum'
import type { NotifySimpleRequest } from '../schemas/notify-simple-request'

// The HTTP behaviour of every send route is covered through the controllers in
// notify.controller.spec.ts; this covers acceptMerge as the GC Notify bulk route calls it.
describe('NotifySubmissionService', () => {
  let service: NotifySubmissionService
  const limitAlerts = { processAcceptedUsage: vi.fn() }

  const dto = {
    email: {
      recipients: { mergeArray: [['to'], ['alice@example.com']] },
      content: { templateId: 'tpl-1' },
    },
  } as unknown as NotifySimpleRequest

  beforeEach(async () => {
    limitAlerts.processAcceptedUsage.mockReset()

    const module = await Test.createTestingModule({
      providers: [
        NotifySubmissionService,
        {
          provide: NotificationService,
          useValue: {
            validateMailMergeRules: vi.fn().mockResolvedValue([]),
            parseMailMergeRecipients: vi
              .fn()
              .mockReturnValue([{ address: 'alice@example.com', params: {} }]),
            create: vi.fn().mockResolvedValue({ id: 'notif-1', createdAt: new Date() }),
            update: vi.fn(),
          },
        },
        {
          provide: ApiKeyUsageService,
          useValue: {
            assertWithinLimits: vi.fn(),
            recordUsage: vi.fn().mockResolvedValue([
              {
                periodTypeCode: UsagePeriodType.DAY,
                periodStart: new Date('2026-01-01'),
                sentCount: 90,
              },
            ]),
          },
        },
        { provide: SafelistService, useValue: { findBlocked: vi.fn().mockResolvedValue([]) } },
        { provide: NotificationDedupService, useValue: { enabled: false } },
        { provide: LimitAlertNotificationService, useValue: limitAlerts },
        { provide: QueueName.INGESTION, useValue: { name: 'ingestion', add: vi.fn() } },
        { provide: NotificationRequestDetailService, useValue: {} },
        { provide: AttachmentValidationService, useValue: {} },
        { provide: AttachmentProcessingService, useValue: {} },
        { provide: SmsSegmentService, useValue: {} },
        { provide: EventNotificationResolver, useValue: {} },
      ],
    }).compile()

    service = module.get(NotifySubmissionService)
  })

  const merge = (apiKeyConsumerId?: string) =>
    service.acceptMerge({
      tenantId: 'tenant-1',
      dto,
      channel: NotificationChannel.EMAIL,
      apiKeyConsumerId,
    })

  it('sends limit alerts for the usage an accepted merge records', async () => {
    const response = await merge('consumer-1')
    expect(response).toMatchObject({ notifyId: 'notif-1', recipientCount: 1 })
    expect(limitAlerts.processAcceptedUsage).toHaveBeenCalledWith({
      apiKeyConsumerId: 'consumer-1',
      usageResults: [expect.objectContaining({ channelCode: NotificationChannel.EMAIL })],
    })
  })

  it('sends no alert when the request has no API key to attribute usage to', async () => {
    await merge(undefined)
    expect(limitAlerts.processAcceptedUsage).not.toHaveBeenCalled()
  })
})
