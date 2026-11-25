import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotifySubmissionService } from './notify-submission.service'
import { NotificationService } from '../../notification/notification.service'
import { NotificationRequestDetailService } from '../../notification/notification-request-detail.service'
import { TenantUsageService } from '../../usage/tenant-usage.service'
import { SafelistService } from '../../safelist/safelist.service'
import { EventNotificationResolver } from '../../events/event-notification.resolver'
import { AttachmentValidationService } from './attachment-validation.service'
import { AttachmentProcessingService } from './attachment-processing.service'
import { LimitAlertNotificationService } from './limit-alert-notification.service'
import { SmsSegmentService } from './sms-segment.service'
import { NotificationDedupService } from './notification-dedup.service'
import { TenantsService } from '../../admin/tenants/tenants.service'
import { FeatureFlagService } from '../../feature-flag/feature-flag.service'
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

  const tenants = { assertCanSend: vi.fn().mockResolvedValue(undefined) }
  const featureFlags = { isEnabled: vi.fn() }
  const ingestionQueue = { name: 'ingestion', add: vi.fn() }
  const usage = {
    assertWithinLimits: vi.fn(),
    recordUsage: vi.fn(),
  }

  beforeEach(async () => {
    limitAlerts.processAcceptedUsage.mockReset()
    featureFlags.isEnabled.mockReset().mockResolvedValue(false)
    ingestionQueue.add.mockReset()
    usage.assertWithinLimits.mockReset().mockResolvedValue(undefined)
    usage.recordUsage.mockReset().mockResolvedValue([
      {
        periodTypeCode: UsagePeriodType.DAY,
        periodStart: new Date('2026-01-01'),
        sentCount: 90,
      },
    ])

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
        { provide: TenantUsageService, useValue: usage },
        { provide: SafelistService, useValue: { findBlocked: vi.fn().mockResolvedValue([]) } },
        { provide: NotificationDedupService, useValue: { enabled: false } },
        { provide: LimitAlertNotificationService, useValue: limitAlerts },
        { provide: QueueName.INGESTION, useValue: ingestionQueue },
        { provide: NotificationRequestDetailService, useValue: {} },
        { provide: AttachmentValidationService, useValue: {} },
        { provide: AttachmentProcessingService, useValue: {} },
        { provide: SmsSegmentService, useValue: {} },
        { provide: EventNotificationResolver, useValue: {} },
        { provide: TenantsService, useValue: tenants },
        { provide: FeatureFlagService, useValue: featureFlags },
      ],
    }).compile()

    service = module.get(NotifySubmissionService)
  })

  const merge = () =>
    service.acceptMerge({
      tenantId: 'tenant-1',
      dto,
      channel: NotificationChannel.EMAIL,
    })

  it('sends limit alerts for the usage an accepted merge records', async () => {
    const response = await merge()
    expect(response).toMatchObject({ notifyId: 'notif-1', recipientCount: 1 })
    expect(limitAlerts.processAcceptedUsage).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      usageResults: [expect.objectContaining({ channelCode: NotificationChannel.EMAIL })],
    })
  })

  // The GC Notify route calls acceptMerge directly, so it reads the flag itself.
  it.each([
    [false, 10],
    [true, 15],
  ])('queues a merge with priority lanes %s at priority %i', async (lanes, priority) => {
    featureFlags.isEnabled.mockResolvedValue(lanes)

    await merge()

    expect(featureFlags.isEnabled).toHaveBeenCalledWith('notification_priority', 'tenant-1')
    await vi.waitFor(() => {
      expect(ingestionQueue.add).toHaveBeenCalledWith(
        'ingestion',
        expect.any(Object),
        expect.objectContaining({ priority }),
      )
    })
  })

  it('rejects a send from a tenant an admin has disabled, before queueing anything', async () => {
    tenants.assertCanSend.mockRejectedValueOnce(
      new ForbiddenException('Sending is disabled for this tenant by the Notify team: Billing'),
    )

    await expect(merge()).rejects.toBeInstanceOf(ForbiddenException)
    expect(tenants.assertCanSend).toHaveBeenCalledWith('tenant-1')
    expect(limitAlerts.processAcceptedUsage).not.toHaveBeenCalled()
  })

  // A merge from the UI's bulk send carries no API key; it is still the tenant's usage.
  it("checks and counts a merge against the tenant's limits, with or without an API key", async () => {
    await merge()

    const entries = [{ channel: NotificationChannel.EMAIL, count: 1 }]
    expect(usage.assertWithinLimits).toHaveBeenCalledWith('tenant-1', entries)
    expect(usage.recordUsage).toHaveBeenCalledWith('tenant-1', NotificationChannel.EMAIL, 1)
  })

  it('rejects a merge over the tenant limit before anything is created or counted', async () => {
    usage.assertWithinLimits.mockRejectedValueOnce(
      new HttpException('EMAIL daily notification limit reached', HttpStatus.TOO_MANY_REQUESTS),
    )

    await expect(merge()).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS })
    expect(usage.recordUsage).not.toHaveBeenCalled()
    expect(limitAlerts.processAcceptedUsage).not.toHaveBeenCalled()
  })
})
